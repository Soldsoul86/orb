"""Loopback development preview. No message transport, arbitrary URL fetch, or request logging."""
import argparse
import hashlib
import json
import os
import secrets
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from urllib.parse import urlsplit
from directory import Directory, Conflict
from search import SYNONYMS
from profile import CATEGORIES, TAGS, LANGUAGES, PREFIX, strict_json, decode, verify_profile, contact_link

ROOT = Path(__file__).parent
ASSETS = {'/':('index.html','text/html; charset=utf-8'), '/app.mjs':('app.mjs','text/javascript'),
          '/verify.mjs':('verify.mjs','text/javascript'), '/style.css':('style.css','text/css')}
CSP = "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; object-src 'none'"


class Limits:
    def __init__(self): self.buckets = {}; self.secret = secrets.token_bytes(32); self.lock = threading.Lock()
    def allow(self, ip, kind, now=None):
        now = time.monotonic() if now is None else now
        key = (hashlib.sha256(self.secret + ip.encode()).digest(), kind)
        with self.lock:
            self.buckets = {k:v for k,v in self.buckets.items() if now-v[0]<60}
            for k, max_count in ((('global',kind), 300), (key, 60 if kind=='read' else 15)):
                start, count = self.buckets.get(k, (now,0))
                if count >= max_count: return False
                self.buckets[k] = (start,count+1)
            return True


class PreviewServer(HTTPServer):
    def __init__(self, address, directory, test_mode=False):
        super().__init__(address, Handler)
        self.directory = directory; self.test_mode = test_mode; self.limits = Limits()


class Handler(BaseHTTPRequestHandler):
    server_version = 'VeilDiscoveryPreview'
    def log_message(self, *_): pass
    def setup(self):
        super().setup(); self.connection.settimeout(5)
    def reply(self, status, body, mime='application/json'):
        if not isinstance(body, bytes): body = json.dumps(body, ensure_ascii=False).encode()
        self.close_connection = True
        self.send_response(status)
        for k,v in [('Content-Type',mime),('Content-Length',str(len(body))),('Cache-Control','no-store'),
                    ('Referrer-Policy','no-referrer'),('Content-Security-Policy',CSP),('X-Content-Type-Options','nosniff'),
                    ('X-Frame-Options','DENY'),('X-Robots-Tag','noindex, nofollow'),('Cross-Origin-Resource-Policy','same-origin'),
                    ('Permissions-Policy','camera=(), microphone=(), geolocation=()'),('Connection','close')]:
            self.send_header(k,v)
        self.end_headers()
        if self.command != 'HEAD': self.wfile.write(body)
    def respond(self):
        expected = {f'localhost:{self.server.server_port}', f'127.0.0.1:{self.server.server_port}'}
        if self.headers.get('Host') not in expected: return self.reply(421, {'error':'wrong_host'})
        if len(self.path)>500: return self.reply(414, {'error':'path_too_long'})
        path = urlsplit(self.path).path
        # This route does not read the body. No UI/environment flag can enable it.
        if path.startswith(('/guest/send','/v3/command','/api/send')):
            return self.reply(503, {'error':'guest_messaging_disabled'})
        kind = 'read' if self.command in ('GET','HEAD') or path=='/api/search' else 'write'
        if not self.server.limits.allow(self.client_address[0],kind): return self.reply(429, {'error':'rate_limited'})
        try:
            if self.command in ('GET','HEAD'):
                if self.path != path: return self.reply(404, {'error':'not_found'})
                if path in ASSETS:
                    file,mime=ASSETS[path];return self.reply(200,(ROOT/'web'/file).read_bytes(),mime)
                if path.startswith('/guest/src/'):
                    name=path.removeprefix('/guest/src/')
                    if name in ('identity.mjs','address.mjs','strict-json.mjs','gate.mjs'):
                        return self.reply(200,(ROOT.parent/'guest-web'/'src'/name).read_bytes(),'text/javascript')
                if path=='/api/config': return self.reply(200, {'categories':CATEGORIES,'tags':TAGS,'synonyms':SYNONYMS,'languages':LANGUAGES,'testMode':self.server.test_mode,'guestMessaging':False})
                if path=='/robots.txt': return self.reply(200,b'User-agent: *\nDisallow: /\n','text/plain')
                if path=='/sitemap.xml': return self.reply(200,b'<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"/>','application/xml')
                if path.startswith('/api/qr/'):
                    import io
                    import qrcode
                    suffix=path.removeprefix('/api/qr/')
                    if len(decode(suffix))!=32: raise ValueError()
                    result=self.server.directory.get(PREFIX+suffix)
                    if not result:return self.reply(404, {'error':'not_found'})
                    _,state=verify_profile(result['publication'],PREFIX+suffix)
                    image=qrcode.make(contact_link(state));out=io.BytesIO();image.save(out,format='PNG')
                    return self.reply(200,out.getvalue(),'image/png')
                if path.startswith('/api/profile/'):
                    suffix=path.removeprefix('/api/profile/')
                    if len(decode(suffix))!=32: raise ValueError()
                    result=self.server.directory.get(PREFIX+suffix)
                    return self.reply(200 if result else 404,result or {'error':'not_found'})
                return self.reply(404, {'error':'not_found'})
            if self.command!='POST' or path not in ('/api/search','/api/publish','/api/report'):
                return self.reply(404, {'error':'not_found'})
            origin=self.headers.get('Origin')
            if origin and origin not in {'http://'+v for v in expected}: return self.reply(403, {'error':'wrong_origin'})
            if self.headers.get('Content-Type')!='application/json' or self.headers.get('Transfer-Encoding'):
                return self.reply(415, {'error':'json_required'})
            length=int(self.headers.get('Content-Length','0'))
            if not 0<length<=33000: return self.reply(413, {'error':'body_limit'})
            d=strict_json(self.rfile.read(length))
            if not isinstance(d,dict): raise ValueError()
            if path=='/api/search' and set(d)<= {'query','category'} and 'query' in d:
                return self.reply(200,self.server.directory.search(d['query'],d.get('category')))
            if path=='/api/publish' and set(d)=={'controller','publication'}:
                return self.reply(200,self.server.directory.publish(d['controller'],d['publication']))
            if path=='/api/report' and set(d)=={'controller','reason'}:
                self.server.directory.report(d['controller'],d['reason']);return self.reply(202,{'recorded':True})
            raise ValueError()
        except Conflict: return self.reply(409, {'error':'stale_or_conflicting_revision'})
        except (ValueError,TypeError,KeyError,IndexError): return self.reply(400, {'error':'invalid_request'})
        except Exception: return self.reply(503, {'error':'temporarily_unavailable'})
    do_GET=do_HEAD=do_POST=do_PUT=do_DELETE=do_PATCH=do_OPTIONS=respond


if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--port',type=int,default=8766);parser.add_argument('--test-mode',action='store_true');a=parser.parse_args()
    directory=Directory(os.environ['DISCOVERY_DATABASE_URL'])
    print('Loopback discovery preview. Secure messaging is not available yet.',flush=True)
    PreviewServer(('127.0.0.1',a.port),directory,a.test_mode).serve_forever()
