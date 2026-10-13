package com.keep.local.next

import android.database.sqlite.SQLiteDatabase

object DiscoverySchema {
    fun create(db:SQLiteDatabase) {
        db.execSQL("""CREATE TABLE IF NOT EXISTS discoveries (
            id TEXT PRIMARY KEY, type TEXT NOT NULL, suggestion TEXT NOT NULL, reason TEXT NOT NULL,
            uncertainty TEXT NOT NULL, score REAL, created_at INTEGER NOT NULL, version TEXT NOT NULL)""")
        db.execSQL("""CREATE TABLE IF NOT EXISTS discovery_evidence (
            discovery_id TEXT NOT NULL REFERENCES discoveries(id) ON DELETE CASCADE,
            memory_id INTEGER NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
            asset_uuid TEXT NOT NULL, source_ref TEXT NOT NULL, revision TEXT NOT NULL,
            start_ms INTEGER NOT NULL, end_ms INTEGER NOT NULL, excerpt TEXT NOT NULL,
            PRIMARY KEY(discovery_id,memory_id,start_ms))""")
        db.execSQL("CREATE INDEX IF NOT EXISTS discovery_source ON discovery_evidence(memory_id)")
        // Human decisions survive removal/rebuilding of machine-derived records.
        db.execSQL("""CREATE TABLE IF NOT EXISTS review_state (
            discovery_id TEXT PRIMARY KEY, status TEXT NOT NULL, feedback TEXT NOT NULL,
            correction TEXT NOT NULL DEFAULT '', reviewed_at INTEGER NOT NULL)""")
        db.execSQL("""CREATE TABLE IF NOT EXISTS review_events (
            id INTEGER PRIMARY KEY, discovery_id TEXT NOT NULL, action TEXT NOT NULL,
            feedback TEXT NOT NULL, correction TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL)""")
        db.execSQL("""CREATE TABLE IF NOT EXISTS dismissed_evidence (
            type TEXT NOT NULL, asset_uuid TEXT NOT NULL, revision TEXT NOT NULL,
            PRIMARY KEY(type,asset_uuid,revision))""")
    }
}
