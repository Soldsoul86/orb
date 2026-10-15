"""Check a deployed relay with disposable opaque bytes, never real conversations."""
import argparse
import base64
import hashlib
import json
import secrets
import time
import urllib.error
import urllib.parse
import urllib.request


def run(origin):
    parsed = urllib.parse.urlsplit(origin)
    if parsed.scheme != 'https' or not parsed.netloc or parsed.path not in ('', '/') or parsed.query or parsed.fragment or parsed.username:
        raise ValueError('Supply an HTTPS origin only')
    origin = origin.rstrip('/')
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, *args, **kwargs):
            return None
    client = urllib.request.build_opener(NoRedirect())
    def request(method, path, token='', data=None, expected=200):
        raw = json.dumps(data).encode() if data is not None else None
        headers = {'Content-Type': 'application/json'}
        if token:
            headers['Authorization'] = 'Bearer ' + token
        req = urllib.request.Request(origin + path, raw, headers, method=method)
        try:
            with client.open(req, timeout=90) as response:
                status, body = response.status, response.read(12*1024*1024+1)
        except urllib.error.HTTPError as error:
            status, body = error.code, error.read(4096)
        if status != expected:
            raise RuntimeError('Unexpected HTTP status: ' + str(status))
        if len(body) > 12*1024*1024:
            raise RuntimeError('Oversized relay response')
        return json.loads(body)

    assert request('GET', '/healthz')['status'] == 'ok'
    boxes = []
    try:
        for _ in range(2):
            reader, writer = secrets.token_urlsafe(32), secrets.token_urlsafe(32)
            box = request('POST', '/v1/boxes', data={'reader': reader, 'writer': writer}, expected=201)['id']
            boxes.append(('/v1/boxes/' + box, reader, writer))
        for index, size in enumerate((128, 5*1024*1024)):
            path, reader, writer = boxes[index]
            raw = secrets.token_bytes(size)
            mid = secrets.token_hex(16)
            envelope = {'body': base64.b64encode(raw).decode(), 'expires': int(time.time())+120}
            request('PUT', path+'/messages/'+mid, writer, envelope, 201)
            request('PUT', path+'/messages/'+mid, writer, envelope, 200)
            request('GET', path+'/messages', writer, expected=404)
            request('GET', path+'/messages', boxes[1-index][1], expected=404)
            received = request('GET', path+'/messages', reader)['messages']
            assert len(received) == 1 and received[0]['id'] == mid
            assert hashlib.sha256(base64.b64decode(received[0]['body'])).digest() == hashlib.sha256(raw).digest()
            request('DELETE', path+'/messages/'+mid, reader)
            assert request('GET', path+'/messages', reader)['messages'] == []
        print('PASS: HTTPS health, two disposable inboxes, 128-byte and 5-MiB opaque delivery, retry, authorization separation, acknowledgement')
        print('NOT TESTED: Android two-phone delivery, Signal-to-relay integration, capture restrictions')
    finally:
        for path, reader, _ in boxes:
            request('DELETE', path, reader)
        print('Disposable inbox cleanup complete')

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('origin')
    args = parser.parse_args()
    try:
        run(args.origin)
    except Exception as error:
        # Do not emit tokens, message paths, payloads or connection strings.
        raise SystemExit('FAIL: relay smoke check (' + type(error).__name__ + ')') from None
