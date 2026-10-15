import base64
import copy
import hashlib
import json
import secrets
import tempfile
import unittest
from pathlib import Path
from cryptography.hazmat.primitives.asymmetric import ec
import jwt
from provider import Provider
from open_verifier import encode, public_id, state, verify


def key():
    return json.loads(jwt.algorithms.ECAlgorithm.to_jwk(ec.generate_private_key(ec.SECP256R1())))


def pub(k): return {n:k[n] for n in ('kty','crv','x','y')}


def signed(payload,k,typ):
    return jwt.encode(payload,jwt.PyJWK.from_dict(k).key,algorithm='ES256',headers={'typ':typ,'jwk':pub(k)})


def policy(name='Work',public=False):
    return {'display_name':name,'description':'fixture consulting','discovery_mode':'PUBLIC_SEARCHABLE' if public else 'UNLISTED',
      'contact_request_mode':'REQUEST_APPROVAL','allowed_content_types':['text'],
      'schedule':{'timezone':'UTC','weekdays':list(range(1,8)),'start':0,'end':1440},
      'outside_hours_behavior':'ACCEPT_AND_QUEUE','first_contact_message_limit':1,'inactivity_days':30,'expires_at':0,
      'notification_behavior':'SILENT_IN_APP','status':'ACTIVE','policy_version':1}


class Actor:
    def __init__(self,service,now,name='Work',public=False):
        self.controller=key();self.device=key();self.id=public_id(pub(self.controller))
        self.value={'v':1,'id':self.id,'device':pub(self.device),'revision':1,'issued':now,
                    'epoch':secrets.token_hex(16),'route':service.origin,'policy':policy(name,public)}
        self.sign_state()
    def sign_state(self): self.token=signed(self.value,self.controller,'pi-state+jws')
    def packet(self,service,request):
        _,nonce=service.handle('/v3/nonce',{})
        raw=json.dumps(request,separators=(',',':')).encode();at=int(service.clock())
        proof={'v':1,'iss':self.id,'aud':service.origin,'nonce':nonce['nonce'],'iat':at,'exp':at+60,
               'request_hash':encode(hashlib.sha256(raw).digest()),'state_hash':encode(hashlib.sha256(self.token.encode()).digest())}
        return {'state':self.token,'proof':signed(proof,self.device,'pi-proof+jws'),'request':encode(raw)}
    def call(self,service,request): return service.handle('/v3/command',self.packet(service,request))
    def slot(self):
        return signed({'v':1,'iss':self.id,'role':'owner','epoch':self.value['epoch'],'slot':secrets.token_hex(16),
                       'bundle':{'fixture':'synthetic bytes; not an E2EE test'}},self.controller,'pi-channel+jws')
    def grant(self,gid,peer,status='APPROVED',revision=1):
        return signed({'v':1,'iss':self.id,'aud':peer.id,'id':gid,'status':status,'revision':revision,
                       'expires':self.value['issued']+30*86400},self.controller,'pi-grant+jws')


class ProviderTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.now=1800000000
        self.a=Provider(str(Path(self.tmp.name)/'a.sqlite'),'https://provider-a.example',clock=lambda:self.now)
        self.b=Provider(str(Path(self.tmp.name)/'b.sqlite'),'https://provider-b.example',clock=lambda:self.now)
        self.alice=Actor(self.a,self.now,public=True);self.bob=Actor(self.a,self.now,'Personal')
    def tearDown(self): self.a.db.close();self.b.db.close();self.tmp.cleanup()
    def ok(self,actor,request,provider=None):
        code,result=actor.call(provider or self.a,request);self.assertEqual(200,code,(request.get('op'),result));return result
    def create(self):
        self.ok(self.alice,{'op':'publish','consent':True})
        self.ok(self.bob,{'op':'publish'})
        slot=self.alice.slot();self.ok(self.alice,{'op':'slots','slots':[slot]})
        gid=secrets.token_hex(16);r=self.ok(self.bob,{'op':'reserve','id':gid,'target':self.alice.id})
        c=verify(r['slot'],self.alice.id,'pi-channel+jws')
        channel=signed({'v':1,'iss':self.bob.id,'role':'peer','epoch':r['epoch'],'grant':gid,'slot':c['slot'],
                        'bundle':{'fixture':'not Signal'}},self.bob.controller,'pi-channel+jws')
        self.ok(self.bob,{'op':'bind','id':gid,'channel':channel})
        e=self.envelope();self.ok(self.bob,{'op':'intro','id':gid,'envelope':e})
        return gid
    def envelope(self): return {'id':secrets.token_hex(16),'kind':'text','body':base64.b64encode(secrets.token_bytes(64)).decode(),'expires':self.now+3600}
    def test_nonce_replay_tamper_wrong_controller_and_expiry(self):
        packet=self.alice.packet(self.a,{'op':'publish','consent':True})
        self.assertEqual(200,self.a.handle('/v3/command',packet)[0])
        self.assertEqual(401,self.a.handle('/v3/command',packet)[0])
        packet=self.alice.packet(self.a,{'op':'search','query':''});packet['request']=encode(b'{"op":"publish"}')
        self.assertEqual(401,self.a.handle('/v3/command',packet)[0])
        packet=self.alice.packet(self.a,{'op':'search','query':''});self.now+=61
        self.assertEqual(401,self.a.handle('/v3/command',packet)[0])
        packet=self.alice.packet(self.a,{'op':'search','query':''});packet['state']=self.bob.token
        self.assertNotEqual(200,self.a.handle('/v3/command',packet)[0])
    def test_public_consent_private_separation_and_no_owner_identifier(self):
        self.assertEqual(403,self.alice.call(self.a,{'op':'publish','consent':False})[0])
        self.ok(self.alice,{'op':'publish','consent':True});self.ok(self.bob,{'op':'publish'})
        found=self.ok(self.bob,{'op':'search','query':'consulting'})['states']
        self.assertEqual([self.alice.id],[state(t)['id'] for t in found])
        self.assertNotIn('account_id',json.dumps(found));self.assertNotEqual(self.alice.id,self.bob.id)
        self.assertEqual(404,self.alice.call(self.a,{'op':'lookup','target':self.bob.id})[0])
    def test_approval_queue_reject_and_revocation(self):
        gid=self.create();e=self.envelope()
        self.assertEqual(403,self.bob.call(self.a,{'op':'send','id':gid,'envelope':e})[0])
        grant=self.alice.grant(gid,self.bob);self.ok(self.alice,{'op':'decision','id':gid,'grant':grant})
        # Fixture timestamp is 08:00 UTC; a window 00:00–00:01 is closed.
        self.alice.value['policy']['schedule']['end']=1;self.alice.value['revision']+=1;self.alice.sign_state()
        self.ok(self.alice,{'op':'publish','consent':True})
        self.assertEqual('queued_until_open',self.ok(self.bob,{'op':'send','id':gid,'envelope':e})['status'])
        self.assertEqual([],self.ok(self.alice,{'op':'messages','id':gid})['messages'])
        self.alice.value['policy']['outside_hours_behavior']='REJECT';self.alice.value['revision']+=1;self.alice.sign_state()
        self.ok(self.alice,{'op':'publish','consent':True})
        self.assertEqual(403,self.bob.call(self.a,{'op':'send','id':gid,'envelope':self.envelope()})[0])
        revoke=self.alice.grant(gid,self.bob,'REVOKED',2);self.ok(self.alice,{'op':'decision','id':gid,'grant':revoke})
        self.assertEqual(403,self.bob.call(self.a,{'op':'send','id':gid,'envelope':self.envelope()})[0])
        self.assertEqual(0,self.a.db.execute('SELECT count(*) FROM messages').fetchone()[0])
    def test_device_rotation_rejects_old_authority_and_state_rollback(self):
        self.ok(self.alice,{'op':'publish','consent':True});old=copy.deepcopy(self.alice)
        self.alice.device=key();self.alice.value['device']=pub(self.alice.device);self.alice.value['revision']+=1;self.alice.sign_state()
        self.ok(self.alice,{'op':'publish','consent':True})
        self.assertEqual(409,old.call(self.a,{'op':'search','query':''})[0])
        forged=copy.deepcopy(self.alice);forged.device=old.device
        self.assertNotEqual(200,forged.call(self.a,{'op':'search','query':''})[0])
    def test_independent_provider_restores_signed_grant_without_old_database(self):
        gid=self.create();grant=self.alice.grant(gid,self.bob)
        self.ok(self.alice,{'op':'decision','id':gid,'grant':grant})
        old=self.alice.token
        self.alice.value['revision']+=1;self.alice.value['epoch']=secrets.token_hex(16);self.alice.value['route']=self.b.origin
        self.alice.device=key();self.alice.value['device']=pub(self.alice.device);self.alice.sign_state()
        self.ok(self.alice,{'op':'publish','consent':True},self.b)
        self.ok(self.alice,{'op':'slots','slots':[self.alice.slot()]},self.b)
        r=self.ok(self.alice,{'op':'restore','grant':grant,'peer_state':self.bob.token},self.b)
        self.assertEqual(gid,r['id']);self.assertEqual(self.alice.id,state(r['owner_state'])['id'])
        self.assertNotEqual(old,r['owner_state'])
        self.assertNotEqual(self.a.db,self.b.db)
        # Native migration suite separately demonstrates actual Signal messages and shutdown.
    def test_private_keys_and_raw_recovery_never_sent_to_service(self):
        self.ok(self.alice,{'op':'publish','consent':True})
        self.a.db.commit()
        for path in Path(self.tmp.name).iterdir():
            raw=path.read_bytes()
            self.assertNotIn(self.alice.controller['d'].encode(),raw)
            self.assertNotIn(self.alice.device['d'].encode(),raw)
        forged=signed(self.alice.value,self.bob.controller,'pi-state+jws')
        with self.assertRaises(ValueError): state(forged,self.alice.id)


if __name__=='__main__': unittest.main()
