package app.actionlock.guard

/**
 * Kotlin copy of src/orb/message.ts: what the lock does with a WhatsApp draft
 * you are about to send. Pure. Kept identical by MessageRulesTest, which runs
 * the shared cases in test/message-vectors.json.
 */
object MessageRules {
    val label = mapOf(
        "code" to "One-time code", "pin" to "PIN", "card" to "Card number", "cvv" to "Card CVV",
        "password" to "Password", "aadhaar" to "Aadhaar number", "phrase" to "Recovery phrase",
    )

    private val why = mapOf(
        "code" to "This looks like a one-time code (OTP). Banks, couriers and support staff never need it; sharing it is how most accounts are taken over.",
        "pin" to "This looks like a PIN. No one ever needs it, not even your bank.",
        "card" to "This contains a card number.",
        "cvv" to "This contains a card's CVV. With the number, it is enough to spend on your card.",
        "password" to "This contains a password.",
        "aadhaar" to "This contains an Aadhaar number.",
        "phrase" to "This looks like a wallet recovery phrase. Anyone who has it can take everything in the wallet.",
    )

    fun luhn(digits: String): Boolean {
        var sum = 0
        for (i in digits.indices) {
            var d = digits[digits.length - 1 - i] - '0'
            if (i % 2 == 1) {
                d *= 2
                if (d > 9) d -= 9
            }
            sum += d
        }
        return sum % 10 == 0
    }

    private fun has(re: String, s: String) = Regex(re).containsMatchIn(s)

    fun findings(draft: String): List<String> {
        val t = draft.trim()
        val lower = t.lowercase()
        val out = mutableListOf<String>()
        if (Regex("""^\d{6}$""").matches(t) || (has("""(^|[^a-z])(otp|code|verification|one time|one-time)([^a-z]|$)""", lower) && has("""(^|[^0-9])\d{4,8}([^0-9]|$)""", t))) out += "code"
        if (has("""(^|[^a-z])(upi pin|atm pin|mpin|pin)([^a-z]|$)[^0-9]{0,12}\d{4,6}([^0-9]|$)""", lower)) out += "pin"
        for (m in Regex("""\d[\d -]{11,22}\d""").findAll(t)) {
            val digits = m.value.replace(" ", "").replace("-", "")
            if (digits.length in 13..19 && luhn(digits)) {
                out += "card"
                break
            }
        }
        if (has("""(^|[^a-z])(cvv|cvc)([^a-z]|$)[^0-9]{0,10}\d{3,4}([^0-9]|$)""", lower)) out += "cvv"
        if (has("""(^|[^a-z])(password|passwd|pwd|passcode)\s*(is|:|=|-)\s*[^\s]{4,}""", lower) || has("""(^|[^a-z])(password|passwd|pwd|passcode)\s+[^\s]*[0-9@#$%!&*][^\s]*""", lower)) out += "password"
        if (has("""(?<![0-9])(?<![0-9] )\d{4} \d{4} \d{4}(?! ?[0-9])""", t) || (has("""aadhaa?r""", lower) && has("""(^|[^0-9])\d{12}([^0-9]|$)""", t))) out += "aadhaar"
        val words = lower.split(Regex("""\s+""")).filter { it.isNotEmpty() }
        if (words.size >= 12 && words.all { Regex("""^[a-z]{3,8}$""").matches(it) }) out += "phrase"
        return out
    }

    data class Check(val decision: GuardDecision, val findings: List<String>)

    fun check(draft: String, unknownSender: Boolean, onCall: Boolean): Check {
        val found = findings(draft)
        if (found.isEmpty()) return Check(GuardDecision("pass", 0, emptyList()), found)
        val reasons = found.map { why.getValue(it) }.toMutableList()
        var seconds = 10
        var confirm = found.any { it == "pin" || it == "card" || it == "cvv" || it == "phrase" }
        if (confirm) seconds = 20
        if (unknownSender) {
            reasons += "You're sending it to a number that isn't in your contacts."
            seconds = maxOf(seconds, 20)
            confirm = true
        }
        if (onCall) {
            reasons += "You're on a call. Scammers ask for codes while they keep you talking."
            seconds += 10
            confirm = true
        }
        return Check(GuardDecision(if (confirm) "confirm" else "wait", seconds, reasons), found)
    }
}
