"""Admission unit tests; SDK encryption/Android acceptance are separate real tests."""
import asyncio
import base64
import hashlib
import json
import tempfile
import time
import unittest
from pathlib import Path
from types import SimpleNamespace

import jwt
from cryptography.hazmat.primitives.asymmetric import ec
from pilot_provider import PilotBoundary, digest


def public(key):
    return json.loads(jwt.algorithms.ECAlgorithm.to_jwk(key.public_key()))


def identifier(key):
    encoded = json.dumps(public(key), sort_keys=True, separators=(',', ':')).encode()
    return 'urn:ietf:params:oauth:jwk-thumbprint:sha-256:' + base64.urlsafe_b64encode(hashlib.sha256(encoded).digest()).decode().rstrip('=')


def sign(key, value, typ):
    return jwt.encode(value, key, algorithm='ES256', headers={'typ': typ, 'jwk': public(key)})


def card(key, user, device='DEVICE'):
    controller = identifier(key)
    p = {'display_name': 'TEST', 'description': '', 'discovery_mode': 'UNLISTED', 'contact_request_mode': 'REQUEST_APPROVAL',
         'allowed_content_types': ['text'], 'schedule': {'timezone': 'UTC', 'weekdays': list(range(1, 8)), 'start': 0, 'end': 1440},
         'outside_hours_behavior': 'REJECT', 'first_contact_message_limit': 1, 'inactivity_days': 7, 'expires_at': 0,
         'notification_behavior': 'SILENT_IN_APP', 'status': 'ACTIVE', 'policy_version': 1}
    state = sign(key, {'v': 1, 'id': controller, 'device': public(key), 'revision': 1, 'issued': int(time.time()), 'epoch': 'a'*32, 'route': 'https://veil.test', 'policy': p}, 'pi-state+jws')
    endpoint = {'user_id': user, 'device_id': device, 'ed25519': 'a'*43, 'curve25519': ('b' if user == '@owner:veil.test' else 'c')*43}
    binding = sign(key, {'v': 1, 'iss': controller, 'state_hash': base64.urlsafe_b64encode(hashlib.sha256(state.encode()).digest()).decode().rstrip('='), 'endpoint': endpoint}, 'pi-matrix-binding+jws')
    return {'id': controller, 'state': state, 'binding': binding}


class PolicyTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        root = Path(self.tmp.name)
        (root/'accounts.json').write_text(json.dumps([{'username': 'owner'}]))
        self.boundary = PilotBoundary(root)
        self.owner_key = ec.generate_private_key(ec.SECP256R1())
        self.guest_key = ec.generate_private_key(ec.SECP256R1())
        self.owner = card(self.owner_key, '@owner:veil.test')
        self.guest = card(self.guest_key, '@guest:veil.test')
        now = int(time.time())
        self.enrollment = {'v': 1, 'iss': self.owner['id'], 'invite': 'e'*64, 'revision': 1, 'issued': now, 'expires': now+900, 'owner': self.owner}
        self.who = ('@owner:veil.test', 'DEVICE')
        async def identity(req): return self.who
        async def device(endpoint, auth): pass  # Crypto-device verification covered by actual SDK tests.
        async def upstream(*args, **kwargs): return 200, b'{}'
        self.boundary.identity = identity
        self.boundary.device = device
        self.boundary.upstream = upstream
        await self.enroll()
        self.who = ('@guest:veil.test', 'DEVICE')
        self.id = digest('e'*64+self.guest['id'])
        creds = {'user_id': self.who[0], 'device_id': self.who[1]}
        self.boundary.db.execute('INSERT INTO guests VALUES (?,?,?,?,NULL)', (self.id, 'e'*64, self.guest['id'], json.dumps(creds)))
        self.boundary.db.commit()
        self.claim = sign(self.guest_key, {'v': 1, 'iss': self.guest['id'], 'invite': 'e'*64, 'guest': self.guest}, 'pi-matrix-claim+jws')
        await self.boundary.pilot(self.req('/pilot/claim', {'guest': self.guest['id'], 'token': self.claim}))

    def req(self, path, body=None, method='POST'):
        async def read(): return json.dumps(body).encode()
        return SimpleNamespace(path=path, method=method, read=read, headers={'Authorization': 'Bearer fixture'}, match_info={'tail': path[1:]})

    async def enroll(self):
        token = sign(self.owner_key, self.enrollment, 'pi-matrix-enrollment+jws')
        return await self.boundary.pilot(self.req('/pilot/enroll', {'owner': self.owner['id'], 'token': token}))

    async def decision(self, status):
        p = self.boundary.policies()[0][1]
        p['revision'] += 1; p['status'] = status
        body = {'owner': self.owner['id'], 'token': sign(self.owner_key, p, 'pi-matrix-policy+jws')}
        return await self.boundary.policy(self.req('/veil/policy', body), ('@owner:veil.test', 'DEVICE')), body

    def ciphertext(self, owner=False):
        sender, target = ('b'*43, 'c'*43) if owner else ('c'*43, 'b'*43)
        return {'messages': {('@guest:veil.test' if owner else '@owner:veil.test'): {'DEVICE': {'algorithm': 'm.olm.v1.curve25519-aes-sha2', 'sender_key': sender, 'ciphertext': {target: {'type': 0, 'body': 'd'*80}}}}}}

    async def send(self, txn='txn', owner=False, body=None):
        return await self.boundary.send(self.req('/_matrix/client/v3/sendToDevice/m.room.encrypted/'+txn, body or self.ciphertext(owner), 'PUT'), ('@owner:veil.test' if owner else '@guest:veil.test', 'DEVICE'))

    async def test_claim_exact_retry_and_substitution(self):
        await self.boundary.pilot(self.req('/pilot/claim', {'guest': self.guest['id'], 'token': self.claim}))
        self.assertEqual(len(self.boundary.policies()), 1)
        altered = card(self.guest_key, '@other:veil.test')
        token = sign(self.guest_key, {'v': 1, 'iss': self.guest['id'], 'invite': 'e'*64, 'guest': altered}, 'pi-matrix-claim+jws')
        with self.assertRaises(AssertionError): await self.boundary.pilot(self.req('/pilot/claim', {'guest': self.guest['id'], 'token': token}))

    async def test_one_intro_and_exact_ciphertext_retry(self):
        await self.send(); await self.send()
        with self.assertRaises(AssertionError): await self.send('second')
        body = self.ciphertext(); body['messages']['@owner:veil.test']['DEVICE']['ciphertext']['b'*43]['body'] = 'f'*80
        with self.assertRaises(AssertionError): await self.send(body=body)
        with self.assertRaises(AssertionError): await self.send(owner=True)

    async def test_approve_exact_retry_and_terminal_decisions(self):
        _, body = await self.decision('approved')
        await self.boundary.policy(self.req('/veil/policy', body), ('@owner:veil.test', 'DEVICE'))
        await self.send(owner=True)
        await self.decision('revoked')
        with self.assertRaises(AssertionError): await self.send('again', owner=True)
        with self.assertRaises(AssertionError): await self.send()
        with self.assertRaises(AssertionError): await self.decision('approved')

    async def test_decline_and_block_are_terminal(self):
        for status in ('declined', 'blocked'):
            with self.subTest(status=status):
                original = self.boundary.policies()[0][1]
                original['status'] = 'pending'; original['revision'] = 1
                self.boundary.db.execute('UPDATE policies SET value=?,token=?', (json.dumps(original), ''));self.boundary.db.commit()
                await self.decision(status)
                with self.assertRaises(AssertionError): await self.send()
                with self.assertRaises(AssertionError): await self.send(owner=True)
                with self.assertRaises(AssertionError): await self.decision('approved')

    async def test_wrong_signer_and_expiration(self):
        p = self.boundary.policies()[0][1];p['status'] = 'approved';p['revision'] = 2
        with self.assertRaises(Exception): await self.boundary.policy(self.req('/veil/policy', {'owner': self.owner['id'], 'token': sign(self.guest_key, p, 'pi-matrix-policy+jws')}), ('@owner:veil.test', 'DEVICE'))
        p['expires'] = int(time.time())-1
        self.boundary.db.execute('UPDATE policies SET value=?', (json.dumps(p),));self.boundary.db.commit()
        with self.assertRaises(AssertionError): await self.send()

    async def test_latest_signed_pause_overrides_prior_grant(self):
        await self.decision('approved')
        state = jwt.decode(self.owner['state'], options={'verify_signature': False});state['revision'] += 1;state['policy']['status'] = 'PAUSED';state['policy']['policy_version'] += 1
        token = sign(self.owner_key, state, 'pi-state+jws')
        binding = jwt.decode(self.owner['binding'], options={'verify_signature': False});binding['state_hash'] = base64.urlsafe_b64encode(hashlib.sha256(token.encode()).digest()).decode().rstrip('=')
        self.enrollment['revision'] += 1;self.enrollment['owner'] = {'id': self.owner['id'], 'state': token, 'binding': sign(self.owner_key, binding, 'pi-matrix-binding+jws')}
        self.who = ('@owner:veil.test', 'DEVICE');await self.enroll()
        with self.assertRaises(AssertionError): await self.send(owner=True)
        with self.assertRaises(AssertionError): await self.send()

    async def test_guest_cannot_host_new_invitation(self):
        p = dict(self.enrollment, iss=self.guest['id'], owner=self.guest, invite='f'*64)
        with self.assertRaises(AssertionError): await self.boundary.pilot(self.req('/pilot/enroll', {'owner': self.guest['id'], 'token': sign(self.guest_key, p, 'pi-matrix-enrollment+jws')}))

    async def asyncTearDown(self):
        await self.boundary.stop(None);self.tmp.cleanup()


if __name__ == '__main__': unittest.main()
