package com.keep.local.next

import org.junit.Assert.*
import org.junit.Test
import java.io.ByteArrayInputStream
import java.io.IOException
import java.io.InputStream
import java.io.OutputStream

class ExportNamesTest {
    @Test fun titlesKeepExtensionsAndCannotEscapeDirectory() {
        assertEquals("CAD Test.mp4", ExportNames.filename("CAD Test", "mp4"))
        assertEquals("CAD Test.mp4", ExportNames.filename("CAD Test.MP4", "mp4"))
        assertEquals("Keep Local.pdf", ExportNames.filename("...", "pdf"))
        val unsafe = ExportNames.filename("../CAD\\Test:\n\u202E?*", "mp4")
        assertFalse(unsafe.contains('/'))
        assertFalse(unsafe.contains('\\'))
        assertFalse(unsafe.contains('\n'))
        assertFalse(unsafe.contains('\u202E'))
        assertTrue(unsafe.endsWith(".mp4"))
        val unicode = ExportNames.filename("😀".repeat(500), "mp4")
        assertTrue(unicode.toByteArray().size < 200)
        assertFalse(unicode.contains('\uFFFD'))
    }

    @Test fun streamsLargeFilesWithAtMost64KiBReads() {
        val size = 300L * 1024 * 1024
        var remaining = size
        var written = 0L
        val input = object : InputStream() {
            override fun read(): Int = error("Buffer required")
            override fun read(b: ByteArray, off: Int, len: Int): Int {
                assertTrue(len <= 65536)
                if (remaining == 0L) return -1
                val n = minOf(remaining, len.toLong()).toInt()
                remaining -= n
                return n
            }
        }
        val output = object : OutputStream() {
            override fun write(b: Int) = error("Buffer required")
            override fun write(b: ByteArray, off: Int, len: Int) { written += len }
        }
        assertEquals(size, ExportNames.copy(input, output, size) {})
        assertEquals(size, written)
    }

    @Test fun cancellationTruncationAndFullDestinationFail() {
        val sink = object : OutputStream() { override fun write(b: Int) {} }
        assertThrows(IOException::class.java) {
            ExportNames.copy(ByteArrayInputStream(byteArrayOf(1)), sink, 2) {}
        }
        assertThrows(InterruptedException::class.java) {
            ExportNames.copy(ByteArrayInputStream(byteArrayOf(1)), sink, 1) { throw InterruptedException() }
        }
        assertThrows(IOException::class.java) {
            ExportNames.copy(ByteArrayInputStream(ByteArray(100)), object : OutputStream() {
                override fun write(b: Int) { throw IOException("ENOSPC") }
            }, 100) {}
        }
    }
}
