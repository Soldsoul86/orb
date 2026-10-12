package com.keep.local

import java.util.Locale

/** Pure deterministic functions: no model, I/O, network, or Android dependency. */
object CoreLogic {
    // FTS4 match input is NOT raw user input. Quote each token, with prefix matching.
    // Unicode letters and digits cover many scripts (FTS4 tokenizer still varies by device).
    fun ftsQuery(raw: String): String {
        val tokens = Regex("[\\p{L}\\p{M}\\p{N}]+")
            .findAll(raw.lowercase(Locale.ROOT))
            .take(8)
            .map { it.value.take(40) }
            .filter { it.isNotEmpty() }
            .toList()
        // FTS4 requires the wildcard INSIDE the quotes (FTS5 uses different syntax).
        return tokens.joinToString(" ") { "\"$it*\"" }
    }

    /** Suggestions, not facts. Only text the user explicitly shared/captured is analyzed. */
    fun suggestedFlag(title: String, body: String): String? {
        val text = "$title $body".lowercase(Locale.ROOT)
        val deadlines = listOf("tomorrow", "deadline", "due on", "by monday", "by tuesday", "by wednesday", "by thursday", "by friday", "by saturday", "by sunday", "remind me")
        val commitments = listOf("i will", "i'll", "please send", "follow up", "promised", "appointment", "meeting at")
        val decisions = listOf("we decided", "i decided", "agreed to", "decision:", "approved")
        return when {
            deadlines.any(text::contains) -> "Possible date or reminder — verify"
            commitments.any(text::contains) -> "Possible commitment — verify"
            decisions.any(text::contains) -> "Possible decision — verify"
            else -> null
        }
    }

    /** Constrain encoder to device-friendly dimensions; preserve screen aspect ratio. */
    fun videoSize(width: Int, height: Int): Pair<Int, Int> {
        require(width > 0 && height > 0)
        val scale = minOf(1.0, minOf(1280.0 / width, 1280.0 / height, 720.0 / minOf(width, height)))
        val w = ((width * scale).toInt() / 16 * 16).coerceAtLeast(16)
        val h = ((height * scale).toInt() / 16 * 16).coerceAtLeast(16)
        return w to h
    }

    fun prettyBytes(bytes: Long): String = when {
        bytes >= 1_073_741_824L -> "%.1f GB".format(Locale.US, bytes / 1_073_741_824.0)
        bytes >= 1_048_576L -> "%.1f MB".format(Locale.US, bytes / 1_048_576.0)
        bytes >= 1024L -> "%.0f KB".format(Locale.US, bytes / 1024.0)
        else -> "$bytes B"
    }
}
