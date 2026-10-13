package com.keep.local.next

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.graphics.Typeface
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.text.Editable
import android.text.TextWatcher
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.*
import java.text.DateFormat
import java.util.Date
import java.util.concurrent.Executors

/** A deliberately small native UI: record, share, index, search, view. No WebView. */
class MainActivity : Activity() {
    companion object {
        const val TILE_CAPTURE = "com.keep.local.next.TILE_CAPTURE"
        private const val REQ_PICK = 10
        private const val REQ_PROJECTION = 11
        private const val REQ_MIC = 12
        private const val REQ_DICTATE_MIC = 13
        private const val REQ_MIC_SCREEN = 14
    }
    private val io = Executors.newSingleThreadExecutor()
    private val handler = Handler(Looper.getMainLooper())
    private val bg = Color.rgb(16, 20, 27)
    private val fg = Color.rgb(236, 240, 249)
    private val sub = Color.rgb(150, 163, 179)
    private val accent = Color.rgb(181, 203, 255)
    private lateinit var query: EditText
    private lateinit var filter: Spinner
    private lateinit var status: TextView
    private lateinit var voiceButton: Button
    private lateinit var screenButton: Button
    private lateinit var results: ListView
    private lateinit var listAdapter: MemoryAdapter
    private lateinit var micCheckbox: CheckBox
    private var searchToken = 0
    private var visualHits: Map<Long,VisualHit> = emptyMap()
    private var textMatches: Set<Long> = emptySet()
    private var pendingSearch: Runnable? = null
    private var speech: SpeechRecognizer? = null
    private var pendingScreenMic = false
    private val kinds = listOf("All", "Notes", "Links", "Videos", "Voice", "Images", "Files")
    private val kindValue = listOf<String?>(null, "note", "link", "video", "audio", "image", "file")

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.statusBarColor = bg
        window.navigationBarColor = bg
        window.decorView.systemUiVisibility = 0
        buildUI()
        pendingScreenMic = savedInstanceState?.getBoolean("pending_screen_mic") ?: false
        io.execute { AppFiles.cleanStalePartialFiles(this) }
        if (savedInstanceState == null) {
            if (intent.action == TILE_CAPTURE) handler.post { captureScreen() }
            else consumeShare(intent)
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        if (intent.action == TILE_CAPTURE) captureScreen()
        else consumeShare(intent)
    }

