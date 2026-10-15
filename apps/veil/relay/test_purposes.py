"""Real persistence/authorization tests. Synthetic envelopes are NOT an E2EE demo."""
import base64
import copy
import json
import os
import secrets
import tempfile
import threading
import unittest
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor
from server import Relay
from purpose_policy import validate, is_open, PolicyError


def ts(s): return int(datetime.fromisoformat(s).timestamp())
def policy(**kw):
    p=dict(display_name='Consulting',description='Independent advice',discovery_mode='PUBLIC_SEARCHABLE',
           contact_request_mode='REQUEST_APPROVAL',allowed_content_types=['text'],
           schedule=dict(timezone='Asia/Kolkata',weekdays=[1,2,3,4,5],start=540,end=1080),
           outside_hours_behavior='ACCEPT_AND_QUEUE',first_contact_message_limit=1,inactivity_days=30,
           expires_at=0,notification_behavior='SILENT_IN_APP',status='ACTIVE',policy_version=1)
    p.update(kw);return p

def fixture_bundle():
    b={k:base64.b64encode(secrets.token_bytes(n)).decode() for k,n in dict(identity=33,prekey=33,signed=33,signature=64,kyber=1569,kyberSignature=64).items()}
    b['registration']=7;return b

class ScheduleTests(unittest.TestCase):
    def test_kolkata_half_open_boundaries_and_weekend(self):
        p=validate(policy())
        for moment,expected in [('2026-10-19T03:29:59+00:00',False),('2026-10-19T03:30:00+00:00',True),
                                ('2026-10-19T12:29:59+00:00',True),('2026-10-19T12:30:00+00:00',False),('2026-10-18T06:00:00+00:00',False)]:
            self.assertEqual(is_open(p,ts(moment)),expected)
    def test_auckland_dst_gap_and_repeat(self):
        p=policy(schedule=dict(timezone='Pacific/Auckland',weekdays=[7],start=120,end=180))
        # Spring forward skips 02:00 entirely; autumn repeats it, both occurrences are open.
        for moment,expected in [('2026-09-26T13:59:59+00:00',False),('2026-09-26T14:00:00+00:00',False),
                                ('2026-04-04T13:30:00+00:00',True),('2026-04-04T14:30:00+00:00',True),('2026-04-04T15:00:00+00:00',False)]:
            self.assertEqual(is_open(p,ts(moment)),expected,moment)
    def test_invalid_rules_fail_closed(self):
        for change in [dict(schedule=dict(timezone='India',weekdays=[1],start=540,end=1080)),
                       dict(first_contact_message_limit=True),dict(allowed_content_types=['text','files']),
                       dict(schedule=dict(timezone='UTC',weekdays=[],start=0,end=1440)),
                       dict(schedule=dict(timezone='UTC',weekdays=[1],start=1080,end=540)),dict(unrecognized='allow all')]:
            with self.assertRaises(PolicyError):validate(policy(**change))

class PurposeTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory(); self.path=self.tmp.name+'/db'
        self.database_url=os.environ.get('TEST_DATABASE_URL')
        self.r=Relay(self.path,database_url=self.database_url)
        if self.database_url:
            with self.r.db:
                for name in ('p_accounts','p_facets','p_grants','p_slots','p_messages','p_receipts','p_limits','p_reports'):
                    self.r.db.execute('DELETE FROM '+name)
        self.at=ts('2026-10-19T06:00:00+00:00');self.r.purposes.clock=lambda:self.at
        self.owner,self.visitor,self.stranger=[secrets.token_urlsafe(32) for _ in range(3)]
        for token in (self.owner,self.visitor,self.stranger): self.assertEqual(self.call('POST','/accounts',token)[0],201)
        self.fid=secrets.token_hex(16); self.invite=secrets.token_urlsafe(32)
        code,self.f=self.call('POST','/facets',self.owner,dict(id=self.fid,invite=self.invite,policy=policy(),publish_confirmed=True));self.assertEqual(code,201)
        self.add_slots(8)
    def tearDown(self):self.r.db.close();self.tmp.cleanup()
    def call(self,m,p,t=None,d=None):return self.r.handle(m,'/v2'+p,t or '',d or {})
    def add_slots(self,n):
        self.assertEqual(self.call('POST','/facets/'+self.fid+'/slots',self.owner,{'slots':[dict(id=secrets.token_hex(16),bundle=fixture_bundle()) for _ in range(n)]})[0],200)
    def reserve(self,token=None,gid=None):
        gid=gid or secrets.token_hex(16)
        code,result=self.call('POST','/facets/'+self.fid+'/reserve',token or self.visitor,dict(id=gid,bundle=fixture_bundle()))
        return gid,code,result
    def envelope(self,mid=None):return dict(id=mid or secrets.token_hex(16),kind='text',body=base64.b64encode(secrets.token_bytes(128)).decode(),expires=self.at+7*86400)
    def intro(self,token=None):
        gid,code,_=self.reserve(token);self.assertEqual(code,201)
        env=self.envelope();self.assertEqual(self.call('PUT','/grants/'+gid+'/introduction',token or self.visitor,env)[0],201)
        return gid,env
    def decide(self,gid,status='APPROVED'):return self.call('POST','/grants/'+gid+'/decision',self.owner,dict(status=status))
    def update(self,**kw):
        p=policy(**kw);p['policy_version']=json.loads(self.r.purposes.facet(self.fid)[4])['policy_version']+1
        return self.call('PUT','/facets/'+self.fid,self.owner,dict(policy=p,publish_confirmed=True))
    def test_no_phone_and_no_public_account_identifier(self):
        for path in ('/directory?q=consult','/facets'):
            code,result=self.call('GET',path,self.owner);self.assertEqual(code,200)
            rendered=json.dumps(result)
            for name in ('account_id','owner','auth','email','phone','requester'):self.assertNotIn('"'+name+'"',rendered)
            self.assertNotIn(self.owner,rendered)
        self.assertEqual(self.call('POST','/accounts',self.owner)[0],200)
    def test_private_and_link_only_discovery(self):
        ids=[]
        for mode in ('UNLISTED','LINK_ONLY'):
            fid=secrets.token_hex(16);ids.append(fid)
            code,f=self.call('POST','/facets',self.owner,dict(id=fid,invite=self.invite,policy=policy(discovery_mode=mode)));self.assertEqual(code,201)
            self.assertNotIn(fid,json.dumps(self.call('GET','/directory',self.visitor)[1]))
            code,_=self.call('POST','/lookup',self.visitor,dict(alias=f['alias']))
            self.assertEqual(code,404 if mode=='UNLISTED' else 200)
            self.assertEqual(self.call('POST','/lookup',self.visitor,dict(alias=f['alias'],invite=self.invite))[0],200)
        self.assertEqual(len(set(ids+[self.fid])),3)
    def test_publication_requires_consent_and_edit_is_scoped(self):
        self.assertEqual(self.call('POST','/facets',self.owner,dict(id=secrets.token_hex(16),invite=self.invite,policy=policy()))[0],409)
        other=secrets.token_hex(16)
        self.call('POST','/facets',self.owner,dict(id=other,invite=self.invite,policy=policy(discovery_mode='UNLISTED')))
        self.update(status='PAUSED')
        self.assertEqual(json.loads(self.r.purposes.facet(other)[4])['status'],'ACTIVE')
        self.assertEqual(self.call('GET','/directory',self.visitor)[1]['listings'],[])
    def test_request_is_one_intro_not_unlimited_access_and_foreign_account_denied(self):
        gid,env=self.intro();path='/grants/'+gid+'/messages/'+secrets.token_hex(16)
        self.assertEqual(self.call('PUT',path,self.visitor,self.envelope())[0],403)
        self.assertEqual(self.call('PUT','/grants/'+gid+'/introduction',self.visitor,env)[0],200)
        self.assertEqual(self.call('PUT','/grants/'+gid+'/introduction',self.visitor,self.envelope())[0],403)
        self.assertEqual(self.call('GET','/grants/'+gid+'/messages',self.stranger)[0],404)
        self.assertEqual(self.call('POST','/grants/'+gid+'/decision',self.visitor,dict(status='APPROVED'))[0],403)
        self.assertEqual(self.decide(gid)[0],200)
        self.assertEqual(self.call('PUT',path,self.visitor,self.envelope())[0],201)
    def test_grant_cannot_target_other_facet(self):
        gid,_=self.intro();self.decide(gid)
        other=secrets.token_hex(16)
        self.assertEqual(self.call('PUT','/grants/'+other+'/messages/'+secrets.token_hex(16),self.visitor,self.envelope())[0],404)
        self.assertEqual(self.call('PUT','/facets/'+self.fid,self.visitor,dict(policy=policy(policy_version=2),publish_confirmed=True))[0],404)
    def test_queued_ciphertext_uses_current_hours_and_survives_restart(self):
        gid,_=self.intro();self.decide(gid)
        self.at=ts('2026-10-19T18:00:00+00:00');env=self.envelope()
        self.assertEqual(self.call('PUT','/grants/'+gid+'/messages/'+env['id'],self.visitor,env)[1]['status'],'queued_until_open')
        self.assertEqual(self.call('GET','/grants/'+gid+'/messages',self.owner)[1]['messages'],[])
        self.r.db.close();self.r=Relay(self.path,database_url=self.database_url);self.r.purposes.clock=lambda:self.at
        self.at=ts('2026-10-20T03:30:00+00:00')
        self.assertTrue(self.call('GET','/grants/'+gid+'/messages',self.owner)[1]['messages'])
    def test_reject_never_stores_outside_hours(self):
        gid,_=self.intro();self.decide(gid);self.update(outside_hours_behavior='REJECT')
        self.at=ts('2026-10-19T18:00:00+00:00');env=self.envelope()
        self.assertEqual(self.call('PUT','/grants/'+gid+'/messages/'+env['id'],self.visitor,env)[0],403)
        self.assertIsNone(self.r.db.execute('SELECT id FROM p_messages WHERE id=?',(env['id'],)).fetchone())
    def test_revoke_block_expire_and_pause_stop_old_clients(self):
        gid,_=self.intro();self.decide(gid);env=self.envelope();path='/grants/'+gid+'/messages/'+env['id']
        self.update(status='PAUSED');self.assertEqual(self.call('PUT',path,self.visitor,env)[0],403)
        self.assertEqual(self.call('GET','/grants/'+gid+'/messages',self.owner)[1]['messages'],[])
        self.update(status='ACTIVE');self.assertEqual(self.call('PUT',path,self.visitor,env)[0],201)
        self.assertEqual(self.decide(gid,'REVOKED')[0],200)
        self.assertEqual(self.call('PUT',path,self.visitor,env)[0],403)
        self.assertEqual(self.r.db.execute('SELECT count(*) FROM p_messages WHERE grant_id=?',(gid,)).fetchone()[0],0)
        gid2,_=self.intro(self.stranger);self.decide(gid2,'BLOCKED')
        self.assertEqual(self.reserve(self.stranger)[1],403)
    def test_inactivity_and_purpose_expiration(self):
        gid,_=self.intro();self.decide(gid)
        self.at+=31*86400
        self.assertEqual(self.call('PUT','/grants/'+gid+'/messages/'+secrets.token_hex(16),self.visitor,self.envelope())[0],403)
        self.assertEqual(self.r.purposes.grant(gid)[5],'EXPIRED')
        self.update(expires_at=self.at+60);self.at+=60
        self.assertEqual(self.call('GET','/directory',self.visitor)[1]['listings'],[])
    def test_parallel_requests_cannot_exceed_single_introduction(self):
        with ThreadPoolExecutor(max_workers=8) as pool:
            codes=list(pool.map(lambda _:self.reserve()[1],range(8)))
        self.assertEqual(codes.count(201),1)
        self.assertEqual(self.r.db.execute('SELECT count(*) FROM p_grants WHERE facet=?',(self.fid,)).fetchone()[0],1)
    def test_declared_content_and_stale_policy_rejected(self):
        gid,_=self.intro();self.decide(gid);env=self.envelope();env['kind']='video'
        self.assertEqual(self.call('PUT','/grants/'+gid+'/messages/'+env['id'],self.visitor,env)[0],403)
        self.assertEqual(self.call('PUT','/facets/'+self.fid,self.owner,dict(policy=policy(),publish_confirmed=True))[0],409)
    def test_abuse_and_search_throttling(self):
        for _ in range(30):self.assertEqual(self.call('GET','/directory',self.visitor)[0],200)
        self.assertEqual(self.call('GET','/directory',self.visitor)[0],429)
        self.assertEqual(self.call('POST','/facets/'+self.fid+'/report',self.visitor,dict(reason='SPAM'))[0],202)
    def test_no_plaintext_or_raw_auth_in_storage(self):
        gid,env=self.intro()
        self.assertEqual(self.r.db.execute('SELECT body FROM p_messages WHERE grant_id=?',(gid,)).fetchone()[0],env['body'])
        self.assertNotEqual(self.r.db.execute('SELECT auth FROM p_accounts LIMIT 1').fetchone()[0],self.owner)
    def test_reservation_expiry_does_not_reissue_prekey(self):
        gid,code,res=self.reserve();self.assertEqual(code,201)
        self.at+=601;self.call('GET','/grants',self.owner)
        self.assertEqual(self.r.purposes.grant(gid)[5],'EXPIRED')
        _,_,other=self.reserve(self.stranger);self.assertNotEqual(other['slot'],res['slot'])
