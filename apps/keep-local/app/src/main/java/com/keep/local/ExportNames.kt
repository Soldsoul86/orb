package com.keep.local.next

import java.io.InputStream
import java.io.OutputStream
import java.io.IOException
import java.util.Locale

/** Pure, bounded-memory export helpers. Filenames never contain directory components. */
object ExportNames {
    fun filename(title: String, extension: String): String {
        val ext = extension.lowercase(Locale.ROOT).filter { it.isLetterOrDigit() && it.code < 128 }
            .take(16).ifBlank { "bin" }
        var stem = title.replace(Regex("[\\p{Cntrl}\\p{Cf}/\\\\:*?\"<>|]"), "_").trim().trim('.')
        if (stem.endsWith(".$ext", ignoreCase = true)) stem = stem.dropLast(ext.length + 1)
        stem = stem.trim().trim('.').ifBlank { "Keep Local" }
        // Leave room for MediaStore's duplicate suffix within common 255-byte limits.
        while (stem.toByteArray(Charsets.UTF_8).size > 180) {
            stem = stem.substring(0, stem.offsetByCodePoints(stem.length, -1))
        }
        return "$stem.$ext"
    }

    fun copy(input: InputStream, output: OutputStream, expected: Long, checkCancelled: () -> Unit): Long {
        val buffer = ByteArray(64 * 1024)
        var copied = 0L
        while (true) {
            checkCancelled()
            val count = input.read(buffer)
            if (count < 0) break
            if (count == 0) continue
            output.write(buffer, 0, count)
            copied += count
        }
        checkCancelled()
        if (copied != expected) throw IOException("Source changed during export")
        output.flush()
        return copied
    }
}
