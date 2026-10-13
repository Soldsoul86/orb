#!/usr/bin/env python3
"""Create v1 fixture DB from unchanged schema; no production database is touched."""
from pathlib import Path
import sqlite3
import re
root = Path(__file__).resolve().parents[1]
src = (root / 'app/src/main/java/com/keep/local/MemoryDb.kt').read_text()
fixture = root / 'evidence/fixture-memories.db'
fixture.unlink(missing_ok=True)
con = sqlite3.connect(fixture)
for m in re.finditer(r'db\.execSQL\((?:"""(?P<triple>.*?)"""\.trimIndent\(\)|"(?P<single>[^"]*)")\)', src, re.S):
    con.executescript((m.group('triple') or m.group('single')).strip())
schema=(root/'app/src/main/java/com/keep/local/CreativeSchema.kt').read_text()
for m in re.finditer(r'db\.execSQL\((?:"""(?P<triple>.*?)"""|"(?P<single>[^"]*)")\)',schema,re.S):
    con.executescript((m.group('triple') or m.group('single')).strip())
con.execute('PRAGMA user_version=2')
con.execute("INSERT INTO memories(id,kind,title,body,source,path,mime,created_at,bytes,duration_ms) VALUES(987654,'video','CAD Test','Existing recording retained across update','Emulator fixture','media/cad-test.mp4','video/mp4',1700000000000,?,2000)", ((root/'evidence/cad-test.mp4').stat().st_size,))
con.commit()
con.close()
