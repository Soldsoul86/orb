package com.keep.local

import android.app.Activity
import android.graphics.Color
import android.media.MediaPlayer
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.view.View
import android.widget.*

/** Native media playback. Video OCR results become clickable time markers. */
class PlaybackActivity : Activity() {
    private var video: VideoView? = null
    private var player: MediaPlayer? = null
    private val handler = Handler(Looper.getMainLooper())
    private var refreshProgress: Runnable? = null
    private val white = Color.rgb(236, 240, 249)
    private val muted = Color.rgb(152, 166, 183)
    private val screen = Color.rgb(16, 20, 27)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val item = MemoryDb.get(this).get(intent.getLongExtra("id", -1))
        val file = AppFiles.safeFile(this, item?.path)
        if (item == null || file == null || item.kind !in listOf("audio", "video")) {
            Toast.makeText(this, "Recording not found", Toast.LENGTH_LONG).show(); finish(); return
        }
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(screen)
            setPadding(dp(12), dp(18), dp(12), dp(8))
        }
        setContentView(root)
        WindowInsetsHelper.applyTo(root)
        root.addView(label(item.title, 20, white))
        root.addView(label("Saved on device • ${CoreLogic.prettyBytes(item.bytes)}", 12, muted))
        val seekStart = intent.getLongExtra("start_ms", 0).toInt().coerceAtLeast(0)
        if (item.kind == "video") {
            video = VideoView(this).apply {
                setVideoPath(file.absolutePath)
                setMediaController(MediaController(this@PlaybackActivity).also { it.setAnchorView(this) })
                setOnPreparedListener {
                    if (seekStart > 0) seekTo(seekStart)
                    start()
                }
                setOnErrorListener { _, _, _ ->
                    Toast.makeText(this@PlaybackActivity, "Video decoder couldn't play this recording", Toast.LENGTH_LONG).show()
                    true
                }
            }
            root.addView(video, LinearLayout.LayoutParams(-1, dp(340)))
        } else {
            val button = Button(this).apply { text = "Loading audio…"; isEnabled = false }
            val seek = SeekBar(this)
            val elapsed = label("00:00", 12, muted)
            root.addView(button); root.addView(seek); root.addView(elapsed)
            try {
                player = MediaPlayer().apply {
                    setDataSource(file.absolutePath)
                    setOnPreparedListener { p ->
                        seek.max = p.duration.coerceAtLeast(1)
                        button.isEnabled = true
                        button.text = "Play / Pause"
                        if (seekStart > 0) p.seekTo(seekStart)
                        refreshProgress = object : Runnable {
                            override fun run() {
                                if (player != null) {
                                    seek.progress = player?.currentPosition ?: 0
                                    elapsed.text = "${seek.progress / 1000}s / ${seek.max / 1000}s"
                                    handler.postDelayed(this, 500)
                                }
                            }
                        }.also(handler::post)
                    }
                    prepareAsync()
                }
                button.setOnClickListener {
                    player?.let { if (it.isPlaying) it.pause() else it.start() }
                }
                seek.setOnSeekBarChangeListener(object : SeekBar.OnSeekBarChangeListener {
                    override fun onStartTrackingTouch(s: SeekBar?) {}
                    override fun onProgressChanged(s: SeekBar?, progress: Int, fromUser: Boolean) {
                        if (fromUser) player?.seekTo(progress)
                    }
                    override fun onStopTrackingTouch(s: SeekBar?) {}
                })
            } catch (e: Exception) { Toast.makeText(this, "Audio can't open: ${e.message}", Toast.LENGTH_LONG).show() }
        }
        if (item.extracted.isNotBlank()) {
            root.addView(label("TEXT FOUND IN VIDEO (TAP TO JUMP)", 12, muted).apply { setPadding(0, dp(18), 0, dp(8)) })
            val scroll = ScrollView(this)
            val markers = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
            scroll.addView(markers)
            root.addView(scroll, LinearLayout.LayoutParams(-1, 0, 1f))
            item.extracted.lines().take(120).forEach { line ->
                val seconds = Regex("^@(\\d+)s —").find(line)?.groupValues?.getOrNull(1)?.toIntOrNull()
                val b = if (seconds != null && item.kind == "video") Button(this) else TextView(this)
                b.apply {
                    text = line.take(240)
                    textSize = 12f
                    setTextColor(white)
                    if (seconds != null) setOnClickListener {
                        video?.seekTo(seconds * 1000)
                        video?.start()
                    }
                }
                markers.addView(b)
            }
        } else root.addView(label("Add a note to make this recording easier to find. Audio transcription is not yet included.", 12, muted))
    }

    override fun onPause() {
        video?.pause()
        runCatching { if (player?.isPlaying == true) player?.pause() }
        super.onPause()
    }

    override fun onDestroy() {
        refreshProgress?.let(handler::removeCallbacks)
        try { video?.stopPlayback() } catch (_: Exception) {}
        try { player?.release() } catch (_: Exception) {}
        player = null
        super.onDestroy()
    }
    private fun label(t: String, s: Int, c: Int) = TextView(this).apply { text = t; textSize = s.toFloat(); setTextColor(c) }
    private fun dp(n: Int) = (resources.displayMetrics.density * n + .5f).toInt()
}
