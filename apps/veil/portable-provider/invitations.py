"""Optional pi/1 invitation service. No identity/key format change; opening never reserves access."""
import hashlib
import re

TOKEN=re.compile(r'^[A-Za-z0-9_-]{43}$')
SCHEMA='''
CREATE TABLE IF NOT EXISTS invitations(digest TEXT PRIMARY KEY,owner TEXT,expires INTEGER,access_seconds INTEGER,canceled INTEGER);
CREATE TABLE IF NOT EXISTS invitation_contacts(contact_id TEXT PRIMARY KEY,digest TEXT);
'''

def digest(token):
    if not isinstance(token,str) or not TOKEN.fullmatch(token): raise ValueError('invalid invitation')
    return hashlib.sha256(token.encode()).hexdigest()


def preview(provider,token,now):
    row=provider.db.execute('SELECT owner,expires,access_seconds,canceled FROM invitations WHERE digest=?',(digest(token),)).fetchone()
    if not row or row[3] or row[1]<=now: return None
    s,statement=provider.get_state(row[0]);provider.active(s,now)
    if s['route']!=provider.origin or s['policy']['contact_request_mode']=='DISABLED':return None
    return {'state':statement,'expires':row[1],'access_seconds':row[2]}


def create(provider,actor,request,now):
    d=digest(request['token']);expires=request['expires'];duration=request['access_seconds']
    if type(expires) is not int or not now<expires<=now+7*86400: raise ValueError('expiry')
    if type(duration) is not int or not 3600<=duration<=90*86400: raise ValueError('access duration')
    old=provider.db.execute('SELECT owner,expires,access_seconds,canceled FROM invitations WHERE digest=?',(d,)).fetchone()
    if old:
        if old!=(actor,expires,duration,0):raise ValueError('invitation conflict')
    else:
        if provider.db.execute('SELECT count(*) FROM invitations WHERE owner=?',(actor,)).fetchone()[0]>=16:raise ValueError('invitation quota')
        provider.db.execute('INSERT INTO invitations VALUES(?,?,?,?,0)',(d,actor,expires,duration))
    return {'expires':expires,'access_seconds':duration}


def cancel(provider,actor,token):
    d=digest(token)
    row=provider.db.execute('SELECT owner FROM invitations WHERE digest=?',(d,)).fetchone()
    if not row or row[0]!=actor:raise ValueError('invitation unavailable')
    provider.db.execute('UPDATE invitations SET canceled=1 WHERE digest=?',(d,))
    provider.db.execute("UPDATE contacts SET status='REJECTED' WHERE id IN (SELECT contact_id FROM invitation_contacts WHERE digest=?) AND status IN ('RESERVED','PENDING')",(d,))
    provider.db.execute("DELETE FROM messages WHERE grant_id IN (SELECT id FROM contacts WHERE status='REJECTED')")
    return {}


def access(provider,contact_id,now):
    row=provider.db.execute('SELECT i.expires,i.access_seconds,i.canceled FROM invitations i JOIN invitation_contacts c ON i.digest=c.digest WHERE c.contact_id=?',(contact_id,)).fetchone()
    return row
