"""Loopback-only development UI. Never connects to the live provider or reads message bodies."""
import argparse
import json
import ssl
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
ROOT=Path(__file__).resolve().parent
ASSETS={'/':('index.html','text/html; charset=utf-8'),'/style.css':('style.css','text/css; charset=utf-8')}
for name in ['app','address','strict-json','identity','gate','state','view']:
    ASSETS['/src/'+name+'.mjs']=('src/'+name+'.mjs','text/javascript; charset=utf-8')
CSP="default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; object-src 'none'"
def reply_for(method,path):
    if method not in ('GET','HEAD'):return 503,'application/json',b'{"error":"guest_messaging_disabled"}'
    if path=='/guest-capabilities':return 200,'application/json',b'{"guestMessaging":false,"browserE2ee":false}'
    if path not in ASSETS:return 404,'application/json',b'{"error":"not_found"}'
    file,mime=ASSETS[path];return 200,mime,(ROOT/file).read_bytes()
class Handler(BaseHTTPRequestHandler):
    server_version='VeilGuestDevelopment'
    def log_message(self,*_):pass
    def setup(self):
        super().setup();self.connection.settimeout(5)
    def respond(self):
        expected={f'127.0.0.1:{self.server.server_port}',f'localhost:{self.server.server_port}'}
        if self.headers.get('Host') not in expected: status,mime,body=421,'application/json',b'{"error":"wrong_host"}'
        else: status,mime,body=reply_for(self.command,self.path)
        self.close_connection=True
        self.send_response(status)
        for k,v in [('Content-Type',mime),('Content-Length',str(len(body))),('Cache-Control','no-store'),('Referrer-Policy','no-referrer'),('Content-Security-Policy',CSP),('X-Content-Type-Options','nosniff'),('X-Frame-Options','DENY'),('Cross-Origin-Resource-Policy','same-origin'),('Permissions-Policy','camera=(), microphone=(), geolocation=()'),('Connection','close')]:self.send_header(k,v)
        if isinstance(self.connection,ssl.SSLSocket):self.send_header('Strict-Transport-Security','max-age=31536000')
        self.end_headers()
        if self.command!='HEAD':self.wfile.write(body)
    do_GET=do_HEAD=do_POST=do_PUT=do_DELETE=do_PATCH=do_OPTIONS=respond
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--port',type=int,default=8765);p.add_argument('--cert');p.add_argument('--key');a=p.parse_args()
    if bool(a.cert)!=bool(a.key):p.error('--cert and --key must be supplied together')
    server=HTTPServer(('127.0.0.1',a.port),Handler)
    if a.cert:
        ctx=ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER);ctx.minimum_version=ssl.TLSVersion.TLSv1_2;ctx.load_cert_chain(a.cert,a.key);server.socket=ctx.wrap_socket(server.socket,server_side=True)
    print('Development only: guest sending is disabled.',flush=True)
    server.serve_forever()
