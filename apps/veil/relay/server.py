"""Veil opaque mailbox relay. Standard library only; deploy behind HTTPS."""
import base64
import hashlib
import hmac
import json
import os
import re
import secrets
import sqlite3
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

MAX_BODY = 12 * 1024 * 1024
MAX_TTL = 7 * 86400
TOKEN = re.compile(r'^[A-Za-z0-9_-]{43}$')
ID = re.compile(r'^[a-f0-9]{32}$')

class Relay:
    def __init__(self, path, database_url=None):
        if database_url:
            from postgres_store import PostgresStore
            self.db = PostgresStore(database_url)
            self.order_column = 'seq'
        else:
            self.db = sqlite3.connect(path, check_same_thread=False)
            self.order_column = 'rowid'
        self.lock = threading.RLock()
        self.registrations = []
        if not database_url:
            self.db.executescript('''
            PRAGMA journal_mode=WAL;
            PRAGMA secure_delete=ON;
            CREATE TABLE IF NOT EXISTS boxes(id TEXT PRIMARY KEY, reader BLOB, writer BLOB, expires INTEGER);
            CREATE TABLE IF NOT EXISTS messages(box TEXT, id TEXT, body BLOB, expires INTEGER, PRIMARY KEY(box,id));
            CREATE TABLE IF NOT EXISTS receipts(box TEXT, id TEXT, expires INTEGER, PRIMARY KEY(box,id));
            ''')
    def clean(self):
        now = int(time.time())
        self.db.execute('DELETE FROM messages WHERE expires <= ? OR box IN (SELECT id FROM boxes WHERE expires <= ?)', (now, now))
        self.db.execute('DELETE FROM receipts WHERE expires <= ?', (now,))
        self.db.execute('DELETE FROM boxes WHERE expires <= ?', (now,))
    def handle(self, method, path, bearer, data):
        with self.lock, self.db:
            self.clean()
            if method == 'GET' and path in ('/', '/healthz'):
                return 200, {'status': 'ok', 'service': 'Veil encrypted relay'}
            if method == 'POST' and path == '/v1/boxes':
                self.registrations = [t for t in self.registrations if t > time.time()-3600]
                if len(self.registrations) >= 60: return 429, {'error': 'registration rate limit'}
                if self.db.execute('SELECT count(*) FROM boxes').fetchone()[0] >= 1000:
                    return 503, {'error': 'capacity'}
                if not all(TOKEN.fullmatch(data.get(k, '')) for k in ('reader', 'writer')) or data['reader'] == data['writer']:
                    return 400, {'error': 'invalid capability'}
                box = secrets.token_hex(16)
                self.registrations.append(time.time())
                self.db.execute('INSERT INTO boxes VALUES(?,?,?,?)', (box, self.digest(data['reader']), self.digest(data['writer']), int(time.time()) + 30*86400))
                return 201, {'id': box}
            parts = path.strip('/').split('/')
            if len(parts) < 3 or parts[:2] != ['v1', 'boxes'] or not ID.fullmatch(parts[2]):
                return 404, {'error': 'not found'}
            box = parts[2]
            row = self.db.execute('SELECT reader,writer FROM boxes WHERE id=?', (box,)).fetchone()
            write = method == 'PUT'
            if row is None or not hmac.compare_digest(row[1 if write else 0], self.digest(bearer)):
                return 404, {'error': 'not found'}
            if method == 'DELETE' and len(parts) == 3:
                for table in ('messages', 'receipts', 'boxes'):
                    self.db.execute(f'DELETE FROM {table} WHERE {"id" if table == "boxes" else "box"}=?', (box,))
                return 200, {}
            if len(parts) < 4 or parts[3] != 'messages':
                return 404, {'error': 'not found'}
            if method == 'GET' and len(parts) == 4:
                rows = self.db.execute(f'SELECT id,body,expires FROM messages WHERE box=? ORDER BY {self.order_column} LIMIT 1', (box,)).fetchall()
                return 200, {'messages': [{'id': r[0], 'body': r[1], 'expires': r[2]} for r in rows]}
            if len(parts) != 5 or not ID.fullmatch(parts[4]):
                return 400, {'error': 'invalid id'}
            mid = parts[4]
            if method == 'DELETE':
                self.db.execute('DELETE FROM messages WHERE box=? AND id=?', (box, mid))
                return 200, {}
            if method == 'PUT':
                body, expires = data.get('body'), data.get('expires')
                if not isinstance(body, str) or not isinstance(expires, int) or not int(time.time()) < expires <= int(time.time()) + MAX_TTL:
                    return 400, {'error': 'invalid envelope'}
                try:
                    raw = base64.b64decode(body, validate=True)
                    if not 32 <= len(raw) <= 8*1024*1024: raise ValueError()
                except (ValueError, TypeError):
                    return 400, {'error': 'invalid envelope'}
                if self.db.execute('SELECT 1 FROM receipts WHERE box=? AND id=?', (box, mid)).fetchone():
                    return 200, {}
                size = self.db.execute('SELECT coalesce(sum(length(body)),0),count(*) FROM messages WHERE box=?', (box,)).fetchone()
                total = self.db.execute('SELECT coalesce(sum(length(body)),0) FROM messages').fetchone()[0]
                receipts = self.db.execute('SELECT count(*) FROM receipts').fetchone()[0]
                if receipts >= 100000 or total + len(body) > 256*1024*1024 or size[0] + len(body) > 64*1024*1024 or size[1] >= 100:
                    return 429, {'error': 'mailbox full'}
                self.db.execute('INSERT INTO messages(box,id,body,expires) VALUES(?,?,?,?)', (box, mid, body, expires))
                self.db.execute('INSERT INTO receipts VALUES(?,?,?)', (box, mid, expires))
                return 201, {}
            return 405, {'error': 'method not allowed'}
    @staticmethod
    def digest(value):
        return hashlib.sha256(value.encode()).digest()

