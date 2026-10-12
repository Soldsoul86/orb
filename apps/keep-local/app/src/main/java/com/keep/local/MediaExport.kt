package com.keep.local

import android.content.ClipData
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.CancellationSignal
import android.os.Environment
import android.os.StatFs
import android.provider.DocumentsContract
import android.provider.MediaStore
import android.webkit.MimeTypeMap
import java.io.File
import java.io.FileNotFoundException
import java.io.IOException
import java.util.Locale

/** Original bytes only. Never edits the original file or its database row. */
object MediaExport {
    fun source(context: Context, item: MemoryItem): File =
        AppFiles.safeFile(context, item.path)?.takeIf { it.length() > 0 }
            ?: throw FileNotFoundException("The original file is missing or empty")

    fun mime(item: MemoryItem): String {
        val stored = item.mime?.lowercase(Locale.ROOT)?.substringBefore(';')?.trim()
        val ext = item.path?.substringAfterLast('.', "")?.lowercase(Locale.ROOT).orEmpty()
        // Recordings retain their actual container; e.g. AAC audio in an M4A container.
        if (ext == "mp4" && item.kind == "video") return "video/mp4"
        if (ext == "m4a" && item.kind == "audio") return "audio/mp4"
        if (!stored.isNullOrBlank() && stored != "application/octet-stream" &&
            Regex("[a-z0-9!#$&^_.+-]+/[a-z0-9!#$&^_.+-]+").matches(stored)) return stored
        return MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext) ?: "application/octet-stream"
    }

    fun filename(item: MemoryItem): String {
        val ext = item.path?.substringAfterLast('.', "")?.takeIf { it.matches(Regex("[A-Za-z0-9]{1,16}")) }
            ?: MimeTypeMap.getSingleton().getExtensionFromMimeType(mime(item)) ?: "bin"
        return ExportNames.filename(item.title, ext)
    }

    fun sendIntent(context: Context, item: MemoryItem): Intent {
        source(context, item)
        val uri = AppFiles.itemUri(item.id)
        return Intent(Intent.ACTION_SEND).apply {
            type = mime(item)
            putExtra(Intent.EXTRA_STREAM, uri)
            clipData = ClipData.newUri(context.contentResolver, filename(item), uri)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
    }

    fun destinationIntent(item: MemoryItem) = Intent(Intent.ACTION_CREATE_DOCUMENT).apply {
        addCategory(Intent.CATEGORY_OPENABLE)
        type = mime(item)
        putExtra(Intent.EXTRA_TITLE, filename(item))
        // Keep Local does not initiate cloud uploads. Request local destinations.
        putExtra(Intent.EXTRA_LOCAL_ONLY, true)
    }

    fun isGalleryItem(item: MemoryItem) = mime(item).let { it.startsWith("video/") || it.startsWith("image/") }

    fun saveToGallery(context: Context, item: MemoryItem, cancel: CancellationSignal): Uri {
        val original = source(context, item)
        require(isGalleryItem(item)) { "Use Save to Files for this format" }
        cancel.throwIfCanceled()
        val free = StatFs(Environment.getExternalStorageDirectory().absolutePath).availableBytes
        if (original.length() > free - 16L * 1024 * 1024) throw IOException("Not enough storage")
        val video = mime(item).startsWith("video/")
        val collection = if (video) MediaStore.Video.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
            else MediaStore.Images.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
        val resolver = context.contentResolver
        val values = ContentValues().apply {
            put(MediaStore.MediaColumns.DISPLAY_NAME, filename(item))
            put(MediaStore.MediaColumns.MIME_TYPE, mime(item))
            put(MediaStore.MediaColumns.RELATIVE_PATH, "${if (video) Environment.DIRECTORY_MOVIES else Environment.DIRECTORY_PICTURES}/Keep Local")
            put(MediaStore.MediaColumns.IS_PENDING, 1)
            // If the OS kills the process mid-copy, Android can expire the unpublished row.
            put(MediaStore.MediaColumns.DATE_EXPIRES, System.currentTimeMillis() / 1000 + 86400)
        }
        // MediaStore generates a unique physical filename when DISPLAY_NAME collides.
        val uri = resolver.insert(collection, values) ?: throw IOException("Gallery is unavailable")
        try {
            copyTo(context, original, uri, cancel)
            cancel.throwIfCanceled()
            if (resolver.update(uri, ContentValues().apply {
                put(MediaStore.MediaColumns.IS_PENDING, 0)
                putNull(MediaStore.MediaColumns.DATE_EXPIRES)
            }, null, null) != 1) throw IOException("Cannot publish export")
            return uri
        } catch (e: Exception) {
            runCatching { resolver.delete(uri, null, null) }
            throw e
        }
    }

    fun saveToDocument(context: Context, item: MemoryItem, uri: Uri, cancel: CancellationSignal) {
        require(uri.scheme == "content" && uri.authority != "com.keep.local.media") { "Invalid destination" }
        try {
            copyTo(context, source(context, item), uri, cancel)
        } catch (e: Exception) {
            // ACTION_CREATE_DOCUMENT returned a new document; remove an incomplete copy.
            runCatching { DocumentsContract.deleteDocument(context.contentResolver, uri) }
            throw e
        }
    }

    private fun copyTo(context: Context, original: File, uri: Uri, cancel: CancellationSignal) {
        cancel.throwIfCanceled()
        val expected = original.length()
        context.contentResolver.openAssetFileDescriptor(uri, "w", cancel)?.use { descriptor ->
            descriptor.createOutputStream().use { output ->
                original.inputStream().use { input ->
                    ExportNames.copy(input, output, expected, cancel::throwIfCanceled)
                }
            }
        } ?: throw IOException("Cannot open destination")
    }
}
