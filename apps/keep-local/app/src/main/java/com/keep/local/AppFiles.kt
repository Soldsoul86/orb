package com.keep.local.next

import android.app.job.JobInfo
import android.app.job.JobScheduler
import android.content.ComponentName
import android.content.Context
import android.database.Cursor
import android.net.Uri
import android.os.PersistableBundle
import android.os.StatFs
import android.provider.OpenableColumns
import android.webkit.MimeTypeMap
import java.io.File
import java.io.IOException
import java.util.UUID

/** Byte-streaming imports; no file or video is buffered entirely in memory. */
object AppFiles {
    private const val MAX_IMPORT_BYTES = 1_073_741_824L // 1 GiB per file
    private const val SAFETY_FREE_BYTES = 500L * 1024 * 1024

    fun mediaDir(context: Context): File = File(context.filesDir, "media").also { it.mkdirs() }

    fun tempFile(context: Context, extension: String): File =
        File(mediaDir(context), "${UUID.randomUUID()}.pending.$extension")

    fun finalName(context: Context, pending: File, extension: String): File {
        val final = File(mediaDir(context), "${UUID.randomUUID()}.$extension")
        if (!pending.renameTo(final)) throw IOException("Cannot finalize recording")
        return final
    }

    fun relativePath(context: Context, file: File): String {
        val base = context.filesDir.canonicalFile.toPath()
        val path = file.canonicalFile.toPath()
        require(path.startsWith(base)) { "Outside app storage" }
        return base.relativize(path).toString()
    }

    /** A persisted relative path is untrusted input: prevent path traversal. */
    fun safeFile(context: Context, relative: String?): File? {
        if (relative.isNullOrBlank()) return null
        val base = mediaDir(context).canonicalFile.toPath()
        val candidate = File(context.filesDir, relative).canonicalFile
        return candidate.takeIf { it.toPath().startsWith(base) && it.isFile }
    }

    fun itemUri(id: Long): Uri = Uri.parse("content://com.keep.local.next.media/item/$id")

    fun cleanStalePartialFiles(context: Context) {
        // Only remove old unfinished captures, never completed media or recent captures.
        val threshold = System.currentTimeMillis() - 24L * 60 * 60 * 1000
        mediaDir(context).listFiles()?.forEach { f ->
            if (f.name.contains(".pending.") && f.lastModified() < threshold) f.delete()
        }
    }

    fun importUri(context: Context, uri: Uri, source: String = "Imported by you"): Long {
        val mime = context.contentResolver.getType(uri) ?: "application/octet-stream"
        val kind = when {
            mime.startsWith("image/") -> "image"
            mime.startsWith("video/") -> "video"
            mime.startsWith("audio/") -> "audio"
            else -> "file"
        }
        val title = getDisplayName(context, uri).take(240)
        val rawExt = MimeTypeMap.getSingleton().getExtensionFromMimeType(mime)
            ?: title.substringAfterLast('.', "bin")
        val ext = rawExt.lowercase().filter { it in 'a'..'z' || it in '0'..'9' }.take(8).ifBlank { "bin" }
        val pending = tempFile(context, ext)
        val diskFree = StatFs(context.filesDir.absolutePath).availableBytes
        if (diskFree < SAFETY_FREE_BYTES) throw IOException("Storage is nearly full; free space before importing")
        var count = 0L
        try {
            context.contentResolver.openInputStream(uri)?.use { input ->
                pending.outputStream().buffered(64 * 1024).use { output ->
                    val buffer = ByteArray(64 * 1024)
                    while (true) {
                        val n = input.read(buffer)
                        if (n < 0) break
                        count += n
                        if (count > MAX_IMPORT_BYTES || count > diskFree - SAFETY_FREE_BYTES) {
                            throw IOException("Import exceeds size/free-space limit")
                        }
                        output.write(buffer, 0, n)
                    }
                }
            } ?: throw IOException("Cannot open the shared file")
            val file = finalName(context, pending, ext)
            return try {
                val id = MemoryDb.get(context).add(
                    kind, title.ifBlank { "Imported $kind" }, source = source,
                    path = relativePath(context, file), mime = mime, bytes = count
                )
                // Indexing is best effort: a scheduler failure must not delete saved media.
                if (kind == "image" || kind == "video") runCatching { scheduleOcr(context, id) }
                id
            } catch (e: Exception) { file.delete(); throw e }
        } finally { pending.delete() }
    }

    private fun getDisplayName(context: Context, uri: Uri): String {
        var cursor: Cursor? = null
        return try {
            cursor = context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)
            cursor?.takeIf { it.moveToFirst() }?.getString(0)
                ?: uri.lastPathSegment ?: "Imported file"
        } catch (_: Exception) { "Imported file" } finally { cursor?.close() }
    }

    fun scheduleOcr(context: Context, id: Long) {
        val scheduler = context.getSystemService(JobScheduler::class.java)
        val extras = PersistableBundle().apply { putLong("memory_id", id) }
        val job = JobInfo.Builder(20_000 + (id % 1_000_000).toInt(), ComponentName(context, OcrJob::class.java))
            .setExtras(extras)
            .setMinimumLatency(1500)
            .setOverrideDeadline(120_000)
            .build()
        scheduler.schedule(job)
    }
}
