"""Exercise additive SQL and consent filtering with actual production schema strings."""
import sqlite3,re
from pathlib import Path
root=Path(__file__).resolve().parents[1]
db=sqlite3.connect(':memory:');db.execute('PRAGMA foreign_keys=ON')
src=(root/'app/src/main/java/com/keep/local/MemoryDb.kt').read_text()
for m in re.finditer(r'db\.execSQL\((?:"""(?P<triple>.*?)"""\.trimIndent\(\)|"(?P<single>[^"]*)")\)',src,re.S):
 db.executescript((m.group('triple') or m.group('single')).strip())
db.execute("INSERT INTO memories(id,kind,title,created_at,path) VALUES(1,'video','CAD Test',1700000000000,'media/cad-test.mp4')")
for schema in ['CreativeSchema.kt','LibrarySchema.kt','DiscoverySchema.kt']:
 text=(root/'app/src/main/java/com/keep/local'/schema).read_text()
 for _ in range(2):
  for m in re.finditer(r'db\.execSQL\((?:"""(?P<triple>.*?)"""|"(?P<single>[^"]*)")\)',text,re.S):db.executescript((m.group('triple') or m.group('single')).strip())
assert db.execute('SELECT path FROM memories WHERE id=1').fetchone()[0]=='media/cad-test.mp4'
uuid=db.execute('SELECT asset_uuid FROM assets WHERE memory_id=1').fetchone()[0]
assert len(uuid)==32
db.execute("INSERT INTO library_sources(id,source_key,kind,label) VALUES(1,'media:image','image','Photos')")
db.execute("INSERT INTO memories(id,kind,title,created_at,path) VALUES(2,'image','Authorized',1,'content://media/external/images/media/17')")
db.execute("INSERT INTO source_items(memory_id,source_id,uri,fingerprint) VALUES(2,1,'content://media/external/images/media/17','10:5')")
visible=re.search(r'const val VISIBLE = "(.*)"',(root/'app/src/main/java/com/keep/local/LibrarySchema.kt').read_text()).group(1)
assert db.execute('SELECT count(*) FROM memories WHERE '+visible).fetchone()[0]==2
db.execute("UPDATE source_items SET state='access_revoked'")
assert db.execute('SELECT count(*) FROM memories WHERE '+visible).fetchone()[0]==1
db.execute('DELETE FROM memories WHERE id=2')
assert db.execute('SELECT count(*) FROM source_items').fetchone()[0]==0
assert db.execute('SELECT asset_uuid FROM assets WHERE memory_id=1').fetchone()[0]==uuid
print('PASS: additive v2/v3 schema, stable UUID, revoked-source filtering and FK cascade; original path unchanged')

db.execute("INSERT INTO discoveries VALUES('d','document','Possible','Literal','Uncertain',NULL,1,'rules')")
db.execute("INSERT INTO discovery_evidence VALUES('d',1,?,'content://source','revision',0,0,'exact text')",(uuid,))
db.execute("INSERT INTO review_state VALUES('d','corrected','corrected_information','Human correction',2)")
assert db.execute('SELECT excerpt FROM discovery_evidence').fetchone()[0]=='exact text'
db.execute('DELETE FROM memories WHERE id=1')
assert db.execute('SELECT count(*) FROM discoveries').fetchone()[0]==0
assert db.execute('SELECT count(*) FROM discovery_evidence').fetchone()[0]==0
assert db.execute('SELECT correction FROM review_state').fetchone()[0]=='Human correction'
print('PASS: separate evidence/corrections, source deletion removes derived record, decisions survive')
