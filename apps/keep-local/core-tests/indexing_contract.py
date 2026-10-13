"""Production SQLite schema exercised at scale; no user files or database touched."""
import sqlite3,re,time,json
from pathlib import Path
root=Path(__file__).resolve().parents[1]/'app/src/main/java/com/keep/local'
db=sqlite3.connect(':memory:');db.execute('PRAGMA foreign_keys=ON')
for name in ['MemoryDb.kt','CreativeSchema.kt','DiscoverySchema.kt','LibrarySchema.kt']:
    src=(root/name).read_text()
    for m in re.finditer(r'db\.execSQL\((?:"""(?P<triple>.*?)"""(?:\.trimIndent\(\))?|"(?P<single>[^"]*)")\)',src,re.S):
        db.executescript((m.group('triple') or m.group('single')).strip())
db.execute("INSERT INTO memories(id,kind,title,path,created_at) VALUES(1,'video','CAD Test','media/cad.mp4',1)")
uuid=db.execute('SELECT asset_uuid FROM assets WHERE memory_id=1').fetchone()[0]
db.execute("INSERT INTO review_state VALUES('d','dismissed','uninteresting','',1)")
for repeat in range(2):
    for m in re.finditer(r'db\.execSQL\((?:"""(?P<triple>.*?)"""|"(?P<single>[^"]*)")\)',(root/'IndexSchema.kt').read_text(),re.S):
        db.executescript((m.group('triple') or m.group('single')).strip())
assert db.execute('SELECT asset_uuid,origin_ref FROM assets WHERE memory_id=1').fetchone()==(uuid,'media/cad.mp4')
assert db.execute('SELECT status FROM review_state').fetchone()[0]=='dismissed'
start=time.perf_counter()
with db:
    db.executemany("INSERT INTO memories(kind,title,path,created_at) VALUES('image',?,'media/shared-fixture.jpg',1)",[(f'scale-{i}',) for i in range(10000)])
assert db.execute("SELECT count(*) FROM memory_fts WHERE memory_fts MATCH 'scale'").fetchone()[0]==10000
assert db.execute("SELECT count(*) FROM assets WHERE state='ready'").fetchone()[0]==0
assert db.execute('SELECT count(distinct asset_uuid) FROM assets').fetchone()[0]==10001
# A failed transaction must not expose a ready asset without its evidence/checkpoint.
try:
    with db:
        db.execute("UPDATE assets SET state='ready' WHERE memory_id=1")
        db.execute("INSERT INTO index_events(committed_at,stage,kind,elapsed_ms,completed) VALUES(1,'visual','video',100,1)")
        raise RuntimeError('simulated interruption before commit')
except RuntimeError:pass
assert db.execute('SELECT state FROM assets WHERE memory_id=1').fetchone()[0]=='not_indexed'
assert db.execute('SELECT count(*) FROM index_events').fetchone()[0]==0
print(json.dumps({'test':'v3-v4 additive migration + 10000 basic searchable assets + rollback invariant','elapsed_ms':round((time.perf_counter()-start)*1000),'passed':True}))
