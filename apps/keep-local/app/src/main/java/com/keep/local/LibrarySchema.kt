package com.keep.local.next

import android.database.sqlite.SQLiteDatabase

/** v3 is additive. Existing private media, UUIDs, vectors and models are untouched. */
object LibrarySchema {
    fun create(db: SQLiteDatabase) {
        db.execSQL("""CREATE TABLE IF NOT EXISTS library_sources (
            id INTEGER PRIMARY KEY, source_key TEXT UNIQUE NOT NULL, kind TEXT NOT NULL,
            label TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1,
            status TEXT NOT NULL DEFAULT 'queued', scan_epoch INTEGER NOT NULL DEFAULT 0,
            cursor INTEGER NOT NULL DEFAULT 0, error TEXT)""")
        db.execSQL("""CREATE TABLE IF NOT EXISTS source_items (
            memory_id INTEGER PRIMARY KEY REFERENCES memories(id) ON DELETE CASCADE,
            source_id INTEGER NOT NULL REFERENCES library_sources(id) ON DELETE CASCADE,
            uri TEXT NOT NULL UNIQUE, fingerprint TEXT NOT NULL, group_path TEXT NOT NULL DEFAULT '',
            content_time INTEGER NOT NULL DEFAULT 0, time_basis TEXT NOT NULL DEFAULT 'unknown',
            state TEXT NOT NULL DEFAULT 'queued', excluded INTEGER NOT NULL DEFAULT 0,
            seen INTEGER NOT NULL DEFAULT 0, error TEXT)""")
        db.execSQL("CREATE INDEX IF NOT EXISTS source_state ON source_items(source_id,state,excluded)")
        db.execSQL("""CREATE TABLE IF NOT EXISTS scan_folders (
            source_id INTEGER NOT NULL REFERENCES library_sources(id) ON DELETE CASCADE,
            document_id TEXT NOT NULL, offset INTEGER NOT NULL DEFAULT 0, done INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY(source_id,document_id))""")
        db.execSQL("""CREATE TABLE IF NOT EXISTS source_exclusions (
            source_id INTEGER NOT NULL REFERENCES library_sources(id) ON DELETE CASCADE,
            prefix TEXT NOT NULL, PRIMARY KEY(source_id,prefix))""")
    }
    const val VISIBLE = "NOT EXISTS (SELECT 1 FROM source_items si JOIN library_sources ls ON ls.id=si.source_id WHERE si.memory_id=memories.id AND (si.excluded=1 OR si.state='access_revoked' OR ls.enabled=0))"
}