def handler(relay):
    class Handler(BaseHTTPRequestHandler):
        server_version = 'VeilRelay'
        def log_message(self, *_): pass  # No request paths, capabilities, bodies, or IP logs.
        def do_GET(self): self.run_request()
        def do_POST(self): self.run_request()
        def do_PUT(self): self.run_request()
        def do_DELETE(self): self.run_request()
        def run_request(self):
            self.connection.settimeout(15)
            try:
                length = int(self.headers.get('Content-Length', '0'))
                if length < 0 or length > MAX_BODY:
                    self.reply(413, {'error': 'too large'}); return
                data = json.loads(self.rfile.read(length)) if length else {}
                if not isinstance(data, dict): raise ValueError()
                auth = self.headers.get('Authorization', '')
                status, result = relay.handle(self.command, self.path, auth.removeprefix('Bearer '), data)
                self.reply(status, result)
            except (ValueError, TypeError, KeyError): self.reply(400, {'error': 'invalid request'})
            except (TimeoutError, ConnectionError): pass
            except Exception: self.reply(500, {'error': 'relay failure'})
        def reply(self, status, data):
            raw = json.dumps(data, separators=(',', ':')).encode()
            self.send_response(status)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Cache-Control', 'no-store')
            self.send_header('Content-Length', str(len(raw)))
            self.end_headers()
            self.wfile.write(raw)
    return Handler

class BoundedHTTPServer(ThreadingHTTPServer):
    daemon_threads = True
    def __init__(self, *args, **kwargs):
        self.slots = threading.BoundedSemaphore(8)
        super().__init__(*args, **kwargs)
    def get_request(self):
        request, address = super().get_request()
        request.settimeout(15)  # Bound incomplete headers as well as request bodies.
        return request, address
    def handle_error(self, request, client_address):
        pass  # Never log peer IPs, capabilities or malformed request contents.
    def process_request(self, request, client_address):
        if not self.slots.acquire(blocking=False):
            self.shutdown_request(request)
            return
        try:
            super().process_request(request, client_address)
        except Exception:
            self.slots.release()
            raise
    def process_request_thread(self, request, client_address):
        try:
            super().process_request_thread(request, client_address)
        finally:
            self.slots.release()

if __name__ == '__main__':
    os.umask(0o077)
    database_url = os.environ.get('DATABASE_URL')
    if os.environ.get('RENDER') and not database_url:
        raise SystemExit('DATABASE_URL is required on Render; refusing ephemeral inbox storage')
    try:
        relay = Relay(os.environ.get('VEIL_DB', 'veil.sqlite3'), database_url=database_url)
    except Exception:
        raise SystemExit('Database unavailable; check DATABASE_URL and database status') from None
    server = BoundedHTTPServer((os.environ.get('VEIL_BIND', '127.0.0.1'), int(os.environ.get('PORT', '8080'))), handler(relay))
    def sweep():
        while True:
            time.sleep(30)
            try:
                with relay.lock, relay.db: relay.clean()
            except Exception:
                # Keep the sweeper alive through transient DB outages; no credentials in logs.
                print('Relay maintenance unavailable; retrying', flush=True)
    threading.Thread(target=sweep, daemon=True).start()
    server.serve_forever()
