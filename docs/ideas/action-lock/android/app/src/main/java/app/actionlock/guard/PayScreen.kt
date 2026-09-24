package app.actionlock.guard

/**
 * Reads a UPI app's pay screen from its visible text. Pure: the service
 * collects the text of every node, in screen order; this finds the payee,
 * the amount and the Pay button. Unit-tested with text from real screens.
 */
data class ScreenNode(val text: String, val editable: Boolean = false, val clickable: Boolean = false)

data class PayScreenInfo(
    val name: String?,
    val vpa: String?,
    val amount: Double?,
    val payButton: Int,
    /** Nodes to cover: the Pay button, or the whole UPI PIN keypad. */
    val cover: List<Int> = listOf(payButton),
    /** The UPI PIN screen (NPCI's, the same in every UPI app): the last step before money leaves. */
    val pin: Boolean = false,
)

object PayScreen {
    /**
     * UPI apps whose screens are read. Every UPI app asks for the PIN on NPCI's
     * common-library screen, so the PIN-screen guard works in all of them; the
     * apps' own pay screens are read best-effort.
     */
    val apps = mapOf(
        "com.phonepe.app" to "PhonePe",
        "com.google.android.apps.nbu.paisa.user" to "Google Pay",
        "net.one97.paytm" to "Paytm",
        "in.org.npci.upiapp" to "BHIM",
        "com.dreamplug.androidapp" to "CRED",
        "in.amazon.mShop.android.shopping" to "Amazon Pay",
        "com.mobikwik_new" to "MobiKwik",
        "com.naviapp" to "Navi",
        "com.snapwork.hdfc" to "HDFC Bank",
        "com.csam.icici.bank.imobile" to "ICICI iMobile",
        "com.sbi.lotusintouch" to "SBI YONO",
        "com.axis.mobile" to "Axis Mobile",
        "com.msf.kbank.mobile" to "Kotak",
    )

    /** Apps whose own pay screens are read; in the others only the NPCI PIN screen is. */
    val ownScreens = setOf("com.phonepe.app", "com.google.android.apps.nbu.paisa.user")

    /** A money request someone sent you ("requested ₹500", "Approve payment"): the start of most collect scams. */
    private val requestRe = Regex("""(?:has requested|requested ₹|request(?:ed)? (?:money|payment)|collect request|payment request|approve (?:payment|request)|pending request)""", RegexOption.IGNORE_CASE)

    fun isRequest(nodes: List<ScreenNode>): Boolean = nodes.any { requestRe.containsMatchIn(it.text) }

    /** On a "cancel this payment?" dialog: the button that confirms cancelling. */
    fun cancelConfirm(nodes: List<ScreenNode>): Int {
        if (nodes.none { Regex("""cancel|abort|discard|go back""", RegexOption.IGNORE_CASE).containsMatchIn(it.text) && !it.clickable }) return -1
        return nodes.indexOfFirst { it.clickable && Regex("""^(?:yes|yes, cancel|cancel payment|cancel transaction|ok|confirm)$""", RegexOption.IGNORE_CASE).matches(it.text.trim()) }
    }

    /**
     * Payments you sent that this screen's history shows: Google Pay's
     * "Payment to CHETHAN ₹175 Paid • 29 Jun", PhonePe's "₹180" bubble followed by
     * "PAID". Money you received and the amount you are typing are not included.
     */
    fun history(nodes: List<ScreenNode>): List<Double> {
        val t = nodes.map { it.text.trim() }
        val out = mutableListOf<Double>()
        for (i in t.indices) {
            if (nodes[i].editable) continue
            Regex("""^payment to .+?₹\s?([\d,]+(?:\.\d{1,2})?)\s+(?:paid|completed|sent)\b""", RegexOption.IGNORE_CASE).find(t[i])?.let {
                it.groupValues[1].replace(",", "").toDoubleOrNull()?.let { a -> out += a }
                continue
            }
            val m = Regex("""^₹\s?([\d,]+(?:\.\d{1,2})?)$""").find(t[i]) ?: continue
            if (t.subList(i + 1, minOf(i + 3, t.size)).any { Regex("""^(?:paid|sent|completed)$""", RegexOption.IGNORE_CASE).matches(it) }) {
                m.groupValues[1].replace(",", "").toDoubleOrNull()?.let { out += it }
            }
        }
        return out
    }

    /** The screen's own close button (the PIN screen has one): how "Don't pay" leaves it. */
    fun closeButton(nodes: List<ScreenNode>): Int =
        nodes.indexOfFirst { it.clickable && Regex("""^(?:close|back|navigate up|cancel)$""", RegexOption.IGNORE_CASE).matches(it.text.trim()) }

