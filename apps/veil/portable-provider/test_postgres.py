"""Disposable CI database only. Run invitations against the production storage adapter."""
import os
import unittest
import test_invitations
import test_provider
from provider import Provider

@unittest.skipUnless(os.environ.get('VEIL_TEST_POSTGRES_URL'),'Disposable PostgreSQL required')
class PostgresInvitations(test_invitations.InvitationTests):
    def setUp(self):
        super().setUp()
        import psycopg
        url=os.environ['VEIL_TEST_POSTGRES_URL']
        # Never accept a deployment URL for this destructive fixture reset.
        from urllib.parse import urlparse
        parsed=urlparse(url)
        assert parsed.hostname in ('localhost','127.0.0.1') and parsed.path=='/veil_test'
        with psycopg.connect(url,autocommit=True) as db:db.execute('DROP SCHEMA IF EXISTS veil_portable CASCADE')
        self.a.db.close();self.a=Provider(':memory:','https://provider-a.example',clock=lambda:self.now,database_url=url)
        self.alice=test_provider.Actor(self.a,self.now,public=True);self.bob=test_provider.Actor(self.a,self.now,'Personal')
    def test_v1_and_v3_schema_isolation_and_restart(self):
        from server import Relay
        url=os.environ['VEIL_TEST_POSTGRES_URL'];relay=Relay(':memory:',database_url=url,portable_origin=self.a.origin)
        import secrets
        code,box=relay.handle('POST','/v1/boxes','',{'reader':secrets.token_urlsafe(32),'writer':secrets.token_urlsafe(32)})
        self.assertEqual(201,code)
        token,_=self.invite()
        relay.portable.db.close()
        restarted=Provider(':memory:',self.a.origin,clock=lambda:self.now,database_url=url)
        self.assertEqual(200,restarted.handle('/v3/invite-preview',{'token':token})[0])
        self.assertIsNotNone(relay.db.execute('SELECT id FROM boxes WHERE id=?',(box['id'],)).fetchone())
        relay.db.close();restarted.db.close()
