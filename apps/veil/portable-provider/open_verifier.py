"""Independent RFC 9278/JWS verifier. No Android, company API or network imports."""
import base64
import hashlib
import json
import re
import sys
import jwt

PREFIX = 'urn:ietf:params:oauth:jwk-thumbprint:sha-256:'


def encode(raw):
    return base64.urlsafe_b64encode(raw).decode().rstrip('=')


def decode(value):
    if not isinstance(value, str) or not re.fullmatch(r'[A-Za-z0-9_-]+', value):
        raise ValueError('invalid base64url')
    raw = base64.urlsafe_b64decode(value + '='*(-len(value) % 4))
    if encode(raw) != value:
        raise ValueError('noncanonical base64url')
    return raw


def strict_json(raw):
    def unique(pairs):
        result = {}
        for k, v in pairs:
            if k in result:
                raise ValueError('duplicate JSON member')
            result[k] = v
        return result
    return json.loads(raw, object_pairs_hook=unique, parse_constant=lambda _: (_ for _ in ()).throw(ValueError('constant')))


def public_id(key):
    if (not isinstance(key, dict) or set(key) != {'kty', 'crv', 'x', 'y'}
            or key['kty'] != 'EC' or key['crv'] != 'P-256'
            or len(decode(key['x'])) != 32 or len(decode(key['y'])) != 32):
        raise ValueError('public P-256 JWK required')
    jwt.PyJWK.from_dict(key)  # OpenSSL-backed point validation; no private scalar accepted.
    return PREFIX + encode(hashlib.sha256(json.dumps(key, sort_keys=True, separators=(',', ':')).encode()).digest())


def verify(token, expected, typ):
    if not isinstance(token, str) or len(token) > 262144 or len(token.split('.')) != 3:
        raise ValueError('invalid JWS')
    header = strict_json(decode(token.split('.')[0]))
    if set(header) != {'alg', 'typ', 'jwk'} or header['alg'] != 'ES256' or header['typ'] != typ:
        raise ValueError('unsupported JOSE header')
    if public_id(header['jwk']) != expected:
        raise ValueError('wrong controller')
    payload = strict_json(decode(token.split('.')[1]))
    jwt.decode(token, jwt.PyJWK.from_dict(header['jwk']).key, algorithms=['ES256'], options={
        'verify_aud': False, 'verify_exp': False, 'verify_iat': False, 'verify_nbf': False,
        'verify_iss': False, 'verify_sub': False, 'verify_jti': False})
    if not isinstance(payload, dict) or type(payload.get('v')) is not int or payload['v'] != 1:
        raise ValueError('unsupported payload')
    return payload


def state(token, expected=None, minimum=1):
    if not isinstance(token, str) or len(token) > 262144:
        raise ValueError('state too large')
    header = strict_json(decode(token.split('.')[0]))
    identifier = expected or public_id(header['jwk'])
    value = verify(token, identifier, 'pi-state+jws')
    if (set(value) != {'v', 'id', 'device', 'revision', 'issued', 'epoch', 'route', 'policy'}
            or value['id'] != identifier or type(value['revision']) is not int
            or not minimum <= value['revision'] <= 1000000
            or not re.fullmatch('[a-f0-9]{32}', value['epoch'])):
        raise ValueError('invalid state')
    public_id(value['device'])
    return value


if __name__ == '__main__':
    try:
        # Input is a public route/state card; never a recovery package or key.
        with open(sys.argv[1], encoding='utf8') as f:
            card = strict_json(f.read(262145))
        result = state(card['state'], sys.argv[2])
        print('PASS: independently verified pinned controller and signed state, revision', result['revision'])
        print('No network or Provider A lookup was used. This is key control, not a legal identity.')
    except Exception:
        raise SystemExit('FAIL: invalid public state or pinned controller') from None
