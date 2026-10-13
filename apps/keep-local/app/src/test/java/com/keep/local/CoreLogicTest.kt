package com.keep.local.next

import org.junit.Assert.*
import org.junit.Test

class CoreLogicTest {
    @Test fun originalCoreContract() { main() }
    @Test fun boundsHostileQueries() {
        assertEquals(8, CoreLogic.ftsQuery((1..100).joinToString(" ")).split(' ').size)
        assertEquals("\"${"a".repeat(40)}*\"", CoreLogic.ftsQuery("a".repeat(10_000)))
        assertEquals("", CoreLogic.ftsQuery("\"'():* -"))
    }
    @Test fun encoderBoundsAndAlignment() {
        for ((w, h) in listOf(1080 to 2400, 2400 to 1080, 720 to 1600, 3840 to 2160)) {
            val (x, y) = CoreLogic.videoSize(w, h)
            assertTrue(x <= 1280 && y <= 1280 && minOf(x, y) <= 720)
            assertEquals(0, x % 16)
            assertEquals(0, y % 16)
        }
    }
}