    private fun buildUI() {
        val outer = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setBackgroundColor(bg) }
        val top = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(16), dp(18), dp(16), dp(12))
        }
        top.addView(text("Keep Local", 30, fg).apply { typeface = Typeface.DEFAULT_BOLD })
        top.addView(text("Your creative memory.   ·   Private / offline", 12, accent).apply {
            setPadding(0, dp(3), 0, dp(12))
        })
        status = text("Your memories stay on this device", 12, sub)
        top.addView(status)
        val actions1 = horizontal()
        actions1.addView(actionButton("+ Note", actions1) { startActivity(Intent(this, EditorActivity::class.java)) })
        actions1.addView(actionButton("Import", actions1) { importMedia() })
        actions1.addView(actionButton("Dictate", actions1) { dictateOffline() })
        top.addView(actions1)
        val actions2 = horizontal()
        voiceButton = actionButton("● Voice", actions2) { captureVoice() }
        screenButton = actionButton("▣ Screen", actions2) { captureScreen() }
        actions2.addView(voiceButton)
        actions2.addView(screenButton)
        actions2.addView(actionButton("Visual memory", actions2) { startActivity(Intent(this, ModelsActivity::class.java)) })
        top.addView(actions2)
        micCheckbox = CheckBox(this).apply {
            text = "Include microphone in screen recording (not app audio)"
            textSize = 12f
            setTextColor(sub)
            isChecked = savedPrefs().getBoolean("mic_screen", false)
            setOnCheckedChangeListener { _, yes -> savedPrefs().edit().putBoolean("mic_screen", yes).apply() }
        }
        top.addView(micCheckbox)
        query = EditText(this).apply {
            id = R.id.search_query
            setSingleLine(true)
            textSize = 16f
            setTextColor(fg)
            setHintTextColor(sub)
            hint = "Search what you've saved…"
            compoundDrawablePadding = dp(8)
            setPadding(dp(12), dp(7), dp(12), dp(7))
        }
        top.addView(query, LinearLayout.LayoutParams(-1, dp(49)).apply { topMargin = dp(5) })
        filter = Spinner(this).apply {
            adapter = ArrayAdapter(this@MainActivity, android.R.layout.simple_spinner_dropdown_item, kinds)
            onItemSelectedListener = object : android.widget.AdapterView.OnItemSelectedListener {
                override fun onItemSelected(p: android.widget.AdapterView<*>?, v: View?, i: Int, id: Long) { refresh() }
                override fun onNothingSelected(p: android.widget.AdapterView<*>?) {}
            }
        }
        top.addView(filter)
        outer.addView(top)
        listAdapter = MemoryAdapter()
        results = ListView(this).apply {
            adapter = listAdapter
            divider = null
            setBackgroundColor(bg)
            isFastScrollEnabled = true
            setOnItemClickListener { _, _, pos, _ ->
                startActivity(Intent(this@MainActivity, EditorActivity::class.java)
                    .putExtra("id", listAdapter.items[pos].id).putExtra("query", query.text.toString())
                    .putExtra("visual_start_ms", visualHits[listAdapter.items[pos].id]?.startMs ?: -1L))
            }
            emptyView = text("Nothing saved yet. Share from any app or capture something above.", 15, sub)
        }
        // Empty view must be attached to the same parent as the ListView.
        outer.addView(results.emptyView, LinearLayout.LayoutParams(-1, 0, 1f))
        outer.addView(results, LinearLayout.LayoutParams(-1, 0, 1f))
        setContentView(outer)
        WindowInsetsHelper.applyTo(outer)
        query.addTextChangedListener(object : TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {
                pendingSearch?.let(handler::removeCallbacks)
                pendingSearch = Runnable { refresh() }.also { handler.postDelayed(it, 170) }
            }
            override fun afterTextChanged(s: Editable?) {}
        })
    }

    private fun refresh() {
        if (isDestroyed || isFinishing || io.isShutdown) return
        if (!::query.isInitialized || !::filter.isInitialized || !::listAdapter.isInitialized) return
        val term = query.text.toString()
        val kind = kindValue.getOrNull(filter.selectedItemPosition)
        val ticket = ++searchToken
        io.execute {
            if(ticket!=searchToken) return@execute
            try {
                val db = MemoryDb.get(this)
                val found = CreativeSearch.search(this,term,kind)
                val items = found.items
                val stats = db.stats()
                runOnUiThread {
                    if (ticket != searchToken || isFinishing || isDestroyed) return@runOnUiThread
                    visualHits=found.visual; textMatches=found.textIds
                    listAdapter.items = items
                    listAdapter.notifyDataSetChanged()
                    status.text = "${stats.first} saved  ·  ${CoreLogic.prettyBytes(stats.second)} local\n${found.message}"
                    voiceButton.text = if (VoiceService.active) "■ Stop voice" else "● Voice"
                    screenButton.text = if (ScreenService.active) "■ Stop screen" else "▣ Screen"
                }
            } catch (e: Exception) { runOnUiThread { if (!isDestroyed) status.text = "Search error: ${e.message}" } }
        }
    }

    override fun onResume() { super.onResume(); VisualIndex.schedule(this); if (::status.isInitialized) refresh() }

    private fun captureVoice() {
        if (VoiceService.active) {
            startService(Intent(this, VoiceService::class.java).setAction(VoiceService.STOP)); handler.postDelayed({ refresh() }, 700); return
        }
        if (ScreenService.active) { toast("Stop screen recording first"); return }
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(arrayOf(Manifest.permission.RECORD_AUDIO), REQ_MIC); return
        }
        stopSpeech()
        askRecordingNotifications()
        try { startForegroundService(Intent(this, VoiceService::class.java).setAction(VoiceService.START)) }
        catch (e: Exception) { toast("Recording couldn't start: ${e.message}"); return }
        handler.postDelayed({ refresh() }, 500)
    }

    private fun captureScreen() {
        if (ScreenService.active) {
            startService(Intent(this, ScreenService::class.java).setAction(ScreenService.STOP)); handler.postDelayed({ refresh() }, 700); return
        }
        if (VoiceService.active) { toast("Stop voice recording first"); return }
        pendingScreenMic = micCheckbox.isChecked
        stopSpeech()
        if (pendingScreenMic && checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(arrayOf(Manifest.permission.RECORD_AUDIO), REQ_MIC_SCREEN); return
        }
        val manager = getSystemService(MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
        startActivityForResult(manager.createScreenCaptureIntent(), REQ_PROJECTION)
    }

    private fun importMedia() {
        val picker = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
            type = "*/*"
            addCategory(Intent.CATEGORY_OPENABLE)
            putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true)
        }
        startActivityForResult(picker, REQ_PICK)
    }

    @Suppress("DEPRECATION")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (resultCode != RESULT_OK || data == null) return
        when (requestCode) {
            REQ_PROJECTION -> {
                try { startForegroundService(Intent(this, ScreenService::class.java).apply {
                    action = ScreenService.START
                    putExtra(ScreenService.RESULT, resultCode)
                    putExtra(ScreenService.DATA, data)
                    putExtra(ScreenService.MIC, pendingScreenMic)
                }) } catch (e: Exception) { toast("Recording couldn't start: ${e.message}"); return }
                askRecordingNotifications()
                toast("Capture permission granted • recording starting")
                handler.postDelayed({ refresh() }, 1000)
            }
            REQ_PICK -> {
                val uris = mutableListOf<android.net.Uri>()
                data.clipData?.let { c -> for (i in 0 until c.itemCount) c.getItemAt(i).uri?.let(uris::add) }
                if (uris.isEmpty()) data.data?.let(uris::add)
                importUris(uris, "Imported by you")
            }
        }
    }

    private fun importUris(uris: List<android.net.Uri>, source: String, note: String = "") {
        if (uris.isEmpty()) return
        status.text = "Saving ${uris.size} item(s) locally…"
        io.execute {
            var imported = 0
            val errors = mutableListOf<String>()
            for (uri in uris.take(30)) {
                try {
                    val id = AppFiles.importUri(this, uri, source)
                    if (note.isNotBlank()) {
                        val db = MemoryDb.get(this)
                        val item = db.get(id)!!
                        db.update(id, item.title, note, false)
                    }
                    imported++
                } catch (e: Exception) { errors.add(e.message ?: "Unknown import error") }
            }
            runOnUiThread {
                if (isDestroyed || isFinishing) return@runOnUiThread
                toast("Saved $imported item(s)${if (errors.isNotEmpty()) "; ${errors.size} failed: ${errors.first()}" else ""}")
                refresh()
            }
        }
    }

    @Suppress("DEPRECATION")
    private fun consumeShare(incoming: Intent?) {
        val action = incoming?.action ?: return
        if (action != Intent.ACTION_SEND && action != Intent.ACTION_SEND_MULTIPLE) return
        // Prevent replaying one incoming share when Android recreates this activity.
        setIntent(Intent(this, MainActivity::class.java))
        val subject = incoming.getStringExtra(Intent.EXTRA_SUBJECT)?.take(240) ?: ""
        val sharedText = incoming.getCharSequenceExtra(Intent.EXTRA_TEXT)?.toString()?.take(100_000) ?: ""
        val streams = mutableListOf<android.net.Uri>()
        if (action == Intent.ACTION_SEND) {
            val stream = if (Build.VERSION.SDK_INT >= 33)
                incoming.getParcelableExtra(Intent.EXTRA_STREAM, android.net.Uri::class.java)
            else incoming.getParcelableExtra(Intent.EXTRA_STREAM) as? android.net.Uri
            if (stream != null) streams.add(stream)
        } else {
            val list = if (Build.VERSION.SDK_INT >= 33)
                incoming.getParcelableArrayListExtra(Intent.EXTRA_STREAM, android.net.Uri::class.java)
            else incoming.getParcelableArrayListExtra<android.net.Uri>(Intent.EXTRA_STREAM)
            if (list != null) streams.addAll(list)
        }
        if (streams.isNotEmpty()) importUris(streams, "Shared by you from another app", sharedText)
        else if (sharedText.isNotBlank()) {
            io.execute {
                try {
                val isLink = Regex("https?://", RegexOption.IGNORE_CASE).containsMatchIn(sharedText)
                val t = subject.ifBlank { sharedText.lineSequence().firstOrNull()?.take(100) ?: "Shared text" }
                val id = MemoryDb.get(this).add(if (isLink) "link" else "note", t, sharedText, "Shared by you from another app")
                runOnUiThread {
                    if (isDestroyed || isFinishing) return@runOnUiThread
                    refresh()
                    toast("Saved • add context if you like")
                    startActivity(Intent(this, EditorActivity::class.java).putExtra("id", id))
                }
                } catch (e: Exception) { runOnUiThread { if (!isDestroyed) toast("Could not save: ${e.message}") } }
            }
        }
    }

    private fun dictateOffline() {
        if (Build.VERSION.SDK_INT < 31 || !SpeechRecognizer.isOnDeviceRecognitionAvailable(this)) {
            toast("Offline dictation isn't installed on this phone. Voice recording still works.")
            return
        }
        if (VoiceService.active || ScreenService.active) { toast("Finish the recording before dictating"); return }
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(arrayOf(Manifest.permission.RECORD_AUDIO), REQ_DICTATE_MIC); return
        }
        speech?.destroy()
        speech = SpeechRecognizer.createOnDeviceSpeechRecognizer(this).apply {
            setRecognitionListener(object : RecognitionListener {
                override fun onReadyForSpeech(params: Bundle?) { toast("Speak now — on-device dictation") }
                override fun onBeginningOfSpeech() {}
                override fun onRmsChanged(rmsdB: Float) {}
                override fun onBufferReceived(buffer: ByteArray?) {}
                override fun onEndOfSpeech() {}
                override fun onError(error: Int) { toast("Offline dictation not available (code $error)"); stopSpeech() }
                override fun onResults(results: Bundle?) {
                    val heard = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull()?.trim()
                    if (!heard.isNullOrBlank()) {
                        val id = MemoryDb.get(this@MainActivity).add("note", "Voice dictation", heard,
                            source = "On-device recognizer (text; no recording)")
                        refresh()
                        startActivity(Intent(this@MainActivity, EditorActivity::class.java).putExtra("id", id))
                    }
                    stopSpeech()
                }
                override fun onPartialResults(partialResults: Bundle?) {}
                override fun onEvent(eventType: Int, params: Bundle?) {}
            })
            startListening(Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
                putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, true)
                putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
            })
        }
    }

    private fun stopSpeech() { speech?.destroy(); speech = null }
    override fun onSaveInstanceState(outState: Bundle) {
        outState.putBoolean("pending_screen_mic", pendingScreenMic)
        super.onSaveInstanceState(outState)
    }
    private fun askRecordingNotifications() {
        if (Build.VERSION.SDK_INT >= 33 &&
            checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED &&
            !getPreferences(MODE_PRIVATE).getBoolean("asked_notify", false)) {
            getPreferences(MODE_PRIVATE).edit().putBoolean("asked_notify", true).apply()
            requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 29)
        }
    }
    override fun onDestroy() {
        handler.removeCallbacksAndMessages(null)
        stopSpeech(); io.shutdown(); super.onDestroy()
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (grantResults.firstOrNull() != PackageManager.PERMISSION_GRANTED) {
            if (requestCode != 29) toast("Permission not granted")
            return
        }
        when (requestCode) {
            REQ_MIC -> captureVoice()
            REQ_DICTATE_MIC -> dictateOffline()
            REQ_MIC_SCREEN -> captureScreen()
        }
    }

    private inner class MemoryAdapter : android.widget.BaseAdapter() {
        var items: List<MemoryItem> = emptyList()
        override fun getCount(): Int = items.size
        override fun getItem(position: Int): Any = items[position]
        override fun getItemId(position: Int): Long = items[position].id
        override fun getView(position: Int, convertView: View?, parent: ViewGroup?): View {
            val item = items[position]
            val layout = (convertView as? LinearLayout) ?: LinearLayout(this@MainActivity).apply {
                orientation = LinearLayout.VERTICAL
                setPadding(dp(20), dp(14), dp(20), dp(14))
                addView(text("", 16, fg).apply { typeface = Typeface.DEFAULT_BOLD })
                addView(text("", 13, sub).apply { setPadding(0, dp(3), 0, 0) })
                addView(text("", 12, sub).apply { setPadding(0, dp(4), 0, 0) })
            }
            val icon = when (item.kind) {
                "video" -> "▣"; "audio" -> "●"; "image" -> "▧"; "link" -> "↗"; "file" -> "▤"; else -> "✎"
            }
            val prefix = if (item.pinned) "★ " else ""
            (layout.getChildAt(0) as TextView).text = "$prefix$icon  ${item.title}"
            (layout.getChildAt(1) as TextView).text = (item.body.ifBlank { item.extracted }.ifBlank { "Tap to add context" }).replace('\n', ' ').take(170)
            (layout.getChildAt(2) as TextView).text = "${item.kind.uppercase()}  ·  ${DateFormat.getDateInstance(DateFormat.MEDIUM).format(Date(item.createdAt))}" +
                (item.suggestion?.let { "  ·  Suggested to review" } ?: "")
            val hit=visualHits[item.id]
            if(hit!=null) (layout.getChildAt(1) as TextView).text = "Visual similarity ${"%.3f".format(hit.similarity)}" + (if(item.kind=="video") " · sampled near ${hit.startMs/1000}s (activity unconfirmed)" else " · image pixels") + (if(item.id in textMatches) " + text match" else "")
            else if(query.text.isNotBlank()) (layout.getChildAt(2) as TextView).append(" · text / metadata match")
            return layout
        }
    }

    private fun horizontal() = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
    private fun actionButton(label: String, parent: LinearLayout, action: () -> Unit) = Button(this).apply {
        text = label; textSize = 12f; isAllCaps = false
        setTextColor(fg)
        setOnClickListener { action() }
        layoutParams = LinearLayout.LayoutParams(0, dp(50), 1f).apply { setMargins(dp(2), dp(3), dp(2), dp(3)) }
    }
    private fun text(value: String, size: Int, color: Int) = TextView(this).apply {
        text = value; textSize = size.toFloat(); setTextColor(color)
    }
    private fun dp(n: Int) = (resources.displayMetrics.density * n + 0.5f).toInt()
    private fun savedPrefs() = getSharedPreferences("local_settings", MODE_PRIVATE)
    private fun toast(s: String) = Toast.makeText(this, s, Toast.LENGTH_LONG).show()
}