    private val payLabel = Regex("""^(?:pay|pay now|proceed to pay|proceed|send|pay\s*₹\s*[\d,]+(?:\.\d{1,2})?)$""", RegexOption.IGNORE_CASE)
    private val vpaRe = Regex("""[A-Za-z0-9.\-_]{2,}@[A-Za-z][A-Za-z0-9]{1,63}""")
    private val amountRe = Regex("""^₹?\s?(\d{1,3}(?:,\d{2,3})*(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)$""")
    private val nameLike = Regex("""^[A-Za-z][A-Za-z .'&-]{2,60}$""")
    private val notNames = Regex("""^(?:pay|paying|to|from|banking name|transfer money to|upi|add a note|add message|proceed|send|cancel|back|close|logo|show menu|more|help|split|request|history|check balance|enter amount|amount)$""", RegexOption.IGNORE_CASE)
    private val appWords = Regex("""\s+(?:PhonePe|Google Pay|GPay|Paytm|BHIM|CRED)\s*$""", RegexOption.IGNORE_CASE)

    /** The UPI PIN screen: "Pay ₹3000.00", "To CHETHAN GOWDA P S" (or a UPI ID), "Enter your PIN", keys 0–9. */
    private fun pinScreen(nodes: List<ScreenNode>, texts: List<String>): PayScreenInfo? {
        if (texts.none { Regex("""^enter (?:your )?(?:upi )?pin""", RegexOption.IGNORE_CASE).containsMatchIn(it) }) return null
        val digits = nodes.indices.filter { nodes[it].clickable && Regex("""^\d$""").matches(texts[it]) }
        if (digits.size < 10) return null
        val amount = texts.firstNotNullOfOrNull { Regex("""^pay\s*₹\s*([\d,]+(?:\.\d{1,2})?)$""", RegexOption.IGNORE_CASE).find(it)?.groupValues?.get(1)?.replace(",", "")?.toDoubleOrNull() }
            ?: texts.firstNotNullOfOrNull { if (it.startsWith("₹")) number(it) else null }
        val to = texts.firstNotNullOfOrNull { Regex("""^to\s+(.+)$""", RegexOption.IGNORE_CASE).find(it)?.groupValues?.get(1)?.trim() }
        val vpa = to?.let { vpaRe.find(it)?.value }
        val name = to?.takeIf { vpa == null }
        // Cover the keypad and everything after it (backspace, the ✓ that submits).
        val cover = (digits.first() until nodes.size).filter { nodes[it].clickable }
        return PayScreenInfo(name, vpa, amount, digits.last(), cover, pin = true)
    }

    private fun number(s: String): Double? {
        val m = amountRe.find(s.trim()) ?: return null
        return m.groupValues[1].replace(",", "").toDoubleOrNull()?.takeIf { it > 0 }
    }

    /** Buttons that go on to pay only on a screen that is clearly a payment (an amount field or a banking name). */
    private val nextLabel = Regex("""^(?:next|continue|proceed|done|arrow|arrow forward|go|submit)$""", RegexOption.IGNORE_CASE)

    /** Looks like a money screen, even if no Pay button was recognised: worth keeping for improving the reader. */
    fun looksLikePayment(nodes: List<ScreenNode>): Boolean =
        nodes.any { Regex("""banking name|enter (?:your )?(?:upi )?pin|\bupi id\b""", RegexOption.IGNORE_CASE).containsMatchIn(it.text) }

    fun parse(nodes: List<ScreenNode>, pinOnly: Boolean = false): PayScreenInfo? {
        val texts = nodes.map { it.text.trim() }
        pinScreen(nodes, texts)?.let { return it }
        if (pinOnly) return null
        val paymentScreen = nodes.any { it.editable && number(it.text) != null } ||
            texts.any { Regex("""^(?:banking name|bank(?:ing)? name)""", RegexOption.IGNORE_CASE).containsMatchIn(it) }
        val payButton = nodes.indexOfLast { it.clickable && payLabel.matches(it.text.trim()) }
            .takeIf { it >= 0 }
            ?: nodes.indexOfLast { it.clickable && paymentScreen && nextLabel.matches(it.text.trim()) }
        if (payButton < 0) return null

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
        // Google Pay's chat header: "CHETHAN GOWDA P S PhonePe • 9535528118@axl".
        val dotted = texts.firstNotNullOfOrNull { t ->
            if (t.contains('•') && vpaRe.containsMatchIn(t)) t.substringBefore('•').replace(appWords, "").trim().takeIf { nameLike.matches(it) && !notNames.matches(it) } else null
        }
        val paying = texts.firstNotNullOfOrNull { Regex("""^(?:paying|pay to|sending to)\s+(.+)$""", RegexOption.IGNORE_CASE).find(it)?.groupValues?.get(1)?.trim() }
        val afterHeading = texts.indexOfFirst { Regex("""^(?:transfer money to|paying|to)$""", RegexOption.IGNORE_CASE).matches(it) }
            .takeIf { it >= 0 }
            ?.let { i -> texts.drop(i + 1).firstOrNull { nameLike.matches(it) && !notNames.matches(it) } }
        val beforeVpa = texts.indexOfFirst { vpaRe.containsMatchIn(it) }.takeIf { it > 0 }
            ?.let { i -> texts.take(i).lastOrNull { nameLike.matches(it) && !notNames.matches(it) } }
        val name = (banking ?: paying ?: dotted ?: afterHeading ?: beforeVpa)?.replace(Regex("""\s+"""), " ")?.trim()
        return PayScreenInfo(name, vpa, amount, payButton)
    }
}
