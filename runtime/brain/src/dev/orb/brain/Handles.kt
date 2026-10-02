package dev.orb.brain

/**
 * Handles: the phone numbers, sites, UPI ids, email addresses, amounts and dates a text names — found by rules,
 * never stored (`docs/ENTITIES_PHONE.md`, DR-19). A port of `runtime/entities/src/handles.ts`, held to the
 * **hand-written** cases in `runtime/entities/tests/handle-cases.ts` by `tests/vectors/handles.json`: both
 * implementations are checked against an answer a person wrote down, not against each other.
 *
 * Pure: text in, a list out. A card-like run that passes the Luhn check is excluded and never returned. An unknown
 * format is not found, never guessed. Order of passes: cards (excluded), sites, emails, UPI ids, amounts, dates,
 * phone numbers; a span taken earlier is not read again.
 */
object Handles {
    data class Handle(val kind: String, val value: String)

    const val MAX_CHARS = 1_000_000
    const val MAX_HANDLES = 200

    private class Found(val start: Int, val handle: Handle)

    private val CARD = Regex("""(?<!\d)(?:\d{13,19}|\d{4}[ -]\d{4}[ -]\d{4}[ -]\d{1,7}|\d{4}[ -]\d{6}[ -]\d{5})(?!\d)""")
    // Whitespace is spelled out, not `\s`: the JVM's and JavaScript's differ, and the two must agree.
    private val URL = Regex("""(?:https?://|www\.)[^ \t\r\n\f\u000b\u00a0\u2028\u2029<>"')\]]+""", RegexOption.IGNORE_CASE)
    private val EMAIL = Regex("""(?<![A-Za-z0-9._%+-])[A-Za-z0-9][A-Za-z0-9._%+-]*@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+(?![A-Za-z0-9-])""")
    private val UPI = Regex("""(?<![A-Za-z0-9._%+@-])[A-Za-z0-9][A-Za-z0-9._-]{1,63}@[A-Za-z][A-Za-z0-9]{1,31}(?![A-Za-z0-9@-]|\.[A-Za-z0-9])""")
    private val AMOUNT = Regex("""(?<![A-Za-z0-9])(?:₹|rs\.?|inr)[ \t]*(\d{1,3}(?:,\d{2,3})+|\d+)(?:\.(\d{1,2}))?(?!\d)""", RegexOption.IGNORE_CASE)

    private const val MONTHS = "january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sept|sep|oct|nov|dec"
    private val DATE_SLASH = Regex("""(?<![\d/.-])(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?!\d)""")
    private val DATE_DOT = Regex("""(?<![\d/.-])(\d{2})\.(\d{2})\.(\d{4})(?!\d)""")
    private val DATE_ISO = Regex("""(?<![\d/.-])(\d{4})-(\d{2})-(\d{2})(?!\d)""")
    private val DATE_DAY_MONTH = Regex("""(?<![A-Za-z0-9])(\d{1,2})(?:st|nd|rd|th)?[ \t]+($MONTHS)(?![A-Za-z])\.?,?[ \t]+(\d{4})(?!\d)""", RegexOption.IGNORE_CASE)
    private val DATE_MONTH_DAY = Regex("""(?<![A-Za-z0-9])($MONTHS)(?![A-Za-z])\.?[ \t]+(\d{1,2})(?:st|nd|rd|th)?,?[ \t]+(\d{4})(?!\d)""", RegexOption.IGNORE_CASE)

    private val PHONE_PLUS_91 = Regex("""(?<![A-Za-z0-9+#/.-])\+91[ -]?([6-9]\d{4})[ -]?(\d{5})(?!\d)""")
    private val PHONE_IN = Regex("""(?<![A-Za-z0-9+#/.-])(?:91[ -]?|0)?([6-9]\d{4})[ -]?(\d{5})(?!\d)""")
    private val PHONE_INTL = Regex("""(?<![A-Za-z0-9+#/.-])\+(?!91)[1-9](?:[ -]?\d){7,14}(?!\d)""")

    private val MONTH_NUMBER = mapOf(
        "jan" to 1, "feb" to 2, "mar" to 3, "apr" to 4, "may" to 5, "jun" to 6,
        "jul" to 7, "aug" to 8, "sep" to 9, "oct" to 10, "nov" to 11, "dec" to 12)

    private val HOST = Regex("""[a-z0-9-]+(\.[a-z0-9-]+)+""")
    private val TLD = Regex("""[a-z]{2,}""")
    private val TLD_ANY_CASE = Regex("""[A-Za-z]{2,}""")
    private val SCHEME = Regex("""^https?://""", RegexOption.IGNORE_CASE)

