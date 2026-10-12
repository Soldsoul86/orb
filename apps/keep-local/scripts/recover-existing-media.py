#!/usr/bin/env python3
"""Read a recording from the original debuggable APK via an authorized USB device.
No root, reinstall, storage clearing, signing-key change or Play Protect bypass.
Stop recordings before using --recordings-stopped; force-stop provides DB consistency.
"""
import argparse
import hashlib
from pathlib import Path, PurePosixPath
import sqlite3
import subprocess
import tempfile

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--serial', required=True, help='Authorized adb device serial')
parser.add_argument('--title', default='CAD Test', help='Exact saved title')
parser.add_argument('--id', type=int, help='Select an ID if duplicate titles exist')
parser.add_argument('--output', type=Path, default=Path('CAD Test.mp4'))
parser.add_argument('--recordings-stopped', action='store_true', required=True,
                    help='Confirm that recordings are stopped before force-stopping the app')
args = parser.parse_args()
base = ['adb', '-s', args.serial]
def adb(*parts, **kwargs):
    return subprocess.run(base + list(parts), check=True, **kwargs)
# Validate debug access before stopping; never fall back to destructive operations.
adb('shell', 'run-as', 'com.keep.local', 'id', stdout=subprocess.DEVNULL)
adb('shell', 'am', 'force-stop', 'com.keep.local')
with tempfile.TemporaryDirectory(prefix='keep-local-readonly-') as tmp:
    database = Path(tmp) / 'memories.db'
    for name in ('memories.db', 'memories.db-wal'):
        with (Path(tmp) / name).open('wb') as out:
            result = subprocess.run(base + ['exec-out', 'run-as', 'com.keep.local', 'cat', 'databases/' + name], stdout=out, stderr=subprocess.PIPE)
        if result.returncode:
            (Path(tmp) / name).unlink()
            if name == 'memories.db':
                raise SystemExit('Cannot read the private database. Nothing was removed; no reinstall is needed.')
    db = sqlite3.connect(database)
    matches = db.execute('SELECT id,title,path,bytes FROM memories WHERE title=?', (args.title,)).fetchall()
    if args.id is not None:
        matches = [row for row in matches if row[0] == args.id]
    if len(matches) != 1:
        for row in matches: print('ID:', row[0], 'Title:', row[1], 'Bytes:', row[3])
        raise SystemExit('Choose one matching ID with --id; no file exported.')
    identifier, title, relative, expected = matches[0]
    parts = PurePosixPath(relative or '').parts
    if len(parts) != 2 or parts[0] != 'media' or any(c not in 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789._-' for c in parts[1]):
        raise SystemExit('Unexpected stored media path; refusing access.')
    # Exclusive creation avoids overwriting any existing user file. Stream to disk.
    with args.output.open('xb') as out:
        result = subprocess.run(base + ['exec-out', 'run-as', 'com.keep.local', 'cat', 'files/' + relative], stdout=out)
    if result.returncode or (expected and args.output.stat().st_size != expected):
        raise SystemExit('Copy could not be verified. Original is untouched; inspect the local copy before use.')
    digest = hashlib.sha256()
    with args.output.open('rb') as saved:
        for chunk in iter(lambda: saved.read(65536), b''): digest.update(chunk)
    print('Saved:', args.output, 'SHA-256:', digest.hexdigest())
    print('Original recording and app installation remain untouched. Reopen Keep Local normally.')
