"""Disposable, single-process Matrix policy boundary. No decryption code or keys.

Synapse has ONLY a Unix listener. This is its only client network ingress.
This narrow experiment deliberately does not implement a general Matrix proxy.
"""
import asyncio
import fcntl
import hashlib
import json
import re
import sqlite3
import sys
import time
import traceback
from pathlib import Path

import aiohttp
from jwt.exceptions import InvalidTokenError
from aiohttp import web

VEIL = Path(__file__).resolve().parents[3]
sys.path[:0] = [str(VEIL / 'portable-provider'), str(VEIL / 'relay')]
from open_verifier import verify, state, strict_json, encode  # noqa: E402
from purpose_policy import validate, active, is_open  # noqa: E402

# This experimental boundary uses assertions for admission. Optimized Python
# removes them, so refuse startup rather than accidentally opening the proxy.
if not __debug__:
    raise RuntimeError('Veil policy boundary requires validation-enabled Python')


def card(value):
    s = state(value['state'], value['id'])
    validate(s['policy'])
    b = verify(value['binding'], value['id'], 'pi-matrix-binding+jws')
    assert set(b) == {'v', 'iss', 'state_hash', 'endpoint'}
    assert b['iss'] == value['id']
    assert b['state_hash'] == encode(hashlib.sha256(value['state'].encode()).digest())
    e = b['endpoint']
    assert set(e) == {'user_id', 'device_id', 'ed25519', 'curve25519'}
    assert re.fullmatch(r'@[a-z0-9_]+:veil.test', e['user_id'])
    assert re.fullmatch(r'[A-Z0-9]+', e['device_id'])
    assert all(re.fullmatch(r'[A-Za-z0-9+/]{43}', e[k]) for k in ('ed25519', 'curve25519'))
    return s, e


