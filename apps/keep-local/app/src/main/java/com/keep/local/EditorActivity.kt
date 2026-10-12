package com.keep.local

import android.app.Activity
import android.app.AlertDialog
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.view.Gravity
import android.view.View
import android.widget.Button
import android.widget.CheckBox
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import java.text.DateFormat
import java.util.Date

/** Explicit source/note/extraction separation. Edit metadata without modifying media. */
class EditorActivity : Activity() {
    private var item: MemoryItem? = null
    private lateinit var titleInput: EditText
    private lateinit var note: EditText
    private lateinit var pinned: CheckBox
    private val fg = Color.rgb(235, 239, 247)
    private val secondary = Color.rgb(157, 165, 182)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.statusBarColor = Color.rgb(16, 20, 27)
        window.navigationBarColor = Color.rgb(16, 20, 27)
        item = intent.getLongExtra("id", -1L).takeIf { it > 0 }?.let { MemoryDb.get(this).get(it) }
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(Color.rgb(16, 20, 27))
            setPadding(dp(20), dp(20), dp(20), dp(24))
        }
        val scroll = ScrollView(this)
        scroll.addView(root)
        setContentView(scroll)
        WindowInsetsHelper.applyTo(scroll)

        root.addView(text(if (item == null) "New memory" else "Memory details", 25, fg).apply { setPadding(0,0,0,dp(12)) })
        if (item != null) {
            val i = item!!
            root.addView(text("${i.kind.uppercase()}  ·  ${DateFormat.getDateTimeInstance().format(Date(i.createdAt))}", 13, secondary))
            root.addView(text("Source: ${i.source}", 13, secondary))
            if (i.bytes > 0) root.addView(text("${CoreLogic.prettyBytes(i.bytes)}  ·  ${i.durationMs / 1000}s", 12, secondary))
            if (i.suggestion != null) root.addView(text("Suggestion: ${i.suggestion}", 13, Color.rgb(199, 192, 126)))
        }
        root.addView(text("Title", 15, secondary).apply { setPadding(0, dp(18), 0, 0) })
        titleInput = EditText(this).apply {
            id = R.id.memory_title
            setSingleLine(true)
            setTextColor(fg); setHintTextColor(secondary)
            hint = "What's worth remembering?"
            setText(item?.title ?: "")
        }
        root.addView(titleInput)
        root.addView(text("Your note / context", 15, secondary).apply { setPadding(0, dp(18), 0, 0) })
        note = EditText(this).apply {
            id = R.id.memory_note
            setTextColor(fg); setHintTextColor(secondary)
            minLines = 5; maxLines = 14
            gravity = Gravity.TOP
            hint = "Add searchable details. Why is this important?"
            setText(item?.body ?: "")
        }
        root.addView(note)
        pinned = CheckBox(this).apply {
            id = R.id.memory_pinned
            text = "Pin important memory"
            setTextColor(fg)
            isChecked = item?.pinned == true
        }
        root.addView(pinned)
        root.addView(button("Save", root) { save() })
        val i = item
        if (i != null && i.kind in listOf("video", "audio")) {
            val search = intent.getStringExtra("query")?.trim().orEmpty()
            val matched = i.extracted.lines().firstOrNull { line ->
                search.isNotBlank() && CoreLogic.ftsQuery(search).isNotBlank() &&
                    search.split(' ').any { it.length > 2 && line.contains(it, ignoreCase = true) }
            }
            val seek = Regex("^@(\\d+)s —").find(matched ?: "")?.groupValues?.getOrNull(1)?.toLongOrNull() ?: 0L
            root.addView(button(if (seek > 0) "Play from matching moment (${seek}s)" else "Play recording", root) {
                startActivity(Intent(this, PlaybackActivity::class.java)
                    .putExtra("id", i.id).putExtra("start_ms", seek * 1000))
            })
        }
        if (i != null && ((i.path != null && i.kind !in listOf("audio", "video")) || i.kind == "link")) {
            root.addView(button("Open original", root) { openOriginal() })
        }
        if (i != null && i.extracted.isNotBlank()) {
            root.addView(text("Extracted locally (read-only, may be imperfect)", 14, secondary).apply {
                setPadding(0, dp(20), 0, dp(8))
            })
            root.addView(text(i.extracted.take(50_000), 13, fg))
        } else if (i?.kind in listOf("audio", "video")) {
            root.addView(text("Searchable captions require a note or visible video text. Automatic audio transcription is not included in this build.", 13, secondary))
        }
        if (i != null) root.addView(button("Delete permanently", root) {
            AlertDialog.Builder(this)
                .setTitle("Delete this memory?")
                .setMessage("The original file and its index will be deleted from this phone. This cannot be undone.")
                .setNegativeButton("Cancel", null)
                .setPositiveButton("Delete") { _, _ -> delete() }
                .show()
        })
    }

    private fun button(label: String, root: LinearLayout, action: () -> Unit): Button = Button(this).apply {
        text = label
        isAllCaps = false
        setOnClickListener { action() }
        layoutParams = LinearLayout.LayoutParams(-1, dp(48)).apply { topMargin = dp(10) }
    }

    private fun save() {
        val t = titleInput.text.toString().trim().ifBlank { "Untitled memory" }
        val b = note.text.toString().trim()
        val db = MemoryDb.get(this)
        val i = item
        try { if (i == null) {
            val id = db.add("note", t, b)
            if (pinned.isChecked) db.update(id, t, b, true)
        } else db.update(i.id, t, b, pinned.isChecked)
        finish()
        } catch (e: Exception) {
            Toast.makeText(this, "Could not save: ${e.message}", Toast.LENGTH_LONG).show()
        }
    }

    private fun openOriginal() {
        val i = item ?: return
        try {
            val intent = if (i.path != null) {
                if (AppFiles.safeFile(this, i.path) == null) error("File no longer available")
                Intent(Intent.ACTION_VIEW).apply {
                    setDataAndType(AppFiles.itemUri(i.id), i.mime ?: "application/octet-stream")
                    addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                }
            } else {
                val url = Regex("https?://[^\\s]+", RegexOption.IGNORE_CASE)
                    .find("${i.body} ${i.title}")?.value?.trimEnd('.', ',', ')') ?: error("No link saved")
                Intent(Intent.ACTION_VIEW, Uri.parse(url))
            }
            startActivity(Intent.createChooser(intent, "Open with"))
        } catch (e: Exception) { Toast.makeText(this, e.message ?: "No viewer available", Toast.LENGTH_LONG).show() }
    }

    private fun delete() {
        val i = item ?: return
        val file = AppFiles.safeFile(this, i.path)
        if (file != null && !file.delete()) {
            Toast.makeText(this, "Cannot delete original file", Toast.LENGTH_LONG).show(); return
        }
        MemoryDb.get(this).remove(i.id)
        finish()
    }

    private fun text(value: String, size: Int, color: Int) = TextView(this).apply {
        text = value
        textSize = size.toFloat()
        setTextColor(color)
    }
    private fun dp(n: Int): Int = (resources.displayMetrics.density * n + .5f).toInt()
}
