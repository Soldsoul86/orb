"""TEST ONLY: loopback relay controlled through parent stdin, never a deployed HTTP clock API."""
import sys
import threading
from server import Relay, BoundedHTTPServer, handler

def main():
    relay=Relay(sys.argv[1]);clock=[1792389600]  # Monday 2026-10-19 06:00 UTC.
    relay.purposes.clock=lambda:clock[0]
    server=BoundedHTTPServer(('127.0.0.1',0),handler(relay))
    thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
    print(server.server_port,flush=True)
    try:
        for command in sys.stdin:
            if command.startswith('clock '):
                with relay.lock: clock[0]=int(command.split()[1])
                print('ok',flush=True)
            elif command.strip()=='quit': break
    finally:
        server.shutdown();server.server_close();relay.db.close()
if __name__=='__main__':main()