class Boundary:
    def __init__(self, runtime):
        self.runtime = Path(runtime)
        self.worker_lock = (self.runtime / 'boundary.lock').open('a')
        try:
            fcntl.flock(self.worker_lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            self.worker_lock.close()
            raise RuntimeError('Only one staging boundary worker is supported') from None
        self.lock = asyncio.Lock()
        self.db = sqlite3.connect(self.runtime / 'policy.sqlite')
        self.db.execute('CREATE TABLE IF NOT EXISTS policies (id TEXT PRIMARY KEY, value TEXT, token TEXT, used INTEGER)')
        self.db.execute('CREATE TABLE IF NOT EXISTS transactions (sender TEXT, txn TEXT, digest TEXT, PRIMARY KEY(sender,txn))')
        self.stats = {'accepted_ciphertexts': 0, 'denied': 0}

    async def start(self, app):
        self.http = aiohttp.ClientSession(connector=aiohttp.UnixConnector(path=str(self.runtime / 'synapse.sock')))

    async def stop(self, app):
        if hasattr(self, 'http'):
            await self.http.close()
        self.db.close()
        self.worker_lock.close()

    async def upstream(self, method, path, body=None, auth=None):
        # Unix sockets have no remote IP. Supply our own fixed loopback address,
        # never a client-supplied forwarded header, for Synapse rate limiting.
        headers = {'Content-Type': 'application/json', 'X-Forwarded-For': '127.0.0.1', 'X-Forwarded-Proto': 'http'}
        if auth:
            headers['Authorization'] = auth
        async with self.http.request(method, 'http://localhost' + path, data=body, headers=headers) as r:
            return r.status, await r.read()

    async def identity(self, req):
        auth = req.headers.get('Authorization', '')
        assert auth.startswith('Bearer ') and 'access_token' not in req.query
        status, raw = await self.upstream('GET', '/_matrix/client/v3/account/whoami', auth=auth)
        assert status == 200
        who = strict_json(raw)
        return who['user_id'], who['device_id']

    def policies(self):
        return [(identifier, strict_json(value), token, used) for identifier, value, token, used in self.db.execute('SELECT * FROM policies')]

    async def policy(self, req, who):
        if req.method == 'GET':
            for identifier, p, token, used in self.policies():
                if identifier == req.match_info['tail'].split('/')[-1]:
                    assert who in [tuple(card(p[k])[1][f] for f in ('user_id', 'device_id')) for k in ('owner', 'guest')]
                    return web.json_response({'token': token, 'used': used})
            raise ValueError('unknown invitation')
        assert req.method == 'POST'
        body = strict_json(await req.read())
        p = verify(body['token'], body['owner'], 'pi-matrix-policy+jws')
        assert set(p) == {'v', 'iss', 'invitation', 'revision', 'issued', 'expires', 'status', 'owner', 'guest'}
        assert p['iss'] == body['owner'] == p['owner']['id']
        os, oe = card(p['owner'])
        card(p['guest'])
        assert who == (oe['user_id'], oe['device_id'])
        assert re.fullmatch(r'[a-f0-9]{64}', p['invitation'])
        assert type(p['revision']) is int and type(p['expires']) is int and type(p['issued']) is int
        assert p['issued'] <= time.time() + 30 and p['expires'] <= p['issued'] + 3600
        assert p['status'] in ('pending', 'approved', 'revoked')
        assert os['policy']['contact_request_mode'] == 'REQUEST_APPROVAL'
        old = self.db.execute('SELECT value,used FROM policies WHERE id=?', (p['invitation'],)).fetchone()
        used = 0
        if old:
            previous, used = strict_json(old[0]), old[1]
            assert previous['status'] != 'revoked' and p['revision'] == previous['revision'] + 1
            assert all(previous[k] == p[k] for k in ('owner', 'guest', 'expires', 'issued'))
            assert p['status'] == 'revoked' or (previous['status'] == 'pending' and p['status'] == 'approved')
        else:
            assert p['revision'] == 1 and p['status'] == 'pending' and p['expires'] > time.time()
            # One invitation per bound transport endpoint; no quota reset by new invitation.
            endpoints = [card(p[k])[1] for k in ('owner', 'guest')]
            for _, prior, _, _ in self.policies():
                assert not any(e['user_id'] == card(prior[k])[1]['user_id'] for e in endpoints for k in ('owner', 'guest'))
        self.db.execute('INSERT OR REPLACE INTO policies VALUES (?,?,?,?)', (p['invitation'], json.dumps(p), body['token'], used))
        self.db.commit()
        return web.json_response({'accepted': True})

    def current(self, identifier, policy):
        pass

    async def send(self, req, who):
        assert req.method == 'PUT' and re.fullmatch(r'/_matrix/client/v3/sendToDevice/m\.room\.encrypted/[A-Za-z0-9_-]{1,100}', req.path)
        raw = await req.read()
        body = strict_json(raw)
        assert set(body) == {'messages'} and len(body['messages']) == 1
        user, devices = next(iter(body['messages'].items()))
        assert len(devices) == 1
        device, content = next(iter(devices.items()))
        found = []
        for identifier, p, _, used in self.policies():
            os, owner = card(p['owner'])
            _, guest = card(p['guest'])
            for sender, target, intro in ((guest, owner, True), (owner, guest, False)):
                if who == (sender['user_id'], sender['device_id']) and (user, device) == (target['user_id'], target['device_id']):
                    found.append((identifier, p, used, os, sender, target, intro))
        assert len(found) == 1
        identifier, p, used, os, sender, target, intro = found[0]
        self.current(identifier, p)
        assert p['status'] in ('pending', 'approved') and time.time() < p['expires']
        assert active(os['policy'], time.time()) and is_open(os['policy'], time.time())
        assert {'algorithm', 'sender_key', 'ciphertext'} <= set(content) <= {'algorithm', 'sender_key', 'ciphertext', 'org.matrix.msgid'}
        if 'org.matrix.msgid' in content:
            assert isinstance(content['org.matrix.msgid'], str) and re.fullmatch(r'[A-Za-z0-9_-]{1,64}', content['org.matrix.msgid'])
        assert content['algorithm'] == 'm.olm.v1.curve25519-aes-sha2' and content['sender_key'] == sender['curve25519']
        assert set(content['ciphertext']) == {target['curve25519']}
        encrypted = content['ciphertext'][target['curve25519']]
        assert set(encrypted) == {'type', 'body'} and type(encrypted['type']) is int and encrypted['type'] in (0, 1)
        assert isinstance(encrypted['body'], str) and re.fullmatch(r'[A-Za-z0-9+/=]{40,30000}', encrypted['body'])
        txn = req.path.rsplit('/', 1)[-1]
        sender_id = ':'.join(who)
        digest = hashlib.sha256(raw).hexdigest()
        prior = self.db.execute('SELECT digest FROM transactions WHERE sender=? AND txn=?', (sender_id, txn)).fetchone()
        if prior:
            assert prior[0] == digest
        else:
            assert p['status'] == 'approved' or (intro and used == 0)
            # Durable reservation BEFORE forwarding. An ambiguous failure consumes quota;
            # the exact transaction may retry, but a new transaction cannot reset it.
            self.db.execute('INSERT INTO transactions VALUES (?,?,?)', (sender_id, txn, digest))
            self.db.execute('UPDATE policies SET used=used+1 WHERE id=?', (identifier,))
            self.db.commit()
        status, data = await self.upstream('PUT', req.path, raw, req.headers['Authorization'])
        if status == 200:
            self.stats['accepted_ciphertexts'] += 1
            with (self.runtime / 'wire.jsonl').open('ab') as f:
                f.write(raw + b'\n')  # Ciphertext only; never uploaded as an artifact.
        return web.Response(status=status, body=data, content_type='application/json')

    async def handle(self, req):
        try:
            assert '//' not in req.path and 'access_token' not in req.query
            if '/user/' not in req.path:
                assert '%' not in req.raw_path.split('?')[0]
            if req.method == 'OPTIONS':
                return web.Response(status=204)
            if req.path == '/health' and req.method == 'GET':
                return web.json_response({'status': 'ok'})
            if req.path == '/_matrix/client/versions' and req.method == 'GET':
                status, raw = await self.upstream('GET', req.path)
                return web.Response(status=status, body=raw, content_type='application/json')
            if req.path == '/_matrix/client/v3/login' and req.method == 'POST':
                status, raw = await self.upstream('POST', req.path, await req.read())
                return web.Response(status=status, body=raw, content_type='application/json')
            who = await self.identity(req)
            # SDK startup stores a sync filter under its own authenticated account.
            # This is not a message-delivery or arbitrary user API exception.
            filter_path = '/_matrix/client/v3/user/' + who[0] + '/filter'
            if ((req.method == 'POST' and req.path == filter_path)
                    or (req.method == 'GET' and re.fullmatch(re.escape(filter_path) + r'/[0-9]+', req.path))):
                status, raw = await self.upstream(req.method, req.raw_path, await req.read(), req.headers['Authorization'])
                return web.Response(status=status, body=raw, content_type='application/json')
            if req.path.startswith('/veil/policy') or '/sendToDevice/' in req.path:
                async with self.lock:
                    if req.path.startswith('/veil/policy'):
                        assert req.path == '/veil/policy' or re.fullmatch('/veil/policy/[a-f0-9]{64}', req.path)
                        return await self.policy(req, who)
                    return await self.send(req, who)
            # No rooms, account data, admin, federation, registration or wildcard proxy.
            allowed = (req.method == 'GET' and req.path in {
                '/_matrix/client/v3/sync', '/_matrix/client/v3/account/whoami',
                '/_matrix/client/v3/capabilities', '/_matrix/client/v3/pushrules/',
                '/_matrix/client/v3/room_keys/version'}) or (
                req.method == 'POST' and req.path in {'/_matrix/client/v3/keys/upload', '/_matrix/client/v3/keys/query', '/_matrix/client/v3/keys/claim'})
            assert allowed
            status, raw = await self.upstream(req.method, req.path_qs, await req.read(), req.headers['Authorization'])
            return web.Response(status=status, body=raw, content_type='application/json')
        except (AssertionError, ValueError, KeyError, TypeError, StopIteration, InvalidTokenError) as error:
            self.stats['denied'] += 1
            # Diagnostic is a code location only: never exception text, identity,
            # access token, request body or decrypted data.
            site = traceback.extract_tb(error.__traceback__)[-1]
            return web.json_response({'errcode': 'M_FORBIDDEN', 'error': f'Veil boundary denied at {site.name}:{site.lineno}'}, status=403)


@web.middleware
async def cors(req, handler):
    response = await handler(req)
    if req.headers.get('Origin') == 'http://127.0.0.1:8766':
        response.headers.update({'Access-Control-Allow-Origin': 'http://127.0.0.1:8766',
                                 'Access-Control-Allow-Headers': 'authorization,content-type',
                                 'Access-Control-Allow-Methods': 'GET,POST,PUT,OPTIONS'})
    return response


if __name__ == '__main__':
    boundary = Boundary(sys.argv[1])
    app = web.Application(client_max_size=65536, middlewares=[cors])
    app.router.add_route('*', '/{tail:.*}', boundary.handle)
    app.on_startup.append(boundary.start)
    app.on_cleanup.append(boundary.stop)
    web.run_app(app, host='127.0.0.1', port=8765, access_log=None, print=None)
