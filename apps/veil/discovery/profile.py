"""pi/1 discovery extension. Offline verification, using the existing JOSE verifier."""
import json
import re
import sys
import time
import unicodedata
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'portable-provider'))
sys.path.insert(0, str(ROOT / 'relay'))
from open_verifier import verify, state, decode, PREFIX, strict_json
from purpose_policy import validate as validate_policy

TYPE = 'pi-discovery+jws'
CATEGORIES = ('BUILD & AUTOMATE', 'DESIGN & CREATE', 'MARKET & GROW', 'LEARN & IMPROVE')
TAGS = {
    CATEGORIES[0]: ('website', 'web-app', 'android', 'ios', 'automation', 'api', 'ai-integration', 'dashboard'),
    CATEGORIES[1]: ('ui', 'ux', 'branding', 'logo', 'graphic-design', 'presentation', 'video', 'motion'),
    CATEGORIES[2]: ('seo', 'content', 'social', 'copywriting', 'ads', 'analytics', 'positioning'),
    CATEGORIES[3]: ('python', 'coding', 'sql', 'spanish', 'english', 'software-skills', 'coaching'),
}
LANGUAGES = ('english', 'spanish', 'french', 'german', 'hindi', 'arabic', 'portuguese')
FIELDS = {'v', 'controller', 'revision', 'created', 'issued', 'expires', 'visibility', 'consent', 'profile', 'state'}


def canonical(value):
    return json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(',', ':'), allow_nan=False).encode('utf-8')


def integer(value, low, high):
    if type(value) is not int or not low <= value <= high:
        raise ValueError('invalid integer')


def text(value, maximum, minimum=1):
    if (not isinstance(value, str) or not minimum <= len(value) <= maximum or value != value.strip()
            or unicodedata.normalize('NFC', value) != value or any(unicodedata.category(c) in ('Cc', 'Cs', 'Cf') for c in value)):
        raise ValueError('invalid text')
    return value


def array(value, maximum, validate):
    if not isinstance(value, list) or len(value) > maximum or len({canonical(v) for v in value}) != len(value):
        raise ValueError('invalid list')
    for item in value:
        validate(item)


def one_of(value, allowed):
    if not isinstance(value, str) or value not in allowed:
        raise ValueError('invalid choice')


def https(value, origin=False):
    text(value, 1000)
    u = urlsplit(value)
    if (u.scheme != 'https' or not u.hostname or '.' not in u.hostname or u.username or u.password
            or re.search(r'[\s\\<>"\x00-\x1f]', value) or (origin and (u.path or u.query or u.fragment))):
        raise ValueError('HTTPS URL required')
    if origin and not re.fullmatch(r'https://[a-z0-9.-]+(?::[0-9]+)?', value):
        raise ValueError('invalid origin')
    return value


def validate_profile(p):
    required = {'alias', 'purpose', 'category', 'tags'}
    optional = {'languages', 'locations', 'remote', 'evidence', 'accepting', 'budget', 'lead_days'}
    if not isinstance(p, dict) or not required <= p.keys() or p.keys() - required - optional:
        raise ValueError('profile fields')
    text(p['alias'], 60); text(p['purpose'], 240)
    one_of(p['category'], CATEGORIES)
    array(p['tags'], 8, lambda v: one_of(v, TAGS[p['category']]))
    if not p['tags']: raise ValueError('choose a service')
    if 'languages' in p: array(p['languages'], 7, lambda v: one_of(v, LANGUAGES))
    if 'locations' in p: array(p['locations'], 5, lambda v: text(v, 60))
    for k in ('remote', 'accepting'):
        if k in p and type(p[k]) is not bool: raise ValueError(k)
    if 'lead_days' in p: integer(p['lead_days'], 0, 365)
    if 'evidence' in p:
        def evidence(e):
            if not isinstance(e, dict) or set(e) != {'title', 'url'}: raise ValueError('evidence fields')
            text(e['title'], 100); https(e['url'])
        array(p['evidence'], 3, evidence)
    if 'budget' in p:
        b = p['budget']
        if not isinstance(b, dict) or set(b) != {'currency', 'min', 'max', 'unit'}: raise ValueError('budget fields')
        one_of(b['currency'], ('USD', 'EUR', 'GBP', 'INR')); one_of(b['unit'], ('project', 'hour'))
        integer(b['min'], 0, 10000000); integer(b['max'], b['min'], 10000000)
    return p


def verify_profile(token, expected, now=None, allow_removed=False):
    now = int(time.time()) if now is None else now
    if not isinstance(expected, str) or not expected.startswith(PREFIX) or len(decode(expected[len(PREFIX):])) != 32:
        raise ValueError('controller required')
    if not isinstance(token, str) or len(token) > 32000: raise ValueError('profile too large')
    d = verify(token, expected, TYPE)
    if set(d) != FIELDS or d['controller'] != expected or decode(token.split('.')[1]) != canonical(d):
        raise ValueError('noncanonical or incorrectly bound publication')
    if len(decode(token.split('.')[2])) != 64: raise ValueError('signature length')
    integer(d['revision'], 1, 1000000); integer(d['created'], 1, now + 60)
    integer(d['issued'], d['created'], now + 60); integer(d['expires'], d['issued'] + 1, d['issued'] + 30 * 86400)
    if d['expires'] <= now: raise ValueError('expired publication')
    one_of(d['visibility'], ('PRIVATE', 'LINK_ONLY', 'PUBLIC', 'DELETED'))
    if type(d['consent']) is not bool or d['consent'] != (d['visibility'] == 'PUBLIC'): raise ValueError('explicit consent required')
    if d['visibility'] in ('PRIVATE', 'DELETED'):
        if not allow_removed or d['profile'] != {} or d['state'] is not None: raise ValueError('removed record must be minimal')
        return d, None
    validate_profile(d['profile'])
    s = state(d['state'], expected); https(s['route'], origin=True)
    integer(s['issued'], 1, now + 60)
    p = validate_policy(s['policy'])
    if p['contact_request_mode'] == 'AUTO_ACCEPT_WITH_LIMITS': raise ValueError('approval required')
    if p['status'] == 'REVOKED' or (p['expires_at'] and p['expires_at'] <= now): raise ValueError('purpose unavailable')
    if d['expires'] > (p['expires_at'] or d['expires']): raise ValueError('publication outlives purpose')
    if p['discovery_mode'] != ('PUBLIC_SEARCHABLE' if d['visibility'] == 'PUBLIC' else 'LINK_ONLY'):
        raise ValueError('purpose visibility does not authorize publication')
    if d['profile'].get('accepting') is True and (p['status'] != 'ACTIVE' or p['contact_request_mode'] != 'REQUEST_APPROVAL'):
        raise ValueError('paused/disabled purpose cannot accept enquiries')
    return d, s


def contact_link(s):
    return s['route'] + '/g/' + s['id'][len(PREFIX):]


if __name__ == '__main__':
    try:
        card = strict_json(Path(sys.argv[1]).read_bytes())
        d, s = verify_profile(card['publication'], sys.argv[2])
        print('PASS: offline signature, pinned controller, profile and route binding; not professional credentials.')
        print('Revision:', d['revision'], 'Visibility:', d['visibility'])
    except Exception:
        raise SystemExit('FAIL: invalid or expired publication') from None
