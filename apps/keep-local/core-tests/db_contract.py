#!/usr/bin/env python3
"""Exercise actual SQL strings extracted from MemoryDb.kt with desktop SQLite/FTS4."""
from pathlib import Path
import re
import sqlite3
import xml.etree.ElementTree as ET

root = Path(__file__).resolve().parents[1]
src = (root / 'app/src/main/java/com/keep/local/MemoryDb.kt').read_text()
pattern = re.compile(r'db\.execSQL\((?:"""(?P<triple>.*?)"""\.trimIndent\(\)|"(?P<single>[^"]*)")\)', re.S)
statements = [(m.start(), (m.group('triple') or m.group('single')).strip()) for m in pattern.finditer(src)]
assert len(statements) == 6, f"Expected 6 real schema statements, got {len(statements)}"
con = sqlite3.connect(':memory:')
for _, statement in sorted(statements):
    con.executescript(statement)

con.execute("INSERT INTO memories(kind,title,body,source,created_at) VALUES(?,?,?,?,?)",
            ('note', 'Client meeting', 'Remember budget deadline tomorrow', 'User note', 1))
assert con.execute('SELECT docid FROM memory_fts WHERE memory_fts MATCH ?', ('"deadline*"',)).fetchall() == [(1,)]
assert con.execute('SELECT docid FROM memory_fts WHERE memory_fts MATCH ?', ('\"dead*\"',)).fetchall() == [(1,)]
con.execute("UPDATE memories SET extracted=? WHERE id=?", ('@15s — steel bracket hole moved', 1))
assert con.execute('SELECT docid FROM memory_fts WHERE memory_fts MATCH ?', ('"bracket*"',)).fetchall() == [(1,)]
con.execute("UPDATE memories SET body=? WHERE id=?", ('only revised drawing', 1))
assert con.execute('SELECT docid FROM memory_fts WHERE memory_fts MATCH ?', ('"deadline*"',)).fetchall() == []
assert con.execute('SELECT docid FROM memory_fts WHERE memory_fts MATCH ?', ('"drawing*"',)).fetchall() == [(1,)]
con.execute("DELETE FROM memories WHERE id=1")
assert con.execute('SELECT COUNT(*) FROM memory_fts').fetchone()[0] == 0
print('PASS: FTS4 schema, index insert/update/extraction/delete')

manifest = ET.parse(root / 'app/src/main/AndroidManifest.xml').getroot()
ns = '{http://schemas.android.com/apk/res/android}'
perms = {n.attrib[ns+'name'] for n in manifest.findall('uses-permission')
         if n.attrib.get('{http://schemas.android.com/tools}node') != 'remove'}
for disallowed in ('android.permission.INTERNET','android.permission.READ_SMS', 'android.permission.QUERY_ALL_PACKAGES',
                   'android.permission.MANAGE_EXTERNAL_STORAGE','android.permission.SYSTEM_ALERT_WINDOW'):
    assert disallowed not in perms, f"Unexpected privileged permission: {disallowed}"
app = manifest.find('application')
assert app.attrib.get(ns+'allowBackup') == 'false'
assert not (root / 'app/src/main/res/xml/network_security_config.xml').exists()
print('PASS: local-only manifest, no network/broad storage permission, no backup')

required = ['MainActivity.kt', 'EditorActivity.kt','PlaybackActivity.kt','AppFiles.kt','ScreenService.kt',
            'VoiceService.kt','OcrJob.kt','MediaProvider.kt','ScreenTile.kt','MemoryDb.kt','CoreLogic.kt']
folder = root / 'app/src/main/java/com/keep/local'
for filename in required:
    assert (folder / filename).exists(), filename
assert 'compileSdk = 36' in (root / 'app/build.gradle.kts').read_text()
assert 'targetSdk = 36' in (root / 'app/build.gradle.kts').read_text()
print('PASS: source components present, current Android target defined')
