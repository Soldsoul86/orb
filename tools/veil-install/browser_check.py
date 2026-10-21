"""Browser handoff evidence, not Android installation or deferred-link verification."""
import argparse
import hashlib
from pathlib import Path
import sys
import tempfile
import threading
from urllib.parse import parse_qs, urlsplit
from http.server import ThreadingHTTPServer
from playwright.sync_api import sync_playwright

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'apps/veil/relay'))
from contact_landing import APK_URL, HTML
from server import Relay, handler


def check(origin, live=False):
    token = 'a' * 43  # Synthetic only: never resolves a contact or makes a request.
    destination = origin + '/i#' + token
    with sync_playwright() as p:
        browser = p.chromium.launch()
        context = browser.new_context(viewport={'width': 393, 'height': 852}, is_mobile=True, has_touch=True)
        page = context.new_page()
        requests = []
        context.on('request', lambda r: requests.append(r))
        response = page.goto(destination, wait_until='networkidle', timeout=120000)
        assert response.status == 200
        assert response.headers['referrer-policy'] == 'no-referrer'
        assert "default-src 'none'" in response.headers['content-security-policy']
        assert page.locator('#open').is_visible()
        href = page.locator('#open').get_attribute('href')
        assert parse_qs(urlsplit(href).query)['link'] == [destination]
        assert page.locator('#download').get_attribute('href') == APK_URL
        assert not page.locator('#install-help').is_visible()
        # Controlled download response exercises a real browser download without Android installation.
        context.route(APK_URL, lambda route: route.fulfill(status=200, headers={
            'Content-Type': 'application/vnd.android.package-archive',
            'Content-Disposition': 'attachment; filename=veil-qr-preview.apk'}, body=b'browser-download-test-only'))
        with page.expect_download() as download:
            page.locator('#download').click()
        assert download.value.suggested_filename == 'veil-qr-preview.apk'
        assert page.url == destination
        assert page.locator('#install-help').is_visible()
        assert page.locator('#open').get_attribute('href') == href
        assert all(token not in r.url for r in requests)
        assert all(token not in r.headers.get('referer', '') for r in requests)
        assert all(r.url in [origin + '/i', APK_URL] for r in requests), [urlsplit(r.url).path for r in requests]
        page.screenshot(path='invitation-install.png', full_page=True)
        page.reload(wait_until='networkidle')
        assert page.locator('#open').get_attribute('href') == href
        page.evaluate("location.hash = 'invalid'")
        page.wait_for_function("document.getElementById('open').hidden")
        assert page.locator('#open').get_attribute('href') is None
        assert 'incomplete' in page.locator('#status').inner_text()
        page.evaluate("location.hash = ''")
        assert not page.locator('#open').is_visible()
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
        browser.close()
    if live:
        # No GitHub token: prove the public release downloads without signing in.
        import urllib.request
        with urllib.request.urlopen(APK_URL, timeout=120) as response:
            digest = hashlib.sha256(response.read()).hexdigest()
        assert digest == 'cd8da545bf8ab8bcb461a6aecd79ff23a49d0982b15a4774a5b6520c0db8b56e'
        print('PASS public APK download without authentication; SHA256 matches signed v9')
    print('PASS browser: QR destination, download, retained invitation, reload, invalid link, no token/referrer leakage')
    print('NOT TESTED: physical camera scan, Android installer and browser-to-app resolution; automatic post-install continuation is not implemented')


if __name__ == '__main__':
    args = argparse.ArgumentParser()
    args.add_argument('--origin')
    origin = args.parse_args().origin
    if origin:
        check(origin, live=True)
    else:
        with tempfile.TemporaryDirectory() as directory:
            relay = Relay(directory + '/relay.db')
            server = ThreadingHTTPServer(('127.0.0.1', 0), handler(relay))
            threading.Thread(target=server.serve_forever, daemon=True).start()
            try:
                check('http://127.0.0.1:' + str(server.server_port))
            finally:
                server.shutdown()
                server.server_close()
                relay.db.close()