    /** The handles a text names, in the order they appear, each (kind, value) once. */
    @JvmStatic
    fun extract(input: String): List<Handle> {
        val text = if (input.length > MAX_CHARS) input.substring(0, MAX_CHARS) else input
        val taken = BooleanArray(text.length)
        val found = ArrayList<Found>()

        fun free(start: Int, end: Int): Boolean {
            for (i in start until end) if (taken[i]) return false
            return true
        }
        fun take(start: Int, end: Int) {
            for (i in start until end) taken[i] = true
        }
        fun add(start: Int, kind: String, value: String) {
            found.add(Found(start, Handle(kind, value)))
        }

        // 0. Card-like runs that pass the Luhn check: excluded, never listed.
        for (m in CARD.findAll(text)) {
            if (luhn(m.value.filter { it in '0'..'9' })) take(m.range.first, m.range.last + 1)
        }

        // 1. Web addresses → the site.
        for (m in URL.findAll(text)) {
            val start = m.range.first
            val raw = m.value.trimEnd('.', ',', ';', ':', '!', '?')
            val host = hostOf(raw)
            if (host == null || !free(start, start + raw.length)) continue
            take(start, start + raw.length)
            add(start, "site", host)
        }

        // 2. Email addresses.
        for (m in EMAIL.findAll(text)) {
            val start = m.range.first
            val domain = m.value.substring(m.value.indexOf('@') + 1)
            if (!TLD_ANY_CASE.matches(domain.substring(domain.lastIndexOf('.') + 1))) continue
            if (!free(start, start + m.value.length)) continue
            take(start, start + m.value.length)
            add(start, "email", m.value.lowercase())
        }

        // 3. UPI ids.
        for (m in UPI.findAll(text)) {
            val start = m.range.first
            if (!free(start, start + m.value.length)) continue
            take(start, start + m.value.length)
            add(start, "upi", m.value.lowercase())
        }

        // 4. Amounts, in rupees.
        for (m in AMOUNT.findAll(text)) {
            val start = m.range.first
            if (!free(start, start + m.value.length)) continue
            take(start, start + m.value.length)
            val fraction = m.groups[2]?.value
            add(start, "amount", amountValue(m.groupValues[1], fraction))
        }

        // 5. Dates that name themselves, day first.
        fun dates(pattern: Regex, read: (MatchResult) -> String?) {
            for (m in pattern.findAll(text)) {
                val start = m.range.first
                val value = read(m) ?: continue
                if (!free(start, start + m.value.length)) continue
                take(start, start + m.value.length)
                add(start, "date", value)
            }
        }
        dates(DATE_SLASH) { date(num(it, 3), num(it, 2), num(it, 1)) }
        dates(DATE_DOT) { date(num(it, 3), num(it, 2), num(it, 1)) }
        dates(DATE_ISO) { date(num(it, 1), num(it, 2), num(it, 3)) }
        dates(DATE_DAY_MONTH) { date(num(it, 3), monthNumber(it.groupValues[2]), num(it, 1)) }
        dates(DATE_MONTH_DAY) { date(num(it, 3), monthNumber(it.groupValues[1]), num(it, 2)) }

        // 6. Phone numbers.
        for (m in PHONE_PLUS_91.findAll(text)) {
            val start = m.range.first
            if (!free(start, start + m.value.length)) continue
            take(start, start + m.value.length)
            add(start, "phone", "+91" + m.groupValues[1] + m.groupValues[2])
        }
        for (m in PHONE_IN.findAll(text)) {
            val start = m.range.first
            if (!free(start, start + m.value.length)) continue
            take(start, start + m.value.length)
            add(start, "phone", "+91" + m.groupValues[1] + m.groupValues[2])
        }
        for (m in PHONE_INTL.findAll(text)) {
            val start = m.range.first
            if (!free(start, start + m.value.length)) continue
            take(start, start + m.value.length)
            add(start, "phone", "+" + m.value.filter { it in '0'..'9' })
        }

        val seen = HashSet<String>()
        val out = ArrayList<Handle>()
        for (f in found.sortedBy { it.start }) {
            if (!seen.add(f.handle.kind + "\u0000" + f.handle.value)) continue
            out.add(f.handle)
            if (out.size == MAX_HANDLES) break
        }
        return out
    }

    private fun num(m: MatchResult, group: Int): Int = m.groupValues[group].toInt()

    private fun monthNumber(name: String): Int = MONTH_NUMBER[name.substring(0, 3).lowercase()] ?: 0

    private fun luhn(digits: String): Boolean {
        var sum = 0
        var double = false
        for (i in digits.length - 1 downTo 0) {
            var d = digits[i] - '0'
            if (double) {
                d *= 2
                if (d > 9) d -= 9
            }
            sum += d
            double = !double
        }
        return sum % 10 == 0
    }

    private fun hostOf(url: String): String? {
        var rest = url
        val scheme = SCHEME.find(rest)
        if (scheme != null) rest = rest.substring(scheme.value.length)
        var end = rest.length
        for (stop in charArrayOf('/', '?', '#', ':')) {
            val at = rest.indexOf(stop)
            if (at in 0 until end) end = at
        }
        var host = rest.substring(0, end).lowercase()
        if (host.startsWith("www.")) host = host.substring(4)
        if (!HOST.matches(host)) return null
        if (!TLD.matches(host.substring(host.lastIndexOf('.') + 1))) return null
        return host
    }

    private fun amountValue(whole: String, fraction: String?): String {
        val digits = whole.replace(",", "").replace(Regex("^0+(?=\\d)"), "")
        val cents = fraction?.padEnd(2, '0') ?: ""
        return if (cents == "" || cents == "00") "INR $digits" else "INR $digits.$cents"
    }

    private fun date(year: Int, month: Int, day: Int): String? {
        if (year < 1900 || year > 2100 || month < 1 || month > 12 || day < 1) return null
        val leap = year % 4 == 0 && (year % 100 != 0 || year % 400 == 0)
        val days = intArrayOf(31, if (leap) 29 else 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31)[month - 1]
        if (day > days) return null
        fun two(n: Int) = n.toString().padStart(2, '0')
        return "$year-${two(month)}-${two(day)}"
    }
}
