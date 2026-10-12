package com.keep.local.next

import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.media.MediaRecorder
import android.os.Build
import android.os.IBinder
import android.os.SystemClock
import android.widget.Toast
import java.io.File

/** Microphone capture with an explicit notification and a visible Stop action. */
class VoiceService : Service() {
    companion object {
        const val START = "com.keep.local.next.VOICE_START"
        const val STOP = "com.keep.local.next.VOICE_STOP"
        @Volatile var active = false
            private set
    }

    private var recorder: MediaRecorder? = null
    private var pending: File? = null
    private var began = 0L

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            START -> if (!active) start()
            STOP -> stopAndSave()
        }
        return START_NOT_STICKY
    }

    private fun start() {
        try {
            startForeground(201, RecordingNotifications.make(this,
                "Voice recording", "Microphone on • stored on this phone", STOP, VoiceService::class.java),
                if (Build.VERSION.SDK_INT >= 30) ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
                else 0)
            if (AppFiles.mediaDir(this).usableSpace < 500L * 1024 * 1024) error("Low storage")
            val file = AppFiles.tempFile(this, "m4a")
            pending = file
            val r = MediaRecorder()
            recorder = r // retain ownership even if prepare/start throws
            r.apply {
                setAudioSource(MediaRecorder.AudioSource.MIC)
                setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
                setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
                setAudioChannels(1)
                setAudioSamplingRate(16000)
                setAudioEncodingBitRate(32000)
                setMaxDuration(60 * 60 * 1000)
                setMaxFileSize(250L * 1024 * 1024)
                setOnInfoListener { _, what, _ ->
                    if (what == MediaRecorder.MEDIA_RECORDER_INFO_MAX_DURATION_REACHED ||
                        what == MediaRecorder.MEDIA_RECORDER_INFO_MAX_FILESIZE_REACHED) stopAndSave()
                }
                setOnErrorListener { _, _, _ -> stopAndSave() }
                setOutputFile(file.absolutePath)
                prepare()
                start()
            }
            began = SystemClock.elapsedRealtime()
            active = true
        } catch (e: Exception) {
            runCatching { recorder?.release() }; recorder = null
            pending?.delete(); pending = null
            active = false
            Toast.makeText(this, "Microphone couldn't start: ${e.message}", Toast.LENGTH_LONG).show()
            stopForeground(STOP_FOREGROUND_REMOVE)
            stopSelf()
        }
    }

    private fun stopAndSave() {
        if (!active) { stopSelf(); return }
        active = false
        val elapsed = SystemClock.elapsedRealtime() - began
        var success = false
        try { recorder?.stop(); success = true }
        catch (_: RuntimeException) { /* Android rejects recordings too short to finalize */ }
        finally { try { recorder?.release() } catch (_: Exception) {}; recorder = null }
        val partial = pending
        pending = null
        if (success && partial != null) {
            var file: File? = null
            try {
                file = AppFiles.finalName(this, partial, "m4a")
                MemoryDb.get(this).add("audio", "Voice • ${java.text.DateFormat.getDateTimeInstance().format(java.util.Date())}",
                    source = "Your microphone recording", path = AppFiles.relativePath(this, file),
                    mime = "audio/mp4", bytes = file.length(), durationMs = elapsed)
                Toast.makeText(this, "Voice saved locally", Toast.LENGTH_SHORT).show()
            } catch (e: Exception) {
                file?.delete(); partial.delete()
                Toast.makeText(this, "Could not save voice: ${e.message}", Toast.LENGTH_LONG).show()
            }
        } else partial?.delete()
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    override fun onDestroy() {
        if (active) stopAndSave() // best-effort save on service teardown
        super.onDestroy()
    }
}
