package chat.veil
import org.junit.Assert.*
import org.junit.Test

class PolicyTest {
    @Test fun holdReleaseAndBackgroundFailClosed() {
        val g = RevealGate()
        g.press(0); assertFalse(g.visible(Mode.EYES_ONLY, 1, 100, 0, 1))
        g.foreground(true, 2); g.press(3)
        assertTrue(g.visible(Mode.EYES_ONLY, 4, 100, 0, 4))
        g.release(5); assertFalse(g.visible(Mode.EYES_ONLY, 6, 100, 0, 6))
        g.press(7); g.foreground(false, 8)
        g.foreground(true, 9)
        assertFalse(g.visible(Mode.EYES_ONLY, 9, 100, 0, 9))
    }
    @Test fun expirationAndBudgetBoundaries() {
        val g = RevealGate(); g.foreground(true, 0); g.press(0)
        assertTrue(g.visible(Mode.EYES_ONLY, 10, 100, 20, 19))
        assertFalse(g.visible(Mode.EYES_ONLY, 10, 100, 20, 20))
        assertFalse(g.visible(Mode.NORMAL, 100, 100, 0, 1))
        g.release(10); g.press(11)
        assertFalse(g.visible(Mode.EYES_ONLY, 12, 100, 20, 21))
    }
}
