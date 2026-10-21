import copy
import json
import os
import threading
import time
import unittest
from fixtures import make,keys,sign,seed,PEOPLE
from profile import verify_profile,canonical,CATEGORIES,PREFIX,contact_link
from open_verifier import decode,encode
from directory import Directory,Conflict
from search import parse
from serve import PreviewServer,Limits
from urllib.request import Request,urlopen
from urllib.error import HTTPError


class SignedProfile(unittest.TestCase):
    def setUp(self): self.now=int(time.time());self.id,self.token,self.d,self.s=make('web',self.now)
    def resign(self,d):return sign(d,*keys('web'))
    def test_offline_verification(self):
        d,s=verify_profile(self.token,self.id,self.now);self.assertEqual(contact_link(s),'https://test-provider.example/g/'+self.id[len(PREFIX):])
        self.assertEqual(d['profile']['alias'],'TEST web')
    def test_wrong_key_forgery_tampering_and_unsigned(self):
        for token,expected in [(self.token,make('mobile',self.now)[0]),(self.token[:-5]+'AAAAA',self.id),(json.dumps(self.d),self.id)]:
            with self.subTest(token=token[:10]),self.assertRaises(Exception):verify_profile(token,expected,self.now)
        d=copy.deepcopy(self.d);d['profile']['purpose']='Changed';parts=self.token.split('.');parts[1]=encode(canonical(d))
        with self.assertRaises(Exception):verify_profile('.'.join(parts),self.id,self.now)
    def test_binding_expiry_and_field_rejection(self):
        variants=[{'controller':make('mobile',self.now)[0]},{'expires':self.now},{'consent':False},{'revision':True},{'issued':self.now+500},{'root_id':'forbidden'},{'state':make('mobile',self.now)[1]}]
        for changes in variants:
            with self.subTest(changes=changes),self.assertRaises(Exception):verify_profile(self.resign(dict(self.d,**changes)),self.id,self.now)
    def test_canonical_and_duplicate_rejection(self):
        import jwt
        for raw in [json.dumps(self.d).encode(),canonical(self.d).replace(b'"v":1',b'"v":1,"v":1')]:
            token=jwt.api_jws.PyJWS().encode(raw,keys('web')[0],algorithm='ES256',headers={'typ':'pi-discovery+jws','jwk':keys('web')[1]})
            with self.assertRaises(Exception):verify_profile(token,self.id,self.now)
    def test_links_and_unapproved_fields(self):
        for url in ['javascript:alert(1)','http://example.com','https://user:password@example.com','https://example.com/\nattack']:
            d=copy.deepcopy(self.d);d['profile']['evidence']=[dict(title='Example',url=url)]
            with self.subTest(url=url),self.assertRaises(Exception):verify_profile(self.resign(d),self.id,self.now)
        d=copy.deepcopy(self.d);d['profile']['email']='private@example.com'
        with self.assertRaises(Exception):verify_profile(self.resign(d),self.id,self.now)
    def test_policy_binding(self):
        for changes in [{'status':'REVOKED'},{'discovery_mode':'UNLISTED'},{'status':'PAUSED'},{'expires_at':self.now-1},{'contact_request_mode':'DISABLED'}]:
            i,t,_,_=make('web',self.now,policy_changes=changes)
            with self.assertRaises(Exception):verify_profile(t,i,self.now)
    def test_distinct_purposes_no_root(self):
        i,t,d,s=make('mobile',self.now)
        self.assertNotEqual(i,self.id);self.assertNotEqual(s['device'],self.s['device'])
        for forbidden in ['wallet','root_id','email','phone','analytics_id']:
            self.assertNotIn(forbidden,canonical(self.d).decode())
    def test_private_is_minimal(self):
        i,t,d,_=make('web',self.now,visibility='PRIVATE');self.assertEqual(verify_profile(t,i,self.now,True)[0]['profile'],{})
        with self.assertRaises(Exception):verify_profile(t,i,self.now)


class Parser(unittest.TestCase):
    def test_unknown_and_soft_hard_budget(self):
        p=parse('website');self.assertIsNone(p['budget']);self.assertIsNone(p['remote']);self.assertIsNone(p['languages'])
        self.assertTrue(parse('website under $500')['budget']['hard']);self.assertFalse(parse('website around $500')['budget']['hard'])
    def test_design_and_unsupported(self):
        self.assertEqual(parse('Android app redesign')['category'],CATEGORIES[1]);self.assertEqual(parse('app developer')['category'],CATEGORIES[0])
        for q in ['Plumber near me','medical diagnosis','urgent legal representation','website must accept bitcoin']:
            self.assertTrue(parse(q)['blocked'])
    def test_rates_bound_memory(self):
        limits=Limits()
        self.assertTrue(all(limits.allow('1','write',10) for _ in range(15)));self.assertFalse(limits.allow('1','write',10));self.assertTrue(limits.allow('1','write',71))
        self.assertLessEqual(len(limits.buckets),2)


