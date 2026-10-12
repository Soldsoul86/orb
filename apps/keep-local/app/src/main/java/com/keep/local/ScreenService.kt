package com.keep.local.next

import android.app.Activity
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.media.MediaRecorder
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.SystemClock
import android.util.DisplayMetrics
import android.view.WindowManager
import android.widget.Toast
import java.io.File

/** MediaProjection screen capture. No hidden/automatic recording and no internal-audio bypass. */
class ScreenService : Service() {
    companion object {
        const val START = "com.keep.local.next.SCREEN_START"
        const val STOP = "com.keep.local.next.SCREEN_STOP"
        const val RESULT = "result"
        const val DATA = "consent"
        const val MIC = "microphone"
        @Volatile var active = false
            private set
    }

    private var recorder: MediaRecorder? = null
    private var display: VirtualDisplay? = null
    private var projection: MediaProjection? = null
    private var callback: MediaProjection.Callback? = null
    private var pending: File? = null
    private var startedAt = 0L
    private var saving = false
    private val handler = Handler(Looper.getMainLooper())

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            START -> if (!active && !saving) begin(intent)
            STOP -> saveAndStop()
        }
        return START_NOT_STICKY // consent token cannot be reused after process death
    }

    @Suppress("DEPRECATION")
    private fun begin(intent: Intent) {
        var created = false
        try {
            val mic = intent.getBooleanExtra(MIC, false)
            val types = ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION or
                (if (mic && Build.VERSION.SDK_INT >= 30) ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE else 0)
            startForeground(202, RecordingNotifications.make(this,
                "Screen recording", if (mic) "Screen and microphone • on-device" else "Screen video only • on-device",
                STOP, ScreenService::class.java), types)
            val freeBytes = AppFiles.mediaDir(this).usableSpace
            if (freeBytes < 500L * 1024 * 1024) error("Low storage")
            val consent = if (Build.VERSION.SDK_INT >= 33) intent.getParcelableExtra(DATA, Intent::class.java)
                else intent.getParcelableExtra(DATA) as? Intent
            requireNotNull(consent) { "Screen recording consent missing" }
            val metrics = DisplayMetrics()
            (getSystemService(WINDOW_SERVICE) as WindowManager).defaultDisplay.getRealMetrics(metrics)
            val (width, height) = CoreLogic.videoSize(metrics.widthPixels, metrics.heightPixels)
            val file = AppFiles.tempFile(this, "mp4")
            pending = file
            val r = MediaRecorder()
            recorder = r // release on failures during configuration or prepare
            r.apply {
                if (mic) setAudioSource(MediaRecorder.AudioSource.MIC)
                setVideoSource(MediaRecorder.VideoSource.SURFACE)
                setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
                setVideoEncoder(MediaRecorder.VideoEncoder.H264)
                setVideoSize(width, height)
                setVideoFrameRate(24)
                setVideoEncodingBitRate(1_600_000)
                setMaxDuration(30 * 60 * 1000) // bound long recordings on low-storage phones
                // Keep a reserve when the phone has less than 1 GiB free.
                setMaxFileSize(minOf(1_073_741_824L, freeBytes - 250L * 1024 * 1024))
                setOnErrorListener { _, _, _ -> handler.post { saveAndStop() } }
                setOnInfoListener { _, what, _ ->
                    if (what == MediaRecorder.MEDIA_RECORDER_INFO_MAX_DURATION_REACHED ||
                        what == MediaRecorder.MEDIA_RECORDER_INFO_MAX_FILESIZE_REACHED) {
                        handler.post { saveAndStop() }
                    }
                }
                if (mic) {
                    setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
                    setAudioChannels(1)
                    setAudioSamplingRate(16000)
                    setAudioEncodingBitRate(32000)
                }
                setOutputFile(file.absolutePath)
                prepare()
            }
            projection = (getSystemService(MEDIA_PROJECTION_SERVICE) as MediaProjectionManager)
                .getMediaProjection(intent.getIntExtra(RESULT, Activity.RESULT_CANCELED), consent)
            val cb = object : MediaProjection.Callback() {
                override fun onStop() { handler.post { saveAndStop() } }
                // Fixed H.264 output size; app-window capture may letterbox when resized.
            }
            callback = cb
            projection!!.registerCallback(cb, handler)
            // Android 14+: exactly ONE virtual-display creation per consent session.
            display = projection!!.createVirtualDisplay("KeepLocalCapture", width, height,
                metrics.densityDpi, DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,
                r.surface, null, handler)
            r.start()
            startedAt = SystemClock.elapsedRealtime()
            created = true
            active = true
        } catch (e: Exception) {
            Toast.makeText(this, "Screen capture couldn't start: ${e.message}", Toast.LENGTH_LONG).show()
        } finally {
            if (!created) cleanupWithoutSave()
        }
    }

    private fun saveAndStop() {
        if (saving) return
        saving = true
        val wasActive = active
        active = false
        val duration = if (wasActive) SystemClock.elapsedRealtime() - startedAt else 0L
        var finalized = false
        try { if (wasActive) { recorder?.stop(); finalized = true } }
        catch (_: RuntimeException) { /* files shorter than recorder warm-up might not finalize */ }
        finally { cleanupProjection(); try { recorder?.release() } catch (_: Exception) {}; recorder = null }
        val partial = pending
        pending = null
        if (finalized && partial != null) {
            var f: File? = null
            try {
                f = AppFiles.finalName(this, partial, "mp4")
                val id = MemoryDb.get(this).add("video", "Screen • ${java.text.DateFormat.getDateTimeInstance().format(java.util.Date())}",
                    source = "Screen capture with Android consent",
                    path = AppFiles.relativePath(this, f), mime = "video/mp4", bytes = f.length(), durationMs = duration)
                runCatching { AppFiles.scheduleOcr(this, id) }
                Toast.makeText(this, "Video saved locally", Toast.LENGTH_SHORT).show()
            } catch (e: Exception) {
                f?.delete(); partial.delete()
                Toast.makeText(this, "Unable to save video: ${e.message}", Toast.LENGTH_LONG).show()
            }
        } else partial?.delete()
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    private fun cleanupProjection() {
        try { display?.release() } catch (_: Exception) {}
        display = null
        val p = projection
        projection = null
        try { if (p != null && callback != null) p.unregisterCallback(callback!!) } catch (_: Exception) {}
        callback = null
        try { p?.stop() } catch (_: Exception) {}
    }

    private fun cleanupWithoutSave() {
        cleanupProjection()
        try { recorder?.release() } catch (_: Exception) {}
        recorder = null
        pending?.delete(); pending = null
        active = false
        saving = true
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    override fun onDestroy() {
        if (active && !saving) saveAndStop()
        else if (!saving) cleanupWithoutSave()
        super.onDestroy()
    }
}
