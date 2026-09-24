package app.actionlock.guard

/**
 * Reads a UPI app's pay screen from its visible text. Pure: the service
 * collects the text of every node, in screen order; this finds the payee,
 * the amount and the Pay button. Unit-tested with text from real screens.
 */
data class ScreenNode(val text: String, val editable: Boolean = false, val clickable: Boolean = false)

data class PayScreenInfo(val name: String?, val vpa: String?, val amount: Double?, val payButton: Int)

object PayScreen {
    val apps = mapOf(
        "com.phonepe.app" to "PhonePe",
        "com.google.android.apps.nbu.paisa.user" to "Google Pay",
    )

    private val payLabel = Regex("""^(?:pay|pay now|proceed to pay|proceed|send|pay\s*₹\s*[\d,]+(?:\.\d{1,2})?)$""", RegexOption.IGNORE_CASE)
    private val vpaRe = Regex("""[A-Za-z0-9.\-_]{2,}@[A-Za-z][A-Za-z0-9]{1,63}""")
    private val amountRe = Regex("""^₹?\s?(\d{1,3}(?:,\d{2,3})*(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)$""")
    private val nameLike = Regex("""^[A-Za-z][A-Za-z .'&-]{2,60}$""")
    private val notNames = Regex("""^(?:pay|paying|to|from|banking name|transfer money to|upi|add a note|add message|proceed|send|cancel|back|more|help|split|request|history|check balance|enter amount|amount)$""", RegexOption.IGNORE_CASE)

    private fun number(s: String): Double? {
        val m = amountRe.find(s.trim()) ?: return null
        return m.groupValues[1].replace(",", "").toDoubleOrNull()?.takeIf { it > 0 }
    }

    fun parse(nodes: List<ScreenNode>): PayScreenInfo? {
        val payButton = nodes.indexOfLast { it.clickable && payLabel.matches(it.text.trim()) }
        if (payButton < 0) return null
        val texts = nodes.map { it.text.trim() }

        // Amount: what you typed in the amount field. Only a screen with no amount field (a
        // confirm step) falls back to the "Pay ₹3,000" button or a "₹3,000" line; otherwise
        // old amounts in the chat history above ("₹12,050 PAID") would be taken for it.
        val amount = if (nodes.any { it.editable }) {
            nodes.firstNotNullOfOrNull { if (it.editable) number(it.text) else null }
        } else {
            Regex("""\d[\d,]*(?:\.\d{1,2})?""").find(texts[payButton])?.value?.replace(",", "")?.toDoubleOrNull()
                ?: texts.lastOrNull { it.startsWith("₹") && number(it) != null }?.let { number(it) }
        }

        val vpa = texts.firstNotNullOfOrNull { vpaRe.find(it)?.value }

        // Payee: the name the bank has on record, then "Paying NAME", then the line after a "to" heading,
        // then the name-like line just before the UPI ID.
        val banking = texts.firstNotNullOfOrNull { t ->
            Regex("""^(?:banking name|bank(?:ing)? name|registered name)\s*[:\-]?\s*(.+)$""", RegexOption.IGNORE_CASE).find(t)?.groupValues?.get(1)?.trim()
        }?.takeIf { it.isNotEmpty() }
            ?: texts.indexOfFirst { Regex("""^(?:banking name|bank(?:ing)? name)\s*:?$""", RegexOption.IGNORE_CASE).matches(it) }.takeIf { it >= 0 }?.let { texts.getOrNull(it + 1) }
        val paying = texts.firstNotNullOfOrNull { Regex("""^(?:paying|pay to|sending to)\s+(.+)$""", RegexOption.IGNORE_CASE).find(it)?.groupValues?.get(1)?.trim() }
        val afterHeading = texts.indexOfFirst { Regex("""^(?:transfer money to|paying|to)$""", RegexOption.IGNORE_CASE).matches(it) }
            .takeIf { it >= 0 }
            ?.let { i -> texts.drop(i + 1).firstOrNull { nameLike.matches(it) && !notNames.matches(it) } }
        val beforeVpa = texts.indexOfFirst { vpaRe.containsMatchIn(it) }.takeIf { it > 0 }
            ?.let { i -> texts.take(i).lastOrNull { nameLike.matches(it) && !notNames.matches(it) } }
        val name = (banking ?: paying ?: afterHeading ?: beforeVpa)?.replace(Regex("""\s+"""), " ")?.trim()
        return PayScreenInfo(name, vpa, amount, payButton)
    }
}
