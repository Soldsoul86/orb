package com.keep.local.next

import android.content.Context
import android.net.Uri
import android.os.ParcelFileDescriptor
import java.io.FileNotFoundException
import java.io.InputStream

/** One read-only source abstraction for private captures and consented external references. */
object MediaSource {
    fun external(item: MemoryItem) = item.path?.startsWith("content://") == true
    fun uri(c: Context, item: MemoryItem): Uri {
        if (!external(item)) return Uri.fromFile(AppFiles.safeFile(c,item.path) ?: throw FileNotFoundException("Original unavailable"))
        if (!AuthorizedLibrary.accessible(c,item.id)) throw SecurityException("Source access is unavailable; authorize it in Settings")
        return Uri.parse(item.path)
    }
    fun open(c: Context,item: MemoryItem): InputStream = c.contentResolver.openInputStream(uri(c,item)) ?: throw FileNotFoundException("Original unavailable")
    fun descriptor(c:Context,item:MemoryItem):ParcelFileDescriptor = c.contentResolver.openFileDescriptor(uri(c,item),"r") ?: throw FileNotFoundException("Original unavailable")
    fun check(c:Context,item:MemoryItem) { descriptor(c,item).use { if(it.statSize==0L) throw FileNotFoundException("Original is empty") } }
}
