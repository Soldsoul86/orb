package com.keep.local.next

import android.database.sqlite.SQLiteDatabase

/** v4 only adds indexes, retry checkpoints and a bounded processing journal. */
object IndexSchema {
    fun create(db:SQLiteDatabase) {
        db.execSQL("CREATE INDEX IF NOT EXISTS asset_queue ON assets(state,updated_at,memory_id)")
        db.execSQL("CREATE INDEX IF NOT EXISTS memory_kind ON memories(kind,id)")
        db.execSQL("CREATE INDEX IF NOT EXISTS source_scan ON library_sources(enabled,status,id)")
        db.execSQL("CREATE INDEX IF NOT EXISTS source_seen ON source_items(source_id,seen)")
        db.execSQL("""CREATE TABLE IF NOT EXISTS index_retry (
            memory_id INTEGER PRIMARY KEY REFERENCES memories(id) ON DELETE CASCADE,
            attempts INTEGER NOT NULL DEFAULT 0, retry_at INTEGER NOT NULL DEFAULT 0,
            error TEXT)""")
        db.execSQL("""CREATE TABLE IF NOT EXISTS index_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT, committed_at INTEGER NOT NULL,
            stage TEXT NOT NULL, kind TEXT NOT NULL, elapsed_ms INTEGER NOT NULL,
            completed INTEGER NOT NULL DEFAULT 0)""")
    }
}
