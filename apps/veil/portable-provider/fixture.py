"""Disposable CI fixture; never use local HTTP mode for internet deployment."""
import argparse
import ssl
from provider import Provider, BoundedHTTPServer, handler

p=argparse.ArgumentParser();p.add_argument('--db',required=True);p.add_argument('--port',type=int,required=True)
p.add_argument('--cert');p.add_argument('--key');args=p.parse_args()
origin=('https' if args.cert else 'http')+'://127.0.0.1:'+str(args.port)
service=Provider(args.db,origin,local=not args.cert)
server=BoundedHTTPServer(('127.0.0.1',args.port),handler(service))
if args.cert:
    context=ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER);context.minimum_version=ssl.TLSVersion.TLSv1_2
    context.load_cert_chain(args.cert,args.key);server.socket=context.wrap_socket(server.socket,server_side=True)
server.serve_forever()
