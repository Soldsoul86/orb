#!/usr/bin/env python3
"""Inspect queued test envelopes without reading/logging credentials or plaintext."""
import argparse
import base64
import pathlib
import sqlite3

def inspect(path, canary):
    path = pathlib.Path(path).resolve()
    if not path.is_file(): raise RuntimeError('Relay database does not exist')
    # Read-only open; works with a live WAL database on the relay host.
    with sqlite3.connect(path.as_uri() + '?mode=ro', uri=True) as db:
        rows = db.execute('SELECT body FROM messages').fetchall()
        if not rows: raise RuntimeError('NOT TESTED: no queued envelopes; pause the recipient before fetching')
        needle = canary.encode()
        encoded = base64.b64encode(needle)
        for (body,) in rows:
            raw = base64.b64decode(body, validate=True)
            if needle in body.encode() or needle in raw or encoded in raw:
                raise AssertionError('FAIL: test plaintext marker appears in relay payload')
            if len(raw) < 32 or raw[0] not in (2, 3):
                raise AssertionError('FAIL: unexpected Signal envelope type')
    print(f'PASS: sampled {len(rows)} queued envelopes have expected type bytes and no known test plaintext marker.')
    print('This does not prove encryption correctness; run native decryption/tamper tests and inspect logs separately.')

if __name__ == '__main__':
    p = argparse.ArgumentParser()
    p.add_argument('database', type=pathlib.Path)
    p.add_argument('--canary', required=True, help='Unique synthetic text sent for this test')
    a = p.parse_args()
    inspect(a.database, a.canary)
