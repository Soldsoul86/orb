"""Synthetic TEST identities; owner-consent simulated explicitly here, never production seed data."""
import hashlib
import json
import sys
import time
from pathlib import Path
from cryptography.hazmat.primitives.asymmetric import ec
import jwt
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from profile import canonical, TYPE, CATEGORIES
from open_verifier import encode, public_id

# Deliberately small, uneven supply: expectations measure this set, not a real market.
PEOPLE = {
 'web': (0,['website','web-app'],'Build business websites and web applications',900,True,['english'],'London',10),
 'web-budget': (0,['website'],'Build small business websites',400,True,['english','spanish'],'Madrid',7),
 'automation': (0,['automation','api','ai-integration','dashboard'],'Automate reports, CRM APIs and internal dashboards',1500,True,['english'],'London',14),
 'mobile': (0,['android','ios'],'Develop Android and iOS mobile applications',3000,True,['english','hindi'],'Bengaluru',21),
 'interface': (1,['ui','ux'],'Redesign Android app interfaces and improve user experience',800,True,['english','spanish'],'Madrid',7),
 'brand': (1,['branding','logo','graphic-design'],'Create visual identities, logos and graphics',450,True,['english'],'London',7),
 'media': (1,['video','motion','presentation'],'Edit promo videos, motion graphics and pitch decks',600,True,['english'],'London',10),
 'interface-local': (1,['ui','ux'],'In-person interface redesign and user research',1200,False,['english'],'London',14),
 'seo': (2,['seo','analytics'],'Improve organic search visibility and marketing analytics',1000,True,['english'],'London',14),
 'content': (2,['content','social','copywriting','positioning'],'Create content strategy, Instagram posts and positioning',500,True,['english','spanish'],'Madrid',7),
 'ads': (2,['ads','analytics'],'Set up paid advertising campaigns and analytics',700,True,['english'],'London',7),
 'seo-local': (2,['seo'],'In-person SEO and organic search consulting',1500,False,['english'],'London',21),
 'coding': (3,['python','coding','sql','software-skills'],'Teach Python coding, SQL and software skills',60,True,['english'],'London',7),
 'language': (3,['spanish','english'],'Teach conversational Spanish and English lessons',40,True,['english','spanish'],'Madrid',3),
 'skills': (3,['coaching','software-skills'],'Professional skills coaching and Excel lessons',100,True,['english'],'London',10),
 'coding-local': (3,['python','coding','sql'],'In-person Python and SQL coding tutor',80,False,['english'],'London',14),
}


def keys(name):
    # Known, derivable test key. Never import any fixture key into a real wallet.
    private=ec.derive_private_key(int.from_bytes(hashlib.sha256(('VEIL TEST ONLY '+name).encode()).digest(),'big'),ec.SECP256R1())
    nums=private.public_key().public_numbers()
    return private,dict(kty='EC',crv='P-256',x=encode(nums.x.to_bytes(32,'big')),y=encode(nums.y.to_bytes(32,'big')))


def sign(body,key,jwk,typ=TYPE):
    # Signing canonical bytes through maintained PyJWT JWS; no bespoke crypto.
    return jwt.api_jws.PyJWS().encode(canonical(body),key,algorithm='ES256',headers={'typ':typ,'jwk':jwk},sort_headers=True)


def make(name,now=None,revision=1,visibility='PUBLIC',changes=None,policy_changes=None,state_revision=1):
    now=int(time.time()) if now is None else now
    c,tags,purpose,price,remote,langs,location,lead=PEOPLE[name]
    key,jwk=keys(name);identifier=public_id(jwk)
    policy=dict(display_name='TEST '+name,description='Synthetic TEST fixture. Not a real professional.',discovery_mode='PUBLIC_SEARCHABLE' if visibility=='PUBLIC' else 'LINK_ONLY',contact_request_mode='REQUEST_APPROVAL',allowed_content_types=['text'],first_contact_message_limit=1,schedule=dict(timezone='UTC',weekdays=[1,2,3,4,5],start=540,end=1080),outside_hours_behavior='REJECT',inactivity_days=30,expires_at=0,notification_behavior='SILENT_IN_APP',status='ACTIVE',policy_version=state_revision)
    policy.update(policy_changes or {})
    s=dict(v=1,id=identifier,device=keys(name+' device')[1],revision=state_revision,issued=now,epoch='0'*32,route='https://test-provider.example',policy=policy)
    p=dict(alias='TEST '+name,purpose=purpose,category=CATEGORIES[c],tags=tags,languages=langs,locations=[location],remote=remote,accepting=True,budget=dict(currency='USD',min=price//2,max=price,unit='hour' if c==3 else 'project'),lead_days=lead)
    d=dict(v=1,controller=identifier,revision=revision,created=now,issued=now,expires=now+86400,visibility=visibility,consent=visibility=='PUBLIC',profile=p,state=sign(s,key,jwk,'pi-state+jws'))
    if visibility in ('PRIVATE','DELETED'):d.update(profile={},state=None)
    d.update(changes or {})
    return identifier,sign(d,key,jwk),d,s


def seed(directory,now=None):
    return {name:directory.publish(*make(name,now)[:2]) for name in PEOPLE}


def test_database_url():
    import os
    from urllib.parse import urlsplit,parse_qs
    url=os.environ['DISCOVERY_TEST_DATABASE_URL'];u=urlsplit(url)
    if u.hostname not in ('localhost','127.0.0.1') or u.path!='/veil_discovery_test':
        raise ValueError('Tests reset only a loopback veil_discovery_test database')
    host=parse_qs(u.query).get('host',['localhost'])[0]
    if host not in ('localhost','127.0.0.1') and not host.startswith('/tmp/'):
        raise ValueError('Test database host must be loopback or a temporary local socket')
    return url
