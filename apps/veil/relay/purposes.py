"""Additive purpose boundary. Call under Relay's transaction + lock, never /v1 capabilities."""
import base64
import hashlib
import hmac
import json
import re
import secrets
import time
from urllib.parse import urlsplit, parse_qs
from purpose_policy import validate, active, is_open, PolicyError

ID=re.compile(r'^[a-f0-9]{32}$')
TOKEN=re.compile(r'^[A-Za-z0-9_-]{43}$')
SCHEMA=(
 'CREATE TABLE IF NOT EXISTS purpose_schema(version INTEGER PRIMARY KEY)',
 'CREATE TABLE IF NOT EXISTS p_accounts(id TEXT PRIMARY KEY, auth TEXT UNIQUE NOT NULL, created BIGINT NOT NULL)',
 'CREATE TABLE IF NOT EXISTS p_facets(id TEXT PRIMARY KEY, owner TEXT NOT NULL, alias TEXT UNIQUE NOT NULL, invite TEXT NOT NULL, policy TEXT NOT NULL, created BIGINT NOT NULL, updated BIGINT NOT NULL)',
 'CREATE TABLE IF NOT EXISTS p_slots(id TEXT PRIMARY KEY, facet TEXT NOT NULL, bundle TEXT NOT NULL, claimed TEXT)',
 'CREATE TABLE IF NOT EXISTS p_grants(id TEXT PRIMARY KEY, facet TEXT NOT NULL, requester TEXT NOT NULL, requester_bundle TEXT NOT NULL, slot TEXT NOT NULL, status TEXT NOT NULL, version INTEGER NOT NULL, created BIGINT NOT NULL, last_active BIGINT NOT NULL, expires BIGINT NOT NULL, intro_hash TEXT)',
 'CREATE TABLE IF NOT EXISTS p_messages(grant_id TEXT NOT NULL, id TEXT NOT NULL, sender TEXT NOT NULL, body TEXT NOT NULL, kind TEXT NOT NULL, expires BIGINT NOT NULL, created BIGINT NOT NULL, PRIMARY KEY(grant_id,id))',
 'CREATE TABLE IF NOT EXISTS p_receipts(grant_id TEXT NOT NULL, id TEXT NOT NULL, digest TEXT NOT NULL, expires BIGINT NOT NULL, PRIMARY KEY(grant_id,id))',
 'CREATE TABLE IF NOT EXISTS p_limits(bucket TEXT PRIMARY KEY, count INTEGER NOT NULL, expires BIGINT NOT NULL)',
 'CREATE TABLE IF NOT EXISTS p_reports(facet TEXT NOT NULL, reporter TEXT NOT NULL, reason TEXT NOT NULL, created BIGINT NOT NULL, PRIMARY KEY(facet,reporter))',
 'CREATE INDEX IF NOT EXISTS p_grant_facet ON p_grants(facet)',
 'CREATE INDEX IF NOT EXISTS p_slot_facet ON p_slots(facet)',
 'CREATE INDEX IF NOT EXISTS p_message_expiry ON p_messages(expires)',
)

def digest(s): return hashlib.sha256(s.encode()).hexdigest()
def encoded(d): return json.dumps(d,separators=(',',':'),sort_keys=True)
def valid_id(x): return isinstance(x,str) and bool(ID.fullmatch(x))
def bundle(b):
    fields={'identity','registration','prekey','signed','signature','kyber','kyberSignature'}
    if not isinstance(b,dict) or set(b)!=fields: raise PolicyError('public bundle fields')
    if type(b['registration']) is not int or not 1<=b['registration']<=16380: raise PolicyError('registration')
    sizes={'identity':33,'prekey':33,'signed':33,'signature':64,'kyberSignature':64}
    for k in fields-{'registration'}:
        try: raw=base64.b64decode(b[k],validate=True)
        except (ValueError,TypeError): raise PolicyError('public key encoding')
        if (k in sizes and len(raw)!=sizes[k]) or (k=='kyber' and not 1000<=len(raw)<=2000): raise PolicyError('public key size')
    return encoded(b)

