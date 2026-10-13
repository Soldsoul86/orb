package com.keep.local.next

import android.content.ContentValues
import android.content.Context
import android.database.Cursor
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper

data class MemoryItem(
    val id: Long,
    val kind: String,
    val title: String,
    val body: String,
    val extracted: String,
    val source: String,
    val path: String?,
    val mime: String?,
    val createdAt: Long,
    val bytes: Long,
    val durationMs: Long,
    val pinned: Boolean,
    val suggestion: String?
)

/** App-private SQLite + local FTS4. Sources stay separate from AI/OCR extractions. */
class MemoryDb private constructor(context: Context) : SQLiteOpenHelper(context.applicationContext, "memories.db", null, 4) {
    private val appContext=context.applicationContext
    companion object {
        @Volatile private var instance: MemoryDb? = null
        fun get(context: Context): MemoryDb = instance ?: synchronized(this) {
            instance ?: MemoryDb(context.applicationContext).also { instance = it }
        }
    }
    init { setWriteAheadLoggingEnabled(true) }

    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL("""
            CREATE TABLE memories (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                kind TEXT NOT NULL,
                title TEXT NOT NULL DEFAULT '',
                body TEXT NOT NULL DEFAULT '',
                extracted TEXT NOT NULL DEFAULT '',
                source TEXT NOT NULL DEFAULT '',
                path TEXT,
                mime TEXT,
                created_at INTEGER NOT NULL,
                bytes INTEGER NOT NULL DEFAULT 0,
                duration_ms INTEGER NOT NULL DEFAULT 0,
                pinned INTEGER NOT NULL DEFAULT 0,
                suggestion TEXT
            )
        """.trimIndent())
        db.execSQL("CREATE INDEX memories_sort ON memories(pinned DESC, created_at DESC)")
        db.execSQL("CREATE VIRTUAL TABLE memory_fts USING fts4(title, body, extracted, source, tokenize=unicode61)")
        db.execSQL("""
            CREATE TRIGGER mem_insert AFTER INSERT ON memories BEGIN
                INSERT INTO memory_fts(docid, title, body, extracted, source)
                VALUES(new.id, new.title, new.body, new.extracted, new.source);
            END
        """.trimIndent())
        db.execSQL("""
            CREATE TRIGGER mem_update AFTER UPDATE ON memories BEGIN
                UPDATE memory_fts SET title=new.title, body=new.body,
                    extracted=new.extracted, source=new.source WHERE docid=old.id;
            END
        """.trimIndent())
        db.execSQL("""
            CREATE TRIGGER mem_delete AFTER DELETE ON memories BEGIN
                DELETE FROM memory_fts WHERE docid=old.id;
            END
        """.trimIndent())
        CreativeSchema.create(db)
        LibrarySchema.create(db)
        IndexSchema.create(db)
    }

    override fun onConfigure(db: SQLiteDatabase) { db.setForeignKeyConstraintsEnabled(true) }

    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
        if (oldVersion < 2) CreativeSchema.create(db)
        if (oldVersion < 3) LibrarySchema.create(db)
        if (oldVersion < 4) IndexSchema.create(db)
    }

    fun add(
        kind: String, title: String, body: String = "", source: String = "Saved by me",
        path: String? = null, mime: String? = null, bytes: Long = 0, durationMs: Long = 0
    ): Long {
        val v = ContentValues().apply {
            put("kind", kind); put("title", title.take(500)); put("body", body.take(250_000))
            put("source", source.take(500)); put("path", path); put("mime", mime)
            put("bytes", bytes); put("duration_ms", durationMs)
            put("created_at", System.currentTimeMillis())
            put("suggestion", CoreLogic.suggestedFlag(title, body))
        }
        return writableDatabase.insertOrThrow("memories", null, v)
    }

    fun update(id: Long, title: String, body: String, pinned: Boolean) {
        val v = ContentValues().apply {
            put("title", title.take(500)); put("body", body.take(250_000)); put("pinned", if (pinned) 1 else 0)
            put("suggestion", CoreLogic.suggestedFlag(title, body))
        }
        writableDatabase.update("memories", v, "id=?", arrayOf(id.toString()))
    }

    fun setExtracted(id: Long, extracted: String) {
        // Crucial: don't silently rewrite original user text or source.
        val prior = get(id) ?: return
        val suggestion = CoreLogic.suggestedFlag(prior.title, prior.body + " " + extracted)
        writableDatabase.update("memories", ContentValues().apply {
            put("extracted", extracted.take(250_000))
            put("suggestion", suggestion)
        }, "id=?", arrayOf(id.toString()))
    }

    fun get(id: Long): MemoryItem? = readableDatabase.query(
        "memories", null, "id=?", arrayOf(id.toString()), null, null, null, "1"
    ).use { if (it.moveToFirst()) it.asMemory() else null }

    fun search(query: String, kind: String?, max: Int = 150): List<MemoryItem> {
        val match = CoreLogic.ftsQuery(query)
        val date=runCatching{java.time.LocalDate.parse(query.trim())}.getOrNull()
        val args = arrayListOf<String>()
        val where = arrayListOf(LibrarySchema.VISIBLE)
        if(date!=null){
            val start=date.atStartOfDay(java.time.ZoneOffset.UTC).toInstant().toEpochMilli()
            where.add("(memories.id IN (SELECT docid FROM memory_fts WHERE memory_fts MATCH ?) OR coalesce((SELECT nullif(content_time,0) FROM source_items WHERE memory_id=memories.id),memories.created_at) >= CAST(? AS INTEGER) AND coalesce((SELECT nullif(content_time,0) FROM source_items WHERE memory_id=memories.id),memories.created_at) < CAST(? AS INTEGER))")
            args.add(match);args.add(start.toString());args.add((start+86_400_000).toString())
        } else if (match.isNotEmpty()) { where.add("memory_fts MATCH ?"); args.add(match) }
        else if (query.isNotBlank()) { return emptyList() }
        if (kind != null) { where.add("memories.kind=?"); args.add(kind) }
        val sql = buildString {
            // List rows only need a preview. Loading 150 complete OCR documents can
            // otherwise retain tens of MB; get(id) loads the complete detail on demand.
            append("SELECT memories.id, memories.kind, memories.title, " +
                "substr(memories.body,1,240) AS body, substr(memories.extracted,1,240) AS extracted, " +
                "memories.source, memories.path, memories.mime, memories.created_at, " +
                "memories.bytes, memories.duration_ms, memories.pinned, memories.suggestion FROM memories ")
            if (match.isNotEmpty() && date==null) append("JOIN memory_fts ON memory_fts.docid=memories.id ")
            if (where.isNotEmpty()) append("WHERE ${where.joinToString(" AND ")} ")
            append("ORDER BY memories.pinned DESC, memories.created_at DESC LIMIT ${max.coerceIn(1, 250)}")
        }
        return readableDatabase.rawQuery(sql, args.toTypedArray()).use { c ->
            buildList { while (c.moveToNext()) add(c.asMemory()) }
        }
    }

    fun remove(id: Long) {
        writableDatabase.delete("memories", "id=?", arrayOf(id.toString()))
        java.io.File(appContext.cacheDir,"visual").listFiles()?.filter { it.name.startsWith("${id}_") }?.forEach { it.delete() }
    }

    fun stats(): Pair<Int, Long> = readableDatabase.rawQuery(
        "SELECT COUNT(*), COALESCE(SUM(bytes),0) FROM memories", null
    ).use { c -> c.moveToFirst(); c.getInt(0) to c.getLong(1) }

    private fun Cursor.asMemory() = MemoryItem(
        id = getLong(getColumnIndexOrThrow("id")),
        kind = getString(getColumnIndexOrThrow("kind")),
        title = getString(getColumnIndexOrThrow("title")),
        body = getString(getColumnIndexOrThrow("body")),
        extracted = getString(getColumnIndexOrThrow("extracted")),
        source = getString(getColumnIndexOrThrow("source")),
        path = getString(getColumnIndexOrThrow("path")),
        mime = getString(getColumnIndexOrThrow("mime")),
        createdAt = getLong(getColumnIndexOrThrow("created_at")),
        bytes = getLong(getColumnIndexOrThrow("bytes")),
        durationMs = getLong(getColumnIndexOrThrow("duration_ms")),
        pinned = getInt(getColumnIndexOrThrow("pinned")) != 0,
        suggestion = getString(getColumnIndexOrThrow("suggestion"))
    )
}
