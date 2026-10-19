import copy
import json
import secrets
import unittest
from pathlib import Path
import test_provider as fixtures
from test_provider import Actor,policy,signed
from open_verifier import state,verify

class InvitationTests(unittest.TestCase):
    setUp=fixtures.ProviderTests.setUp
    tearDown=fixtures.ProviderTests.tearDown
    ok=fixtures.ProviderTests.ok
    envelope=fixtures.ProviderTests.envelope
    def invite(self):
        self.ok(self.alice,{'op':'publish','consent':True})
        self.ok(self.alice,{'op':'slots','slots':[self.alice.slot(),self.alice.slot()]})
        token=secrets.token_urlsafe(32)
        request={'op':'invite','token':token,'expires':self.now+7*86400,'access_seconds':7*86400}
        self.ok(self.alice,request);return token,request
    def reserve(self,token):
        gid=secrets.token_hex(16)
        r=self.ok(self.bob,{'op':'reserve','id':gid,'target':self.alice.id,'invitation_token':token})
        c=verify(r['slot'],self.alice.id,'pi-channel+jws')
        self.ok(self.bob,{'op':'bind','id':gid,'channel':signed({'v':1,'iss':self.bob.id,'role':'peer','epoch':r['epoch'],'grant':gid,'slot':c['slot'],'bundle':{'fixture':'not E2EE'}},self.bob.controller,'pi-channel+jws')})
        self.ok(self.bob,{'op':'intro','id':gid,'envelope':self.envelope()});return gid
    def test_preview_never_claims_and_retry_creates_only_one_invitation(self):
        token,q=self.invite();self.ok(self.alice,q)
        for _ in range(3):self.assertEqual(200,self.a.handle('/v3/invite-preview',{'token':token})[0])
        self.assertEqual(0,self.a.db.execute('SELECT count(*) FROM contacts').fetchone()[0])
        self.assertEqual(1,self.a.db.execute('SELECT count(*) FROM invitations').fetchone()[0])
        for path in Path(self.tmp.name).iterdir():self.assertNotIn(token.encode(),path.read_bytes())
        self.assertEqual(400,self.a.handle('/v3/invite-preview',{'token':'bad'})[0])
    def test_invitation_expiry_does_not_shorten_approved_access(self):
        token,q=self.invite();self.now+=6*86400;gid=self.reserve(token)
        g={'v':1,'iss':self.alice.id,'aud':self.bob.id,'id':gid,'status':'APPROVED','revision':1,'expires':self.now+7*86400}
        too_long=dict(g,expires=self.now+8*86400)
        self.assertEqual(403,self.alice.call(self.a,{'op':'decision','id':gid,'grant':signed(too_long,self.alice.controller,'pi-grant+jws')})[0])
        self.ok(self.alice,{'op':'decision','id':gid,'grant':signed(g,self.alice.controller,'pi-grant+jws')})
        self.now+=86400
        self.assertEqual(410,self.a.handle('/v3/invite-preview',{'token':token})[0])
        # Legacy exact-state route cannot bypass the invitation expiry.
        stranger=Actor(self.a,self.now)
        self.assertEqual(410,stranger.call(self.a,{'op':'reserve','id':secrets.token_hex(16),'target':self.alice.id,'invitation':self.alice.token})[0])
        self.ok(self.bob,{'op':'send','id':gid,'envelope':self.envelope()})
        self.now+=6*86400
        self.assertEqual(403,self.bob.call(self.a,{'op':'send','id':gid,'envelope':self.envelope()})[0])
    def test_cancel_closes_pending_access(self):
        token,_=self.invite();gid=self.reserve(token)
        self.ok(self.alice,{'op':'cancel_invite','token':token})
        self.assertEqual(410,self.a.handle('/v3/invite-preview',{'token':token})[0])
        self.assertNotEqual(200,self.alice.call(self.a,{'op':'decision','id':gid,'grant':self.alice.grant(gid,self.bob)})[0])
        self.assertEqual(0,self.a.db.execute('SELECT count(*) FROM messages').fetchone()[0])
    def test_cancel_does_not_end_accepted_access(self):
        token,_=self.invite();gid=self.reserve(token)
        grant={'v':1,'iss':self.alice.id,'aud':self.bob.id,'id':gid,'status':'APPROVED','revision':1,'expires':self.now+7*86400}
        self.ok(self.alice,{'op':'decision','id':gid,'grant':signed(grant,self.alice.controller,'pi-grant+jws')})
        self.ok(self.alice,{'op':'cancel_invite','token':token})
        self.ok(self.bob,{'op':'send','id':gid,'envelope':self.envelope()})
        self.assertEqual(410,self.a.handle('/v3/invite-preview',{'token':token})[0])
    def test_foreign_owner_cannot_cancel_or_reuse_token(self):
        token,q=self.invite()
        self.assertNotEqual(200,self.bob.call(self.a,{'op':'cancel_invite','token':token})[0])
        self.assertNotEqual(200,self.bob.call(self.a,q)[0])
        altered=copy.deepcopy(q);altered['expires']+=1
        self.assertNotEqual(200,self.alice.call(self.a,altered)[0])

if __name__=='__main__':unittest.main()
