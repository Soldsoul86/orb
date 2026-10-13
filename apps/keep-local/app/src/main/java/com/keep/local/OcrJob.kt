package com.keep.local.next

import android.app.job.JobParameters
import android.app.job.JobService
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.media.MediaMetadataRetriever
import com.google.android.gms.tasks.Tasks
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import java.io.File
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Slow interpretation is isolated from capture + UI and uses bounded memory.
 * 1 still or <=12 low-res frames per video. No cloud and no continuous monitoring.
 */
class OcrJob : JobService() {
    private val worker = Executors.newSingleThreadExecutor()
    private val cancelled = ConcurrentHashMap<Int, AtomicBoolean>()

    override fun onStartJob(params: JobParameters): Boolean {
        val stopped = AtomicBoolean(false)
        cancelled[params.jobId] = stopped
        worker.execute {
            var retry=false
            val generation=getSharedPreferences("visual",0).getLong("generation",0)
            try {
                if (VoiceService.active || ScreenService.active || getSystemService(android.os.PowerManager::class.java).currentThermalStatus >= android.os.PowerManager.THERMAL_STATUS_SEVERE) { retry=true;return@execute }
                val id = params.extras.getLong("memory_id", -1)
                val item = MemoryDb.get(this).get(id)
                val file = item?.path?.let { AppFiles.safeFile(this, it) }
                if (item != null && file != null && item.kind in listOf("image", "video")) {
                    val extracted = extractText(item, file, stopped)
                    if (VoiceService.active || ScreenService.active) retry=true
                    else synchronized(VisualIndex) { if (!stopped.get() && generation==getSharedPreferences("visual",0).getLong("generation",0)) MemoryDb.get(this).setExtracted(id, extracted) }
                }
            } catch (_: Exception) { /* keep media even if OCR fails */ }
            finally {
                cancelled.remove(params.jobId)
                if (!stopped.get()) jobFinished(params, retry)
            }
        }
        return true
    }

    override fun onStopJob(params: JobParameters): Boolean {
        cancelled[params.jobId]?.set(true)
        return true // allow retry if interrupted
    }

    private fun extractText(item: MemoryItem, file: File, stopped: AtomicBoolean): String {
        val recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
        var retriever: MediaMetadataRetriever? = null
        val found = mutableListOf<String>()
        var previous = ""
        try {
            if (item.kind == "video") retriever = MediaMetadataRetriever().apply { setDataSource(file.absolutePath) }
            val durMs = retriever?.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)?.toLongOrNull() ?: 0L
            val samplesMs = if (retriever != null) {
                (0..11).map { (durMs.coerceAtLeast(1000) - 1L) * it / 11 }.distinct()
            } else listOf(0L)
            val rawW = retriever?.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_WIDTH)?.toIntOrNull() ?: 640
            val rawH = retriever?.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_HEIGHT)?.toIntOrNull() ?: 360
            val scale = minOf(1.0, 640.0 / maxOf(rawW.coerceAtLeast(1), rawH.coerceAtLeast(1)))
            val smallW = (rawW * scale).toInt().coerceAtLeast(16)
            val smallH = (rawH * scale).toInt().coerceAtLeast(16)
            for (ms in samplesMs) {
                if (stopped.get() || VoiceService.active || ScreenService.active) break
                var frame: Bitmap? = null
                try {
                    frame = if (retriever == null) decodeSmall(file) else
                        retriever.getScaledFrameAtTime(ms * 1000, MediaMetadataRetriever.OPTION_CLOSEST_SYNC, smallW, smallH)
                    if (frame == null) continue
                    val result = Tasks.await(recognizer.process(InputImage.fromBitmap(frame, 0)))
                    val text = result.text.trim()
                    if (text.isNotEmpty() && text != previous) {
                        found.add(if (retriever == null) "Image text — $text" else "@${ms / 1000}s — $text")
                        previous = text
                    }
                } catch (_: OutOfMemoryError) { break }
                catch (_: Exception) { /* skip corrupt frame, never lose recording */ }
                finally { frame?.recycle() }
            }
        } finally {
            try { retriever?.release() } catch (_: Exception) {}
            recognizer.close()
        }
        return found.joinToString("\n").take(100_000)
    }

    private fun decodeSmall(file: File): Bitmap? {
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeFile(file.absolutePath, bounds)
        var sample = 1
        while (maxOf(bounds.outWidth, bounds.outHeight) / sample > 1600) sample *= 2
        return BitmapFactory.decodeFile(file.absolutePath, BitmapFactory.Options().apply { inSampleSize = sample })
    }

    override fun onDestroy() {
        cancelled.values.forEach { it.set(true) }
        worker.shutdownNow()
        super.onDestroy()
    }
}