@unittest.skipUnless(os.getenv('DISCOVERY_TEST_DATABASE_URL'),'dedicated PostgreSQL test URL required')
class PostgreSQL(unittest.TestCase):
    def setUp(self):
        self.now=int(time.time());self.d=Directory(__import__('fixtures').test_database_url(),clock=lambda:self.now)
        self.d.db.execute('TRUNCATE veil_discovery.profiles,veil_discovery.blocks,veil_discovery.reports')
    def tearDown(self):self.d.close()
    def publish(self,name='web',**kw):
        i,t,d,s=make(name,self.now,**kw);self.d.publish(i,t);return i,t,d,s
    def test_private_publish_inspect_export_contact_unpublish(self):
        i,_,_,_=self.publish(visibility='PRIVATE');self.assertFalse(self.d.search('website')['results']);self.assertIsNone(self.d.get(i))
        i,t,d,s=self.publish(revision=2);self.assertEqual(len(self.d.search('website')['results']),1)
        self.assertEqual(self.d.get(i),{'publication':t});self.assertEqual(verify_profile(t,i,self.now)[1],s)
        self.publish(revision=3,visibility='PRIVATE');self.assertIsNone(self.d.get(i));self.assertFalse(self.d.search('website')['results'])
        row=self.d.db.execute('SELECT token,search_text FROM veil_discovery.profiles WHERE controller=%s',(i,)).fetchone();self.assertEqual(row,(None,''))
        with self.assertRaises(Conflict):self.d.publish(i,t)
    def test_revisions_replay_and_stale_state(self):
        i,t,_,_=self.publish(revision=2,state_revision=2);self.d.publish(i,t)
        for kw in [{'revision':1},{'revision':2,'changes':{'expires':self.now+2000}},{'revision':3,'state_revision':1}]:
            with self.assertRaises(Conflict):self.publish(**kw)
    def test_link_only_expired_paused_and_blocked(self):
        i,_,_,_=self.publish(visibility='LINK_ONLY');self.assertIsNone(self.d.get(i));self.assertFalse(self.d.search('website')['results'])
        i,t,d,s=self.publish(revision=2,state_revision=2);self.d.block(i,'abuse');self.assertIsNone(self.d.get(i));self.assertFalse(self.d.search('website')['results'])
        self.d.db.execute('DELETE FROM veil_discovery.blocks');self.now+=86401
        self.assertIsNone(self.d.get(i));self.assertFalse(self.d.search('website')['results'])
        self.assertIsNone(self.d.db.execute('SELECT token FROM veil_discovery.profiles').fetchone()[0])
    def test_paused_route_cannot_be_replaced(self):
        i,t,d,s=make('web',self.now);d['profile']['accepting']=False;s['policy']['status']='PAUSED';d['state']=sign(s,*keys('web'),'pi-state+jws');t=sign(d,*keys('web'));self.d.publish(i,t)
        self.assertFalse(self.d.search('website')['results']);self.assertIsNotNone(self.d.get(i))
        d['revision']=2;s['route']='https://substitute.example';d['state']=sign(s,*keys('web'),'pi-state+jws')
        with self.assertRaises(Conflict):self.d.publish(i,sign(d,*keys('web')))
    def test_hard_filters_and_stable_order(self):
        seed(self.d,self.now)
        for q in ['website under $100','remote UI in French','Python tutor under $10 per hour','medical diagnosis','website can start within 1 day']:
            self.assertFalse(self.d.search(q)['results'],q)
        a=self.d.search('website')['results'];self.assertEqual(a,self.d.search('website')['results'])
        self.assertLessEqual(len(a),5)
        self.assertEqual(len(self.d.search('website under $500')['results']),1)
    def test_deletion_terminal(self):
        i,_,_,_=self.publish();self.publish(revision=2,visibility='DELETED')
        with self.assertRaises(Conflict):self.publish(revision=3)
        self.assertIsNone(self.d.get(i))
    def test_http_visibility_gate_headers_and_origin(self):
        i,t,_,_=self.publish();private,_,_,_=self.publish('mobile',visibility='LINK_ONLY')
        server=PreviewServer(('127.0.0.1',0),self.d,True);thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start();base='http://127.0.0.1:'+str(server.server_port)
        def request(path,data=None,headers=None):
            h={'Content-Type':'application/json',**(headers or {})};r=Request(base+path,data=json.dumps(data).encode() if data is not None else None,headers=h)
            try:return urlopen(r)
            except HTTPError as e:return e
        try:
            r=request('/api/profile/'+i[len(PREFIX):]);self.assertEqual(r.status,200);self.assertEqual(r.headers['Cache-Control'],'no-store');self.assertIn('noindex',r.headers['X-Robots-Tag'])
            self.assertEqual(request('/api/profile/'+private[len(PREFIX):]).status,404)
            self.assertNotIn(private.encode(),request('/sitemap.xml').read())
            self.assertEqual(request('/api/publish',{'controller':i,'publication':t},{'Origin':'https://evil.example'}).status,403)
            for path in ['/guest/send','/api/send','/v3/command']:
                r=request(path,{'text':'NEVER-READ-PLAINTEXT'});self.assertEqual(r.status,503)
            self.assertEqual(request('/api/profile').status,404);self.assertEqual(request('/autocomplete').status,404)
            self.assertEqual(request('/',headers={'Host':'evil.example'}).status,421)
            self.assertFalse(json.loads(request('/api/config').read())['guestMessaging'])
        finally:server.shutdown();server.server_close();thread.join()

if __name__=='__main__':unittest.main()
