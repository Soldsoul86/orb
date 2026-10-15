"""Read-only deployed /v2 check. Never creates directory entries or test profiles."""
import argparse
import json
import urllib.parse
import urllib.request


def run(origin):
    parsed = urllib.parse.urlsplit(origin)
    if (parsed.scheme != 'https' or not parsed.netloc or parsed.path not in ('', '/')
            or parsed.query or parsed.fragment or parsed.username):
        raise ValueError('Supply an HTTPS origin only')

    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, *args, **kwargs):
            return None

    client = urllib.request.build_opener(NoRedirect())

    def get(path):
        with client.open(origin.rstrip('/') + path, timeout=90) as response:
            assert response.status == 200
            body = response.read(16385)
            assert len(body) <= 16384
            assert response.headers['Cache-Control'] == 'no-store'
            return response.headers, body

    _, body = get('/v2/capabilities')
    assert json.loads(body) == {
        'version': 1, 'content_types': ['text'], 'recovery': False, 'browser_messaging': False}
    # Generic handoff intentionally reveals no existence or details of a facet.
    headers, body = get('/p/p-' + '0'*32)
    assert headers['Referrer-Policy'] == 'no-referrer'
    assert headers['X-Frame-Options'] == 'DENY'
    assert "default-src 'none'" in headers['Content-Security-Policy']
    assert "form-action 'none'" in headers['Content-Security-Policy']
    assert b'veil-purpose://open?link=' in body and b'<form' not in body
    print('PASS: live HTTPS purpose capabilities, text-only/recovery/browser limitations, safe non-message handoff headers')
    print('NOT TESTED: production purpose accounts, Android deep links, physical two-phone purpose messaging')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('origin')
    args = parser.parse_args()
    try:
        run(args.origin)
    except Exception as error:
        raise SystemExit('FAIL: purpose HTTPS check (' + type(error).__name__ + ')') from None
