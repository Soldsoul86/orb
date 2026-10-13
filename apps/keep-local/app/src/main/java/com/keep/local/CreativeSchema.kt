package com.keep.local.next

import android.database.sqlite.SQLiteDatabase

/** Additive v1 -> v2: original rows, IDs, paths and FTS triggers remain untouched. */
object CreativeSchema {
    fun create(db: SQLiteDatabase) {
        db.execSQL("""CREATE TABLE IF NOT EXISTS assets (
            memory_id INTEGER PRIMARY KEY REFERENCES memories(id) ON DELETE CASCADE,
            asset_uuid TEXT NOT NULL UNIQUE, origin_ref TEXT, sha256 TEXT,
            state TEXT NOT NULL DEFAULT 'not_indexed', next_ms INTEGER NOT NULL DEFAULT 0,
            total_ms INTEGER NOT NULL DEFAULT 0, model_id TEXT, error TEXT,
            updated_at INTEGER NOT NULL DEFAULT 0)""")
        db.execSQL("CREATE INDEX IF NOT EXISTS asset_hash ON assets(sha256)")
        db.execSQL("INSERT OR IGNORE INTO assets(memory_id,asset_uuid,origin_ref) SELECT id,lower(hex(randomblob(16))),path FROM memories")
        db.execSQL("""CREATE TRIGGER IF NOT EXISTS asset_insert AFTER INSERT ON memories BEGIN
            INSERT INTO assets(memory_id,asset_uuid,origin_ref) VALUES(new.id,lower(hex(randomblob(16))),new.path);
            END""")
        db.execSQL("""CREATE TABLE IF NOT EXISTS representations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            memory_id INTEGER NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
            modality TEXT NOT NULL, model_id TEXT NOT NULL, start_ms INTEGER NOT NULL,
            end_ms INTEGER NOT NULL, vector BLOB, text_value TEXT, created_at INTEGER NOT NULL,
            UNIQUE(memory_id,modality,model_id,start_ms))""")
        db.execSQL("CREATE INDEX IF NOT EXISTS representation_model ON representations(model_id,memory_id)")
        db.execSQL("""CREATE TABLE IF NOT EXISTS asset_relationships (
            source_uuid TEXT NOT NULL REFERENCES assets(asset_uuid) ON DELETE CASCADE,
            target_uuid TEXT NOT NULL REFERENCES assets(asset_uuid) ON DELETE CASCADE,
            relation TEXT NOT NULL, created_at INTEGER NOT NULL,
            PRIMARY KEY(source_uuid,target_uuid,relation))""")
    }
}
