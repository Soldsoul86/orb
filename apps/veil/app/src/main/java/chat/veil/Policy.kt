package chat.veil

enum class Mode(val label: String) { NORMAL("Normal"), PROTECTED("Protected"), EYES_ONLY("Eyes-Only") }

/** Pure policy; all time budgets are enforced again at the point of rendering. */
class RevealGate {
    var held = false; private set
    var foreground = false; private set
    var spentMs = 0L; private set
    private var startedAt: Long? = null
    fun foreground(value: Boolean, elapsed: Long) {
        if (!value) release(elapsed)
        foreground = value
    }
    fun press(elapsed: Long) {
        if (foreground && !held) { held = true; startedAt = elapsed }
    }
    fun release(elapsed: Long) {
        startedAt?.let { spentMs += (elapsed - it).coerceAtLeast(0) }
        startedAt = null; held = false
    }
    fun visible(mode: Mode, now: Long, expiresAt: Long, budgetMs: Long, elapsed: Long): Boolean {
        val used = spentMs + (startedAt?.let { (elapsed - it).coerceAtLeast(0) } ?: 0)
        return foreground && now < expiresAt && (budgetMs == 0L || used < budgetMs) &&
            (mode == Mode.NORMAL || held)
    }
}
