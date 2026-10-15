import base64
import json
import secrets
import tempfile
import threading
import time
import unittest
import urllib.request
import urllib.error
from http.server import ThreadingHTTPServer
from server import Relay, handler, BoundedHTTPServer

class RelayTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.relay = Relay(self.tmp.name + '/db')
        self.reader, self.writer = secrets.token_urlsafe(32), secrets.token_urlsafe(32)
        status, box = self.relay.handle('POST', '/v1/boxes', '', dict(reader=self.reader, writer=self.writer))
        self.assertEqual(status, 201)
        self.path = '/v1/boxes/' + box['id'] + '/messages'
        self.mid = secrets.token_hex(16)
        self.data = dict(body=base64.b64encode(secrets.token_bytes(128)).decode(), expires=int(time.time())+60)
    def tearDown(self):
        self.relay.db.close()
        self.tmp.cleanup()
    def call(self, method, token=None, data=None, item=False):
        return self.relay.handle(method, self.path + ('/'+self.mid if item else ''), token or '', data or {})
    def test_delivery_ack_and_idempotent_retry(self):
        self.assertEqual(self.call('PUT', self.writer, self.data, True)[0], 201)
        self.assertEqual(self.call('PUT', self.writer, self.data, True)[0], 200)
        self.assertEqual(len(self.call('GET', self.reader)[1]['messages']), 1)
        self.call('DELETE', self.reader, item=True)
        self.assertEqual(self.call('PUT', self.writer, self.data, True)[0], 200)
        self.assertEqual(self.call('GET', self.reader)[1]['messages'], [])
    def test_capability_separation(self):
        self.assertEqual(self.call('PUT', self.reader, self.data, True)[0], 404)
        self.assertEqual(self.call('GET', self.writer)[0], 404)
        self.assertEqual(self.call('DELETE', self.writer, item=True)[0], 404)
        self.assertEqual(self.call('GET')[0], 404)
    def test_expiration(self):
        self.call('PUT', self.writer, self.data, True)
        self.relay.db.execute('UPDATE messages SET expires=0')
        self.assertEqual(self.call('GET', self.reader)[1]['messages'], [])
    def test_invalid_payload_and_ttl(self):
        for body, expiry in [('plaintext', int(time.time())+60), (self.data['body'], 0), (self.data['body'], int(time.time())+8*86400)]:
            self.assertEqual(self.call('PUT', self.writer, dict(body=body, expires=expiry), True)[0], 400)
    def test_storage_is_opaque_and_capabilities_hashed(self):
        self.call('PUT', self.writer, self.data, True)
        row = self.relay.db.execute('SELECT body FROM messages').fetchone()
        self.assertEqual(row[0], self.data['body'])
        row = self.relay.db.execute('SELECT reader,writer FROM boxes').fetchone()
        self.assertNotIn(self.reader.encode(), row)
        self.assertNotIn(self.writer.encode(), row)
    def test_quota(self):
        for _ in range(100):
            self.mid = secrets.token_hex(16)
            self.assertEqual(self.call('PUT', self.writer, self.data, True)[0], 201)
        self.mid = secrets.token_hex(16)
        self.assertEqual(self.call('PUT', self.writer, self.data, True)[0], 429)
    def test_delete_box_revokes_access_and_removes_queue(self):
        self.call('PUT', self.writer, self.data, True)
        box_path = self.path.removesuffix('/messages')
        self.assertEqual(self.relay.handle('DELETE', box_path, self.writer, {})[0], 404)
        self.assertEqual(self.relay.handle('DELETE', box_path, self.reader, {})[0], 200)
        self.assertEqual(self.call('GET', self.reader)[0], 404)
        self.assertEqual(self.call('PUT', self.writer, self.data, True)[0], 404)
        self.assertEqual(self.relay.db.execute('SELECT count(*) FROM messages').fetchone()[0], 0)
    def test_cross_mailbox_isolation(self):
        _, box = self.relay.handle('POST', '/v1/boxes', '', dict(reader=secrets.token_urlsafe(32), writer=secrets.token_urlsafe(32)))
        other = '/v1/boxes/' + box['id'] + '/messages'
        self.assertEqual(self.relay.handle('GET', other, self.reader, {})[0], 404)
        self.assertEqual(self.relay.handle('PUT', other+'/'+self.mid, self.writer, self.data)[0], 404)
    def test_registration_limits_and_distinct_capabilities(self):
        self.assertEqual(self.relay.handle('POST', '/v1/boxes', '', dict(reader=self.reader, writer=self.reader))[0], 400)
        for _ in range(59):
            self.assertEqual(self.relay.handle('POST', '/v1/boxes', '', dict(reader=secrets.token_urlsafe(32), writer=secrets.token_urlsafe(32)))[0], 201)
        self.assertEqual(self.relay.handle('POST', '/v1/boxes', '', dict(reader=self.reader, writer=self.writer))[0], 429)
    def test_real_http_two_clients(self):
        try:
            server = BoundedHTTPServer(('127.0.0.1', 0), handler(self.relay))
        except PermissionError:
            self.skipTest('NOT TESTED: environment denies socket creation')
        thread = threading.Thread(target=server.serve_forever, daemon=True); thread.start()
        url = 'http://127.0.0.1:' + str(server.server_port) + self.path
        try:
            request = urllib.request.Request(url+'/'+self.mid, json.dumps(self.data).encode(), {'Authorization': 'Bearer '+self.writer}, method='PUT')
            self.assertEqual(urllib.request.urlopen(request).status, 201)
            request = urllib.request.Request(url, headers={'Authorization': 'Bearer '+self.reader})
            received = json.load(urllib.request.urlopen(request))
            self.assertEqual(received['messages'][0]['body'], self.data['body'])
        finally:
            server.shutdown(); server.server_close(); thread.join()

if __name__ == '__main__': unittest.main()
