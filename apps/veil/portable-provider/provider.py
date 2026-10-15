"""Isolated open-profile reference service. Each instance owns one SQLite DB/origin.
Only public signed identity state, authorization metadata and Signal ciphertext enter it.
"""
import base64
import hashlib
import json
import os
import re
import secrets
import sqlite3
import sys
import threading
import time
from pathlib import Path
from urllib.parse import urlsplit
from http.server import BaseHTTPRequestHandler

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'relay'))
from purpose_policy import validate as validate_policy, is_open
from server import BoundedHTTPServer
from open_verifier import PREFIX, encode, decode, state, verify, public_id, strict_json

HEX = re.compile(r'^[a-f0-9]{32}$')


def origin(value, local=False):
    u = urlsplit(value)
    if (u.scheme != 'https' and not (local and u.scheme == 'http' and u.hostname in ('127.0.0.1', 'localhost'))
            or not u.hostname or u.username or u.password or u.path or u.query or u.fragment):
        raise ValueError('HTTPS origin required')
    return value


class Denied(Exception):
    def __init__(self, code=403): self.code = code


class Provider:
    def __init__(self, database, service_origin, local=False, clock=time.time):
        self.origin = origin(service_origin, local); self.local = local; self.clock = clock
        self.db = sqlite3.connect(database, check_same_thread=False)
        self.lock = threading.RLock()
        self.db.executescript('''PRAGMA journal_mode=WAL; PRAGMA secure_delete=ON;
          CREATE TABLE IF NOT EXISTS schema_version(version INTEGER PRIMARY KEY);
          INSERT OR IGNORE INTO schema_version VALUES(1);
          CREATE TABLE IF NOT EXISTS states(id TEXT PRIMARY KEY, revision INTEGER, token TEXT, published INTEGER);
          CREATE TABLE IF NOT EXISTS nonces(value TEXT PRIMARY KEY, expires INTEGER);
          CREATE TABLE IF NOT EXISTS limits(bucket TEXT PRIMARY KEY, count INTEGER, expires INTEGER);
          CREATE TABLE IF NOT EXISTS slots(owner TEXT, id TEXT, epoch TEXT, token TEXT, used INTEGER, PRIMARY KEY(owner,id));
          CREATE TABLE IF NOT EXISTS contacts(id TEXT PRIMARY KEY, owner TEXT, peer TEXT, epoch TEXT, slot TEXT,
            channel TEXT, grant_token TEXT, status TEXT, expires INTEGER, activity INTEGER);
          CREATE TABLE IF NOT EXISTS messages(grant_id TEXT,id TEXT,sender TEXT,body TEXT,expires INTEGER,PRIMARY KEY(grant_id,id));
          CREATE TABLE IF NOT EXISTS receipts(grant_id TEXT,id TEXT,digest TEXT,expires INTEGER,PRIMARY KEY(grant_id,id));
        ''')

    def limit(self, bucket, n, seconds, now):
        key = bucket + ':' + str(now//seconds)
        row = self.db.execute('SELECT count FROM limits WHERE bucket=?', (key,)).fetchone()
        if row and row[0] >= n: raise Denied(429)
        if row: self.db.execute('UPDATE limits SET count=count+1 WHERE bucket=?', (key,))
        else: self.db.execute('INSERT INTO limits VALUES(?,1,?)', (key, (now//seconds+1)*seconds))

    def clean(self, now):
        self.db.execute('DELETE FROM nonces WHERE expires<=?', (now,))
        self.db.execute('DELETE FROM limits WHERE expires<=?', (now,))
        for table in ('messages', 'receipts'): self.db.execute(f'DELETE FROM {table} WHERE expires<=?', (now,))
        self.db.execute("UPDATE contacts SET status='EXPIRED' WHERE expires<=?", (now,))
        self.db.execute("DELETE FROM messages WHERE grant_id IN (SELECT id FROM contacts WHERE status IN ('EXPIRED','REVOKED','REJECTED','BLOCKED'))")

    def get_state(self, identifier):
        row = self.db.execute('SELECT token FROM states WHERE id=?', (identifier,)).fetchone()
        if not row: raise Denied(404)
        return state(row[0], identifier), row[0]

    def remember(self, token, now):
        s = state(token); p = validate_policy(s['policy'])
        if p['contact_request_mode']=='AUTO_ACCEPT_WITH_LIMITS': raise ValueError('signed approval required in this profile')
        origin(s['route'], self.local)
        if type(s['issued']) is not int or not 0 < s['issued'] <= now+60: raise ValueError('issued')
        old = self.db.execute('SELECT revision,token FROM states WHERE id=?', (s['id'],)).fetchone()
        if old:
            previous = state(old[1])
            if s['revision'] < old[0] or (s['revision'] == old[0] and s != previous): raise Denied(409)
            if previous['policy']['status'] == 'REVOKED' and s != previous: raise Denied()
            if s['revision'] > old[0]:
                self.db.execute('UPDATE states SET revision=?,token=?,published=0 WHERE id=?', (s['revision'], token, s['id']))
        else:
            if self.db.execute('SELECT count(*) FROM states').fetchone()[0] >= 1000: raise Denied(503)
            self.limit('new-state', 60, 3600, now)
            self.db.execute('INSERT INTO states VALUES(?,?,?,0)', (s['id'],s['revision'],token))
        if p['status'] == 'REVOKED' or (p['expires_at'] and p['expires_at'] <= now):
            self.db.execute("UPDATE contacts SET status='REVOKED' WHERE owner=?", (s['id'],))
            self.db.execute('DELETE FROM messages WHERE grant_id IN (SELECT id FROM contacts WHERE owner=?)',(s['id'],))
        return s

    def handle(self, path, data):
        with self.lock, self.db:
            now = int(self.clock()); self.clean(now)
            try:
                if path == '/v3/nonce':
                    self.limit('nonce', 600, 60, now)
                    if self.db.execute('SELECT count(*) FROM nonces').fetchone()[0] >= 2048: raise Denied(429)
                    nonce=secrets.token_urlsafe(32)
                    self.db.execute('INSERT INTO nonces VALUES(?,?)',(nonce,now+120))
                    return 200, {'nonce':nonce,'expires':now+120,'aud':self.origin}
                if path != '/v3/command': raise Denied(404)
                s=state(data['state']); proof=verify(data['proof'],public_id(s['device']),'pi-proof+jws')
                nonce=proof['nonce']; row=self.db.execute('SELECT expires FROM nonces WHERE value=?',(nonce,)).fetchone()
                if not row: raise Denied(401)
                # Consume even failed authorization attempts; transaction is committed on Denied.
                self.db.execute('DELETE FROM nonces WHERE value=?',(nonce,))
                if (proof.get('iss')!=s['id'] or proof.get('aud')!=self.origin
                        or type(proof.get('iat')) is not int or not now-60<=proof['iat']<=now+5
                        or type(proof.get('exp')) is not int or not now<proof['exp']<=min(row[0],proof['iat']+60)
                        or proof.get('state_hash')!=encode(hashlib.sha256(data['state'].encode()).digest())): raise Denied(401)
                request=decode(data['request'])
                if len(request)>128*1024 or proof.get('request_hash')!=encode(hashlib.sha256(request).digest()): raise Denied(401)
                request=strict_json(request)
                if not isinstance(request,dict): raise ValueError()
                self.limit('actor:'+s['id'],180,60,now)
                s=self.remember(data['state'],now)
                return 200,self.command(s,request,now)
            except Denied as e: return e.code,{'error':'request not permitted'}
            except (ValueError,KeyError,TypeError,IndexError,AttributeError,sqlite3.IntegrityError): return 400,{'error':'invalid request'}
            except Exception: return 400,{'error':'invalid signature or request'}

    def active(self, s, now):
        p=s['policy']
        if p['status']!='ACTIVE' or (p['expires_at'] and p['expires_at']<=now): raise Denied()
        return p

    def contact(self, identifier, actor, now):
        r=self.db.execute('SELECT id,owner,peer,epoch,slot,channel,grant_token,status,expires,activity FROM contacts WHERE id=?',(identifier,)).fetchone()
        if not r or actor not in r[1:3]: raise Denied(404)
        s,_=self.get_state(r[1]);p=s['policy']
        if now-r[9] >= p['inactivity_days']*86400:
            self.db.execute("UPDATE contacts SET status='EXPIRED' WHERE id=?",(identifier,))
            self.db.execute('DELETE FROM messages WHERE grant_id=?',(identifier,));raise Denied()
        return r,s

    def allocate(self, owner, epoch):
        row=self.db.execute('SELECT id,token FROM slots WHERE owner=? AND epoch=? AND used=0 ORDER BY id LIMIT 1',(owner,epoch)).fetchone()
        if not row: raise Denied(409)
        self.db.execute('UPDATE slots SET used=1 WHERE owner=? AND id=?',(owner,row[0]))
        return row

    def describe(self, r, actor):
        owner,owner_token=self.get_state(r[1]);_,peer_token=self.get_state(r[2])
        slot=self.db.execute('SELECT token FROM slots WHERE owner=? AND id=?',(r[1],r[4])).fetchone()
        return {'id':r[0],'owner':r[1],'peer':r[2],'epoch':r[3],'slot':slot[0], 'channel':r[5],
                'grant':r[6],'status':r[7], 'owner_state':owner_token,'peer_state':peer_token}

    def command(self,s,q,now):
        actor=s['id'];op=q['op']
        if op=='publish':
            if s['route']!=self.origin: raise Denied()
            public=s['policy']['discovery_mode']=='PUBLIC_SEARCHABLE'
            if public and q.get('consent') is not True: raise Denied()
            self.db.execute('UPDATE states SET published=? WHERE id=?',(int(public),actor))
            return {'status':'published' if public else 'unlisted'}
        if op=='search':
            self.limit('search:'+actor,30,60,now);query=q['query']
            if not isinstance(query,str) or len(query)>80: raise ValueError()
            found=[]
            for (token,) in self.db.execute('SELECT token FROM states WHERE published=1 ORDER BY id'):
                v=state(token);p=v['policy']
                if (v['route']==self.origin and p['status']=='ACTIVE' and (not p['expires_at'] or p['expires_at']>now)
                        and query.casefold() in (p['display_name']+' '+p['description']).casefold()): found.append(token)
            return {'states':found[:20]}
        if op=='lookup':
            v,token=self.get_state(q['target']);self.active(v,now)
            # Private facet is available only through a signed invitation/state card,
            # never this directory lookup. A card itself is the invitation capability.
            if v['policy']['discovery_mode']=='UNLISTED' and q.get('invitation')!=token and actor!=v['id']: raise Denied(404)
            return {'state':token}
        if op=='slots':
            self.active(s,now)
            if not isinstance(q['slots'],list) or not 1<=len(q['slots'])<=4: raise ValueError()
            for token in q['slots']:
                c=verify(token,actor,'pi-channel+jws')
                if c.get('role')!='owner' or c.get('epoch')!=s['epoch'] or c.get('iss')!=actor or not HEX.fullmatch(c['slot']): raise ValueError()
                if len(json.dumps(c['bundle']))>20000: raise ValueError()
                existing=self.db.execute('SELECT token FROM slots WHERE owner=? AND id=?',(actor,c['slot'])).fetchone()
                if existing:
                    if verify(existing[0],actor,'pi-channel+jws')!=c: raise Denied(409)
                else:
                    if self.db.execute('SELECT count(*) FROM slots WHERE owner=?',(actor,)).fetchone()[0]>=64: raise Denied(429)
                    self.db.execute('INSERT INTO slots VALUES(?,?,?,?,0)',(actor,c['slot'],s['epoch'],token))
            return {}
        if op=='reserve':
            target,target_token=self.get_state(q['target']);p=self.active(target,now)
            if target['route']!=self.origin or target['id']==actor or p['contact_request_mode']=='DISABLED': raise Denied()
            if p['discovery_mode']=='UNLISTED' and q.get('invitation')!=target_token: raise Denied(404)
            gid=q['id']
            if not HEX.fullmatch(gid): raise ValueError()
            existing=self.db.execute('SELECT peer,owner FROM contacts WHERE id=?',(gid,)).fetchone()
            if existing:
                if existing!=(actor,target['id']): raise Denied(409)
            else:
                if self.db.execute('SELECT 1 FROM contacts WHERE owner=? AND peer=?',(target['id'],actor)).fetchone(): raise Denied()
                self.limit('intro:'+actor,10,86400,now);self.limit('facet:'+target['id'],30,86400,now)
                if self.db.execute('SELECT count(*) FROM contacts').fetchone()[0]>=10000: raise Denied(503)
                slot,_=self.allocate(target['id'],target['epoch'])
                self.db.execute('INSERT INTO contacts VALUES(?,?,?,?,?,NULL,NULL,?,?,?)',(gid,target['id'],actor,target['epoch'],slot,'RESERVED',now+600,now))
            r,_=self.contact(gid,actor,now);return self.describe(r,actor)
        if op=='restore':
            # Only the unchanged controller can reintroduce its signed grants.
            grant=verify(q['grant'],actor,'pi-grant+jws');peer=state(q['peer_state'],grant['aud'])
            if s['route']!=self.origin or grant['iss']!=actor or grant['status']!='APPROVED' or not now<grant['expires']<=now+90*86400: raise Denied()
            self.remember(q['peer_state'],now)
            if not HEX.fullmatch(grant['id']): raise ValueError()
            if not self.db.execute('SELECT 1 FROM contacts WHERE id=?',(grant['id'],)).fetchone():
                slot,_=self.allocate(actor,s['epoch'])
                self.db.execute('INSERT INTO contacts VALUES(?,?,?,?,?,NULL,?,?,?,?)',(grant['id'],actor,peer['id'],s['epoch'],slot,q['grant'],'APPROVED',grant['expires'],now))
            r,_=self.contact(grant['id'],actor,now)
            if r[1]!=actor or r[2]!=peer['id'] or r[3]!=s['epoch'] or r[6]!=q['grant']: raise Denied(409)
            return self.describe(r,actor)
        if op=='list':
            rows=self.db.execute('SELECT id,owner,peer,epoch,slot,channel,grant_token,status,expires,activity FROM contacts WHERE owner=? OR peer=? LIMIT 32',(actor,actor)).fetchall()
            return {'contacts':[self.describe(r,actor) for r in rows]}
        r,owner=self.contact(q['id'],actor,now)
        if op=='contact': return self.describe(r,actor)
        p=owner['policy'] if op=='decision' else self.active(owner,now)
        if op=='decision' and actor==r[1] and r[6] and verify(q['grant'],r[1],'pi-grant+jws')==verify(r[6],r[1],'pi-grant+jws'):
            return {}  # Safe retry after a successful terminal decision with a lost response.
        if r[3]!=owner['epoch'] or r[7] in ('REVOKED','REJECTED','BLOCKED','EXPIRED') or r[8]<=now: raise Denied()
        if op=='bind':
            c=verify(q['channel'],r[2],'pi-channel+jws')
            if actor!=r[2] or c.get('iss')!=actor or c.get('role')!='peer' or c.get('epoch')!=r[3] or c.get('grant')!=r[0] or c.get('slot')!=r[4]: raise Denied()
            if r[5] and verify(r[5],actor,'pi-channel+jws')!=c: raise Denied(409)
            self.db.execute('UPDATE contacts SET channel=? WHERE id=?',(q['channel'],r[0]));return {}
        if op=='decision':
            g=verify(q['grant'],r[1],'pi-grant+jws')
            if actor!=r[1] or g.get('iss')!=actor or g.get('aud')!=r[2] or g.get('id')!=r[0] or g.get('status') not in ('APPROVED','REVOKED','REJECTED','BLOCKED'): raise Denied()
            if type(g.get('expires')) is not int or not now<g['expires']<=now+90*86400 or type(g.get('revision')) is not int: raise ValueError()
            previous=verify(r[6],r[1],'pi-grant+jws') if r[6] else None
            if previous and (g['revision']<previous['revision'] or (g['revision']==previous['revision'] and g!=previous)): raise Denied(409)
            self.db.execute('UPDATE contacts SET grant_token=?,status=?,expires=?,activity=? WHERE id=?',(q['grant'],g['status'],g['expires'],now,r[0]))
            if g['status']!='APPROVED': self.db.execute('DELETE FROM messages WHERE grant_id=?',(r[0],))
            return {}
        if op=='messages':
            if not is_open(p,now): return {'messages':[],'availability':'closed'}
            rows=self.db.execute('SELECT id,body,expires FROM messages WHERE grant_id=? AND sender!=? ORDER BY rowid LIMIT 1',(r[0],actor)).fetchall()
            return {'messages':[{'id':x[0],'body':x[1],'expires':x[2]} for x in rows]}
        if op=='ack':
            self.db.execute('DELETE FROM messages WHERE grant_id=? AND id=? AND sender!=?',(r[0],q['message'],actor));return {}
        if op not in ('intro','send'): raise Denied(404)
        if not r[5]: raise Denied(409)
        e=q['envelope'];mid=e['id']
        if not HEX.fullmatch(mid) or e.get('kind')!='text' or type(e['expires']) is not int or not now<e['expires']<=now+7*86400: raise ValueError()
        raw=base64.b64decode(e['body'],validate=True)
        if not 32<=len(raw)<=65536: raise ValueError()
        digest=encode(hashlib.sha256(json.dumps(e,sort_keys=True,separators=(',',':')).encode()).digest())
        old=self.db.execute('SELECT digest FROM receipts WHERE grant_id=? AND id=?',(r[0],mid)).fetchone()
        if old:
            if old[0]!=digest: raise Denied(409)
            return {'status':'accepted'}
        if op=='intro':
            if actor!=r[2] or r[7]!='RESERVED': raise Denied()
        elif r[7]!='APPROVED' or not r[6]: raise Denied()
        opened=is_open(p,now)
        if op!='intro' and not opened and p['outside_hours_behavior']=='REJECT': raise Denied()
        self.limit('send:'+r[0]+actor,30,60,now)
        if self.db.execute('SELECT count(*) FROM messages WHERE grant_id=?',(r[0],)).fetchone()[0]>=50: raise Denied(429)
        if self.db.execute('SELECT coalesce(sum(length(body)),0) FROM messages').fetchone()[0]+len(e['body'])>64*1024*1024: raise Denied(429)
        if self.db.execute('SELECT count(*) FROM receipts').fetchone()[0]>=50000: raise Denied(429)
        self.db.execute('INSERT INTO messages VALUES(?,?,?,?,?)',(r[0],mid,actor,e['body'],e['expires']))
        self.db.execute('INSERT INTO receipts VALUES(?,?,?,?)',(r[0],mid,digest,now+7*86400))
        if op=='intro': self.db.execute("UPDATE contacts SET status='PENDING',expires=? WHERE id=?",(now+30*86400,r[0]))
        self.db.execute('UPDATE contacts SET activity=? WHERE id=?',(now,r[0]))
        return {'status':'accepted' if opened else 'queued_until_open'}


def handler(provider):
    class Handler(BaseHTTPRequestHandler):
        def log_message(self,*_): pass
        def do_GET(self):
            if self.path=='/healthz': self.reply(200,{'status':'ok','profile':'pi/1'})
            else: self.reply(404,{'error':'not found'})
        def do_POST(self):
            try:
                n=int(self.headers.get('Content-Length','0'))
                if not 0<n<=512*1024: self.reply(413,{'error':'size'});return
                data=strict_json(self.rfile.read(n))
                if not isinstance(data,dict): raise ValueError()
                code,value=provider.handle(self.path,data);self.reply(code,value)
            except Exception: self.reply(400,{'error':'invalid request'})
        def reply(self,code,value):
            raw=json.dumps(value,separators=(',',':')).encode()
            self.send_response(code);self.send_header('Content-Type','application/json')
            self.send_header('Cache-Control','no-store');self.send_header('Content-Length',str(len(raw)))
            self.end_headers();self.wfile.write(raw)
    return Handler


if __name__=='__main__':
    p=Provider(os.environ['IDENTITY_DB'],os.environ['PUBLIC_ORIGIN'])
    BoundedHTTPServer((os.environ.get('BIND','127.0.0.1'),int(os.environ.get('PORT','8080'))),handler(p)).serve_forever()