class Purposes:
    def __init__(self,db,clock=time.time):
        self.db=db; self.clock=clock
        with db:
            for sql in SCHEMA: db.execute(sql)
            db.execute('INSERT INTO purpose_schema(version) VALUES(1) ON CONFLICT(version) DO NOTHING')
    def limit(self,bucket,n,seconds,at):
        key=bucket+':'+str(at//seconds)
        row=self.db.execute('SELECT count FROM p_limits WHERE bucket=?',(key,)).fetchone()
        if row and row[0]>=n: return False
        self.db.execute('INSERT INTO p_limits VALUES(?,?,?) ON CONFLICT(bucket) DO UPDATE SET count=p_limits.count+1',(key,1,(at//seconds+1)*seconds))
        return True
    def listing(self,row,at):
        p=json.loads(row[4]); return {'id':row[0],'alias':row[2],'policy':p,'created_at':row[5],'updated_at':row[6],
                                     'requests_open':active(p,at) and p['contact_request_mode']!='DISABLED'}
    def facet(self,fid):
        return self.db.execute('SELECT id,owner,alias,invite,policy,created,updated FROM p_facets WHERE id=?',(fid,)).fetchone()
    def grant(self,gid):
        return self.db.execute('SELECT id,facet,requester,requester_bundle,slot,status,version,created,last_active,expires,intro_hash FROM p_grants WHERE id=?',(gid,)).fetchone()
    def clean(self,at):
        self.db.execute('DELETE FROM p_messages WHERE expires<=?',(at,))
        self.db.execute('DELETE FROM p_receipts WHERE expires<=?',(at,))
        self.db.execute('DELETE FROM p_limits WHERE expires<=?',(at,))
        self.db.execute('DELETE FROM p_reports WHERE created<=?',(at-30*86400,))
        # Small bounded pilot (max 1000 facets / 10000 grants); no unbounded scan.
        for g in self.db.execute("SELECT id,facet,status,last_active,expires,created FROM p_grants WHERE status IN ('RESERVED','PENDING','APPROVED')").fetchall():
            f=self.facet(g[1]); p=json.loads(f[4])
            expired=(g[4]<=at or g[3]+p['inactivity_days']*86400<=at or
                     bool(p['expires_at'] and p['expires_at']<=at) or (g[2]=='RESERVED' and g[5]+600<=at))
            if expired:
                self.db.execute("UPDATE p_grants SET status='EXPIRED' WHERE id=?",(g[0],))
                self.db.execute('DELETE FROM p_messages WHERE grant_id=?',(g[0],))
    def access(self,f,account,invite):
        p=json.loads(f[4])
        return f[1]==account or p['discovery_mode']!='UNLISTED' or (isinstance(invite,str) and TOKEN.fullmatch(invite) and hmac.compare_digest(f[3],digest(invite)))
    def handle(self,method,path,auth,data):
        at=int(self.clock()); self.clean(at)
        try: return self._handle(method,path,auth,data,at)
        except (PolicyError,ValueError,TypeError,KeyError): return 400,{'error':'invalid or unsupported purpose request'}
    def _handle(self,method,path,auth,data,at):
        u=urlsplit(path); parts=u.path.strip('/').split('/')
        if method=='GET' and u.path=='/v2/capabilities':
            return 200,{'version':1,'content_types':['text'],'recovery':False,'browser_messaging':False}
        if not TOKEN.fullmatch(auth): return 401,{'error':'device credential required'}
        a=self.db.execute('SELECT id FROM p_accounts WHERE auth=?',(digest(auth),)).fetchone()
        if method=='POST' and u.path=='/v2/accounts':
            if a: return 200,{'id':a[0]}
            if not self.limit('registration',60,3600,at): return 429,{'error':'registration limit'}
            if self.db.execute('SELECT count(*) FROM p_accounts').fetchone()[0]>=1000: return 503,{'error':'capacity'}
            aid=secrets.token_hex(16); self.db.execute('INSERT INTO p_accounts VALUES(?,?,?)',(aid,digest(auth),at))
            return 201,{'id':aid}
        if not a: return 401,{'error':'unknown device credential'}
        account=a[0]
        if not self.limit('api:'+account,180,60,at): return 429,{'error':'request limit'}
        if method=='POST' and u.path=='/v2/directory':
            if not self.limit('search:'+account,30,60,at): return 429,{'error':'search limit'}
            q=data.get('query','')
            if not isinstance(q,str): raise PolicyError('query')
            q=q.strip().casefold()
            if len(q)>80: raise PolicyError('query')
            rows=self.db.execute('SELECT id,owner,alias,invite,policy,created,updated FROM p_facets ORDER BY updated DESC').fetchall()
            result=[]
            for f in rows:
                p=json.loads(f[4])
                if p['discovery_mode']=='PUBLIC_SEARCHABLE' and active(p,at) and q in (p['display_name']+' '+p['description']+' '+f[2]).casefold(): result.append(self.listing(f,at))
                if len(result)==20: break
            return 200,{'listings':result}
        if method=='POST' and u.path=='/v2/lookup':
            alias=data.get('alias',''); f=self.db.execute('SELECT id,owner,alias,invite,policy,created,updated FROM p_facets WHERE alias=?',(alias,)).fetchone()
            if not f or not self.access(f,account,data.get('invite','')) or not active(json.loads(f[4]),at): return 404,{'error':'unavailable'}
            return 200,self.listing(f,at)
        if u.path=='/v2/facets':
            if method=='GET':
                rows=self.db.execute('SELECT id,owner,alias,invite,policy,created,updated FROM p_facets WHERE owner=? ORDER BY created',(account,)).fetchall()
                return 200,{'facets':[dict(self.listing(f,at),available_slots=self.db.execute('SELECT count(*) FROM p_slots WHERE facet=? AND claimed IS NULL',(f[0],)).fetchone()[0]) for f in rows]}
            if method=='POST':
                fid=data['id']; p=validate(data['policy']); invite=data['invite']
                if not valid_id(fid) or not TOKEN.fullmatch(invite) or p['status']!='ACTIVE' or p['policy_version']!=1: raise PolicyError('creation')
                old=self.facet(fid)
                if old: return (200,self.listing(old,at)) if old[1]==account and old[4]==encoded(p) and old[3]==digest(invite) else (409,{'error':'creation conflict'})
                if p['discovery_mode']=='PUBLIC_SEARCHABLE' and data.get('publish_confirmed') is not True: return 409,{'error':'publication consent required'}
                if self.db.execute('SELECT count(*) FROM p_facets WHERE owner=?',(account,)).fetchone()[0]>=8 or self.db.execute('SELECT count(*) FROM p_facets').fetchone()[0]>=1000: return 429,{'error':'purpose limit'}
                self.db.execute('INSERT INTO p_facets VALUES(?,?,?,?,?,?,?)',(fid,account,'p-'+secrets.token_hex(16),digest(invite),encoded(p),at,at))
                return 201,self.listing(self.facet(fid),at)
        if len(parts)>=3 and parts[:2]==['v2','facets']:
            f=self.facet(parts[2])
            if not f: return 404,{'error':'unavailable'}
            p=json.loads(f[4])
            if len(parts)==4 and parts[3]=='report' and method=='POST':
                reason=data.get('reason')
                if reason not in ('SPAM','IMPERSONATION','ABUSE'): raise PolicyError('reason')
                if not self.limit('report:'+account,5,86400,at): return 429,{'error':'report limit'}
                self.db.execute('INSERT INTO p_reports VALUES(?,?,?,?) ON CONFLICT(facet,reporter) DO NOTHING',(f[0],account,reason,at))
                return 202,{'status':'recorded_for_operator_review'}
            if len(parts)==4 and parts[3]=='reserve' and method=='POST':
                if not self.access(f,account,data.get('invite','')) or not active(p,at) or p['contact_request_mode']=='DISABLED': return 404,{'error':'requests unavailable'}
                if account==f[1]: return 409,{'error':'cannot contact own purpose'}
                gid=data['id']; b=bundle(data['bundle'])
                if not valid_id(gid): raise PolicyError('id')
                old=self.grant(gid)
                if old:
                    if old[2]!=account or old[1]!=f[0] or old[3]!=b or old[5] not in ('RESERVED','PENDING','APPROVED'): return 409,{'error':'request conflict'}
                    slot=self.db.execute('SELECT id,bundle FROM p_slots WHERE id=?',(old[4],)).fetchone()
                    return 200,dict(self.listing(f,at),grant=gid,slot=slot[0],bundle=json.loads(slot[1]))
                # One request per account/facet for the pilot, including rejected/blocked attempts.
                if self.db.execute('SELECT 1 FROM p_grants WHERE facet=? AND requester=?',(f[0],account)).fetchone(): return 403,{'error':'contact already requested'}
                if not self.limit('introduce:'+account,10,86400,at) or not self.limit('introductions:'+f[0],30,86400,at): return 429,{'error':'introduction limit'}
                if self.db.execute('SELECT count(*) FROM p_grants').fetchone()[0]>=10000: return 503,{'error':'capacity'}
                slot=self.db.execute('SELECT id,bundle FROM p_slots WHERE facet=? AND claimed IS NULL ORDER BY id LIMIT 1',(f[0],)).fetchone()
                if not slot: return 409,{'error':'owner needs to replenish contact invitations'}
                self.db.execute('UPDATE p_slots SET claimed=? WHERE id=?',(gid,slot[0]))
                self.db.execute('INSERT INTO p_grants VALUES(?,?,?,?,?,?,?,?,?,?,?)',(gid,f[0],account,b,slot[0],'RESERVED',p['policy_version'],at,at,at+90*86400,None))
                return 201,dict(self.listing(f,at),grant=gid,slot=slot[0],bundle=json.loads(slot[1]))
            if f[1]!=account: return 404,{'error':'unavailable'}
            if len(parts)==3 and method=='PUT':
                new=validate(data['policy'])
                if p['status']=='REVOKED': return 409,{'error':'revocation is permanent'}
                if new['policy_version']!=p['policy_version']+1: return 409,{'error':'stale policy version'}
                if new['discovery_mode']=='PUBLIC_SEARCHABLE' and data.get('publish_confirmed') is not True: return 409,{'error':'publication consent required'}
                self.db.execute('UPDATE p_facets SET policy=?,updated=? WHERE id=?',(encoded(new),at,f[0]))
                self.db.execute('UPDATE p_grants SET version=? WHERE facet=?',(new['policy_version'],f[0]))
                if new['status']=='REVOKED':
                    self.db.execute("UPDATE p_grants SET status='REVOKED' WHERE facet=?",(f[0],))
                    self.db.execute('DELETE FROM p_slots WHERE facet=? AND claimed IS NULL',(f[0],))
                if new['status']=='REVOKED' or new['allowed_content_types']!=p['allowed_content_types']:
                    self.db.execute('DELETE FROM p_messages WHERE grant_id IN (SELECT id FROM p_grants WHERE facet=?)',(f[0],))
                return 200,self.listing(self.facet(f[0]),at)
            if len(parts)==4 and parts[3]=='slots' and method=='POST':
                if not active(p,at): return 409,{'error':'purpose inactive'}
                slots=data['slots']
                if not isinstance(slots,list) or not 1<=len(slots)<=8: raise PolicyError('slots')
                validated=[(s['id'],bundle(s['bundle'])) for s in slots]
                if any(not valid_id(s[0]) for s in validated): raise PolicyError('slot id')
                # Bound lifetime key material, including consumed slots, for this pilot.
                if len({sid for sid,_ in validated})!=len(validated): raise PolicyError('duplicate slots')
                additions=sum(self.db.execute('SELECT 1 FROM p_slots WHERE id=?',(sid,)).fetchone() is None for sid,_ in validated)
                if self.db.execute('SELECT count(*) FROM p_slots WHERE facet=?',(f[0],)).fetchone()[0]+additions>64: return 429,{'error':'slot capacity'}
                for sid,b in validated:
                    old=self.db.execute('SELECT facet,bundle FROM p_slots WHERE id=?',(sid,)).fetchone()
                    if old and (old[0]!=f[0] or old[1]!=b): return 409,{'error':'slot conflict'}
                for sid,b in validated: self.db.execute('INSERT INTO p_slots VALUES(?,?,?,NULL) ON CONFLICT(id) DO NOTHING',(sid,f[0],b))
                return 200,{}
        if method=='GET' and u.path=='/v2/grants':
            rows=self.db.execute('SELECT g.id,g.facet,g.requester,g.requester_bundle,g.slot,g.status,g.version,g.created,g.last_active,g.expires,g.intro_hash FROM p_grants g JOIN p_facets f ON g.facet=f.id WHERE (g.requester=? OR f.owner=?) ORDER BY g.created DESC LIMIT 100',(account,account)).fetchall()
            result=[]
            for g in rows:
                f=self.facet(g[1]); owner=f[1]==account
                if owner and g[5]=='RESERVED': continue
                result.append({'id':g[0],'facet':g[1],'slot':g[4],'status':g[5],'owner':owner,'policy_version':g[6],
                               'policy':json.loads(f[4]),'bundle':json.loads(g[3]) if owner else None,'created_at':g[7],'expires_at':g[9]})
            return 200,{'grants':result}
        if len(parts)>=3 and parts[:2]==['v2','grants']:
            g=self.grant(parts[2])
            if not g: return 404,{'error':'unavailable'}
            f=self.facet(g[1]); p=json.loads(f[4]); owner=f[1]==account
            if account not in (g[2],f[1]): return 404,{'error':'unavailable'}
            if len(parts)==4 and parts[3]=='decision' and method=='POST':
                if not owner: return 403,{'error':'owner permission required'}
                status=data['status']
                if status not in ('APPROVED','REJECTED','BLOCKED','REVOKED'): raise PolicyError('decision')
                if g[5] in ('REJECTED','BLOCKED','REVOKED','EXPIRED','RESERVED') or not active(p,at): return 409,{'error':'grant not actionable'}
                self.db.execute('UPDATE p_grants SET status=?,version=?,last_active=? WHERE id=?',(status,p['policy_version'],at,g[0]))
                if status!='APPROVED': self.db.execute('DELETE FROM p_messages WHERE grant_id=?',(g[0],))
                return 200,{'status':status}
            if len(parts)>=4 and parts[3] in ('messages','introduction'):
                intro=parts[3]=='introduction'
                if method=='DELETE' and len(parts)==5 and not intro:
                    self.db.execute('DELETE FROM p_messages WHERE grant_id=? AND id=? AND sender<>?',(g[0],parts[4],account))
                    return 200,{}
                if method=='GET' and len(parts)==4 and not intro:
                    if g[5] not in ('PENDING','APPROVED') or not active(p,at) or not is_open(p,at): return 200,{'messages':[],'availability':'closed'}
                    rows=self.db.execute('SELECT id,body,kind,expires FROM p_messages WHERE grant_id=? AND sender<>? ORDER BY created,id LIMIT 1',(g[0],account)).fetchall()
                    return 200,{'messages':[dict(id=r[0],body=r[1],kind=r[2],expires=r[3]) for r in rows],'availability':'open'}
                if method=='PUT' and ((intro and len(parts)==4) or (not intro and len(parts)==5)):
                    mid=data.get('id') if intro else parts[4]
                    if not valid_id(mid): raise PolicyError('message id')
                    body=data['body']; kind=data['kind']; expiry=data['expires']
                    if kind not in p['allowed_content_types']: return 403,{'error':'content type denied'}
                    if type(expiry) is not int or not at<expiry<=at+7*86400: raise PolicyError('expiry')
                    raw=base64.b64decode(body,validate=True)
                    if not 32<=len(raw)<=65536: raise PolicyError('envelope size')
                    if not active(p,at) or g[5] in ('REVOKED','BLOCKED','REJECTED','EXPIRED'): return 403,{'error':'access unavailable'}
                    receipt=self.db.execute('SELECT digest FROM p_receipts WHERE grant_id=? AND id=?',(g[0],mid)).fetchone()
                    if receipt: return (200,{'status':'accepted'}) if receipt[0]==digest(encoded(data)) else (409,{'error':'message conflict'})
                    if intro:
                        if owner or g[5]!='RESERVED' or p['contact_request_mode']=='DISABLED': return 403,{'error':'introduction already used or disabled'}
                    elif g[5]!='APPROVED': return 403,{'error':'approval required'}
                    # Intro submission is allowed any time; attention/display still follows hours.
                    if not intro and not is_open(p,at) and p['outside_hours_behavior']=='REJECT': return 403,{'error':'outside permitted hours'}
                    if self.db.execute('SELECT count(*) FROM p_receipts').fetchone()[0]>=50000: return 429,{'error':'receipt capacity'}
                    if not self.limit('send:'+g[0]+':'+account,30,60,at): return 429,{'error':'message rate limit'}
                    if self.db.execute('SELECT count(*) FROM p_messages WHERE grant_id=?',(g[0],)).fetchone()[0]>=50 or self.db.execute('SELECT coalesce(sum(length(body)),0) FROM p_messages').fetchone()[0]+len(body)>64*1024*1024: return 429,{'error':'queue full'}
                    self.db.execute('INSERT INTO p_messages VALUES(?,?,?,?,?,?,?)',(g[0],mid,account,body,kind,expiry,at))
                    self.db.execute('INSERT INTO p_receipts VALUES(?,?,?,?)',(g[0],mid,digest(encoded(data)),expiry))
                    if intro:
                        status='APPROVED' if p['contact_request_mode']=='AUTO_ACCEPT_WITH_LIMITS' else 'PENDING'
                        self.db.execute('UPDATE p_grants SET status=?,intro_hash=? WHERE id=?',(status,digest(body),g[0]))
                    self.db.execute('UPDATE p_grants SET last_active=? WHERE id=?',(at,g[0]))
                    return 201,{'status':'accepted' if is_open(p,at) else 'queued_until_open'}
        return 404,{'error':'not found'}
