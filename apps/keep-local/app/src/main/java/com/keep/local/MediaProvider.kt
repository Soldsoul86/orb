package com.keep.local

import android.content.ContentProvider
import android.content.ContentValues
import android.database.Cursor
import android.database.MatrixCursor
import android.net.Uri
import android.os.ParcelFileDescriptor
import android.provider.OpenableColumns
import java.io.FileNotFoundException

/** Read-only per-item URIs; file paths never exposed to other apps. */
class MediaProvider : ContentProvider() {
    override fun onCreate(): Boolean = true

    private fun item(uri: Uri): MemoryItem {
        if (uri.authority != "com.keep.local.media" || uri.pathSegments.size != 2 || uri.pathSegments[0] != "item") {
            throw FileNotFoundException("Invalid item URI")
        }
        val id = uri.lastPathSegment?.toLongOrNull() ?: throw FileNotFoundException("Invalid id")
        return MemoryDb.get(requireNotNull(context)).get(id) ?: throw FileNotFoundException("Deleted item")
    }

    override fun openFile(uri: Uri, mode: String): ParcelFileDescriptor {
        if (mode != "r") throw FileNotFoundException("Read-only provider")
        val file = AppFiles.safeFile(requireNotNull(context), item(uri).path)
            ?: throw FileNotFoundException("No local media")
        return ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY)
    }

    override fun getType(uri: Uri): String = item(uri).mime ?: "application/octet-stream"
    override fun query(uri: Uri, projection: Array<out String>?, selection: String?, selectionArgs: Array<out String>?, sortOrder: String?): Cursor {
        val memory = item(uri)
        val cols = projection ?: arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE)
        val c = MatrixCursor(cols)
        c.addRow(cols.map {
            when (it) {
                OpenableColumns.DISPLAY_NAME -> memory.title
                OpenableColumns.SIZE -> memory.bytes
                else -> null
            }
        })
        return c
    }

    override fun insert(uri: Uri, values: ContentValues?): Uri? = throw UnsupportedOperationException("Read only")
    override fun update(uri: Uri, values: ContentValues?, selection: String?, selectionArgs: Array<out String>?): Int = 0
    override fun delete(uri: Uri, selection: String?, selectionArgs: Array<out String>?): Int = 0
}
