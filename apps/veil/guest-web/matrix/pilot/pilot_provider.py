"""Private pilot boundary. Bind only to loopback; Synapse remains Unix-only.

Enrollment is controller-signed, claim is guest-signed, decisions are owner-signed.
This adds admission to the existing narrow ciphertext gateway, never a room proxy.
"""
import hashlib
import hmac
import json
import re
import secrets
import sys
import time
from pathlib import Path

import yaml
from aiohttp import web
from jwt.exceptions import InvalidTokenError

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'integration'))
from provider import Boundary, card, strict_json, verify, active, is_open


def digest(text):
    return hashlib.sha256(text.encode()).hexdigest()


class PilotBoundary(Boundary):
    def __init__(self, runtime):
        super().__init__(runtime)
        self.db.executescript('''
          CREATE TABLE IF NOT EXISTS enrollments (id TEXT PRIMARY KEY, owner TEXT UNIQUE, token TEXT, value TEXT);
          CREATE TABLE IF NOT EXISTS guests (id TEXT PRIMARY KEY, invite TEXT, controller TEXT, credentials TEXT, claim TEXT);
          CREATE TABLE IF NOT EXISTS challenges (nonce TEXT PRIMARY KEY, expires INTEGER);
        ''')

    def enrollment(self, invite):
        row = self.db.execute('SELECT token,value FROM enrollments WHERE id=?', (invite,)).fetchone()
        assert row
        value = strict_json(row[1])
        s, _ = card(value['owner'])
        assert time.time() < value['expires'] and active(s['policy'], time.time())
        return row[0], value

    async def device(self, endpoint, auth):
        status, raw = await self.upstream('POST', '/_matrix/client/v3/keys/query', json.dumps({
            'device_keys': {endpoint['user_id']: [endpoint['device_id']]}}).encode(), auth)
        assert status == 200
        keys = strict_json(raw)['device_keys'][endpoint['user_id']][endpoint['device_id']]['keys']
        assert all(keys[k + ':' + endpoint['device_id']] == endpoint[k] for k in ('ed25519', 'curve25519'))

    async def provision(self, identifier, invite, controller):
        row = self.db.execute('SELECT credentials FROM guests WHERE id=?', (identifier,)).fetchone()
        if row:
            credentials = strict_json(row[0])
        else:
            assert self.db.execute('SELECT COUNT(*) FROM guests WHERE invite=?', (invite,)).fetchone()[0] < 20
            credentials = {'username': 'g_' + identifier, 'password': secrets.token_urlsafe(32), 'device_id': 'GUEST'}
            self.db.execute('INSERT INTO guests VALUES (?,?,?,?,NULL)', (identifier, invite, controller, json.dumps(credentials)))
            self.db.commit()  # Retry registration/login with the same account after ambiguous failure.
        if 'access_token' not in credentials:
            path = '/_synapse/admin/v1/register'
            code, raw = await self.upstream('GET', path)
            assert code == 200
            nonce = strict_json(raw)['nonce']
            secret = yaml.safe_load((self.runtime / 'homeserver.yaml').read_text())['registration_shared_secret']
            mac = hmac.new(secret.encode(), '\0'.join([nonce, credentials['username'], credentials['password'], 'notadmin']).encode(), hashlib.sha1).hexdigest()
            code, raw = await self.upstream('POST', path, json.dumps({
                'nonce': nonce, 'username': credentials['username'], 'password': credentials['password'], 'admin': False, 'mac': mac}).encode())
            assert code == 200 or strict_json(raw).get('errcode') == 'M_USER_IN_USE'
            code, raw = await self.upstream('POST', '/_matrix/client/v3/login', json.dumps({
                'type': 'm.login.password', 'identifier': {'type': 'm.id.user', 'user': credentials['username']},
                'password': credentials['password'], 'device_id': credentials['device_id']}).encode())
            assert code == 200
            credentials = {k: strict_json(raw)[k] for k in ('access_token', 'user_id', 'device_id')}
            self.db.execute('UPDATE guests SET credentials=? WHERE id=?', (json.dumps(credentials), identifier))
            self.db.commit()
        return credentials

    async def pilot(self, req):
        path = req.path
        if path == '/pilot/challenge' and req.method == 'POST':
            self.db.execute('DELETE FROM challenges WHERE expires<?', (time.time(),))
            assert self.db.execute('SELECT COUNT(*) FROM challenges').fetchone()[0] < 4096
            nonce = secrets.token_hex(32)
            self.db.execute('INSERT INTO challenges VALUES (?,?)', (nonce, int(time.time()) + 60))
            self.db.commit()
            return web.json_response({'nonce': nonce})
        if path.startswith('/pilot/resolve/') and req.method == 'GET':
            suffix = path.rsplit('/', 1)[1]
            assert re.fullmatch('[A-Za-z0-9_-]{43}', suffix)
            pin = 'urn:ietf:params:oauth:jwk-thumbprint:sha-256:' + suffix
            row = self.db.execute('SELECT id FROM enrollments WHERE owner=?', (pin,)).fetchone()
            assert row
            token, value = self.enrollment(row[0])
            assert card(value['owner'])[0]['policy']['discovery_mode'] in ('LINK_ONLY', 'PUBLIC_SEARCHABLE')
            return web.json_response({'enrollment': token})
        if path.startswith('/pilot/invite/') and req.method == 'GET':
            token, _ = self.enrollment(path.rsplit('/', 1)[1])
            return web.json_response({'enrollment': token})
        body = strict_json(await req.read()) if req.method == 'POST' else {}
        if path == '/pilot/bootstrap' and req.method == 'POST':
            p = verify(body['proof'], body['controller'], 'pi-matrix-bootstrap+jws')
            assert set(p) == {'v', 'iss', 'invite', 'nonce'} and p['iss'] == body['controller']
            self.enrollment(p['invite'])
            nonce = self.db.execute('DELETE FROM challenges WHERE nonce=? AND expires>? RETURNING nonce', (p['nonce'], time.time())).fetchone()
            self.db.commit()
            assert nonce
            identifier = digest(p['invite'] + p['iss'])
            return web.json_response(await self.provision(identifier, p['invite'], p['iss']))
        who = await self.identity(req)
        if path == '/pilot/enroll' and req.method == 'POST':
            p = verify(body['token'], body['owner'], 'pi-matrix-enrollment+jws')
            assert set(p) == {'v', 'iss', 'invite', 'revision', 'issued', 'expires', 'owner'}
            assert p['iss'] == body['owner'] == p['owner']['id']
            s, endpoint = card(p['owner'])
            # Only operator-provisioned accounts can host pilot invitations.
            accounts = strict_json((self.runtime / 'accounts.json').read_text())
            assert endpoint['user_id'] in {'@' + a['username'] + ':veil.test' for a in accounts}
            assert who == (endpoint['user_id'], endpoint['device_id'])
            assert re.fullmatch('[a-f0-9]{64}', p['invite'])
            assert all(type(p[k]) is int for k in ('issued', 'expires', 'revision'))
            assert p['issued'] <= time.time() + 30 and p['issued'] < p['expires'] <= p['issued'] + 3600
            assert s['policy']['contact_request_mode'] in ('REQUEST_APPROVAL', 'DISABLED')
            await self.device(endpoint, req.headers['Authorization'])
            prior = self.db.execute('SELECT token,value FROM enrollments WHERE owner=?', (p['iss'],)).fetchone()
            if prior:
                previous = strict_json(prior[1])
                if previous == p:
                    return web.json_response({'accepted': True})
                assert p['invite'] == previous['invite'] and p['revision'] == previous['revision'] + 1
                assert p['expires'] == previous['expires'] and p['issued'] == previous['issued']
                assert card(previous['owner'])[1] == endpoint  # Migration requires a new explicitly shared invitation.
                assert s['revision'] > card(previous['owner'])[0]['revision']
            else:
                for existing, in self.db.execute('SELECT value FROM enrollments'):
                    assert card(strict_json(existing)['owner'])[1]['user_id'] != endpoint['user_id']
                assert p['revision'] == 1 and p['expires'] > time.time()
            self.db.execute('INSERT OR REPLACE INTO enrollments VALUES (?,?,?,?)', (p['invite'], p['iss'], body['token'], json.dumps(p)))
            self.db.commit()
            return web.json_response({'accepted': True})
        if path == '/pilot/claim' and req.method == 'POST':
            p = verify(body['token'], body['guest'], 'pi-matrix-claim+jws')
            assert set(p) == {'v', 'iss', 'invite', 'guest'} and p['iss'] == body['guest'] == p['guest']['id']
            enrollment_token, e = self.enrollment(p['invite'])
            s, oe = card(e['owner'])
            assert s['policy']['contact_request_mode'] == 'REQUEST_APPROVAL' and is_open(s['policy'], time.time())
            _, ge = card(p['guest'])
            assert who == (ge['user_id'], ge['device_id']) and who != (oe['user_id'], oe['device_id'])
            identifier = digest(p['invite'] + p['iss'])
            row = self.db.execute('SELECT credentials,claim FROM guests WHERE id=?', (identifier,)).fetchone()
            assert row
            credentials = strict_json(row[0])
            assert who == (credentials['user_id'], credentials['device_id'])
            await self.device(ge, req.headers['Authorization'])
            if row[1]:
                assert verify(row[1], p['iss'], 'pi-matrix-claim+jws') == p
            else:
                policy = {'v': 1, 'iss': e['iss'], 'invitation': identifier, 'revision': 1, 'issued': e['issued'],
                          'expires': e['expires'], 'status': 'pending', 'owner': e['owner'], 'guest': p['guest']}
                self.db.execute('INSERT INTO policies VALUES (?,?,?,0)', (identifier, json.dumps(policy), ''))
                self.db.execute('UPDATE guests SET claim=? WHERE id=?', (body['token'], identifier))
                self.db.commit()
            return web.json_response({'conversation': identifier})
        if path == '/pilot/inbox' and req.method == 'GET':
            items = []
            for identifier, p, token, used in self.policies():
                _, endpoint = card(p['owner'])
                if who == (endpoint['user_id'], endpoint['device_id']):
                    row = self.db.execute('SELECT claim,invite FROM guests WHERE id=?', (identifier,)).fetchone()
                    items.append({'id': identifier, 'policy': p, 'decision': token, 'claim': row[0], 'invite': row[1]})
            return web.json_response({'conversations': items})
        if path.startswith('/pilot/conversation/') and req.method == 'GET':
            identifier = path.rsplit('/', 1)[1]
            row = self.db.execute('SELECT value,token,used FROM policies WHERE id=?', (identifier,)).fetchone()
            assert row
            p = strict_json(row[0])
            assert who in [tuple(card(p[k])[1][f] for f in ('user_id', 'device_id')) for k in ('owner', 'guest')]
            claim, invite = self.db.execute('SELECT claim,invite FROM guests WHERE id=?', (identifier,)).fetchone()
            token = self.db.execute('SELECT token FROM enrollments WHERE id=?', (invite,)).fetchone()[0]
            return web.json_response({'decision': row[1], 'claim': claim, 'enrollment': token, 'used': row[2]})
        raise ValueError('not admitted')

    async def policy(self, req, who):
        # Pilot decisions can only advance a claimed conversation; never invent one.
        assert req.method == 'POST'
        body = strict_json(await req.read())
        p = verify(body['token'], body['owner'], 'pi-matrix-policy+jws')
        assert set(p) == {'v', 'iss', 'invitation', 'revision', 'issued', 'expires', 'status', 'owner', 'guest'}
        row = self.db.execute('SELECT value FROM policies WHERE id=?', (p['invitation'],)).fetchone()
        assert row
        prior = strict_json(row[0])
        _, endpoint = card(prior['owner'])
        assert p['iss'] == body['owner'] == prior['owner']['id'] and who == (endpoint['user_id'], endpoint['device_id'])
        if p == prior and p['status'] != 'pending':
            return web.json_response({'accepted': True})
        assert type(p['revision']) is int and p['revision'] == prior['revision'] + 1
        assert all(p[k] == prior[k] for k in ('v', 'iss', 'invitation', 'issued', 'expires', 'owner', 'guest'))
        assert (prior['status'] == 'pending' and p['status'] in ('approved', 'declined', 'blocked', 'revoked')
                or prior['status'] == 'approved' and p['status'] in ('blocked', 'revoked'))
        assert p['expires'] > time.time()
        self.db.execute('UPDATE policies SET value=?,token=? WHERE id=?', (json.dumps(p), body['token'], p['invitation']))
        self.db.commit()
        return web.json_response({'accepted': True})

    def current(self, identifier, policy):
        row = self.db.execute('SELECT invite FROM guests WHERE id=?', (identifier,)).fetchone()
        _, e = self.enrollment(row[0])
        current = card(e['owner'])[0]['policy']
        assert current['contact_request_mode'] == 'REQUEST_APPROVAL' and is_open(current, time.time())

    async def handle(self, req):
        if req.path.startswith('/pilot/'):
            try:
                assert '//' not in req.path and '%' not in req.raw_path.split('?')[0] and 'access_token' not in req.query
                async with self.lock:
                    return await self.pilot(req)
            except (AssertionError, ValueError, KeyError, TypeError, InvalidTokenError):
                return web.json_response({'errcode': 'M_FORBIDDEN', 'error': 'Request unavailable'}, status=403)
        return await super().handle(req)


if __name__ == '__main__':
    boundary = PilotBoundary(sys.argv[1])
    app = web.Application(client_max_size=65536)
    app.router.add_route('*', '/{tail:.*}', boundary.handle)
    app.on_startup.append(boundary.start)
    app.on_cleanup.append(boundary.stop)
    web.run_app(app, host='127.0.0.1', port=8765, access_log=None, print=None)
