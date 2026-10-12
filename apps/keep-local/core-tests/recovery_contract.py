#!/usr/bin/env python3
"""Exercise recovery against simulated adb; never contacts a phone."""
import contextlib
import io
from pathlib import Path
import runpy
import sqlite3
import subprocess
import sys
import tempfile
from unittest.mock import patch

script = Path(__file__).resolve().parents[1] / 'scripts/recover-existing-media.py'
with tempfile.TemporaryDirectory() as tmp:
    root = Path(tmp)
    path = root / 'fixture.db'
    db = sqlite3.connect(path)
    db.execute('CREATE TABLE memories(id INTEGER, title TEXT, path TEXT, bytes INTEGER)')
    payload = b'original video bytes' * 10000
    db.execute('INSERT INTO memories VALUES(1,?,?,?)', ('CAD Test', 'media/cad-test.mp4', len(payload)))
    db.commit(); db.close()
    database = path.read_bytes()
    commands = []
    def fake_run(args, check=False, stdout=None, **kwargs):
        commands.append(args)
        if args[-1] == 'databases/memories.db': stdout.write(database)
        elif args[-1] == 'databases/memories.db-wal': return subprocess.CompletedProcess(args, 1)
        elif args[-1] == 'files/media/cad-test.mp4': stdout.write(payload)
        return subprocess.CompletedProcess(args, 0)
    output = root / 'CAD Test.mp4'
    argv = [str(script), '--serial', 'SIMULATED', '--output', str(output), '--recordings-stopped']
    with patch.object(sys, 'argv', argv), patch('subprocess.run', fake_run), contextlib.redirect_stdout(io.StringIO()):
        runpy.run_path(str(script), run_name='__main__')
    assert output.read_bytes() == payload
    assert not any(any(part in ('uninstall', 'clear', 'install', 'rm') for part in cmd) for cmd in commands)
    try:
        with patch.object(sys, 'argv', argv), patch('subprocess.run', fake_run), contextlib.redirect_stdout(io.StringIO()):
            runpy.run_path(str(script), run_name='__main__')
    except FileExistsError: pass
    else: raise AssertionError('Existing local output must not be overwritten')
    assert output.read_bytes() == payload
print('PASS: recovery streams exact bytes; no destructive adb operations; local overwrite refused (simulated adb only)')
