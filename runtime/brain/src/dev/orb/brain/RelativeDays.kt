package dev.orb.brain

/**
 * Relative days — *"I'll send it Friday"*, *"call tomorrow"*, *"in two weeks"* — read as **a guess from a day passed in**.
 * A port of `runtime/entities/src/relative.ts`, held to its **hand-written** cases (worked out on a calendar) by
 * `tests/vectors/relative.json`. No clock of its own: the anchor (the day the words were kept) is an argument, so the answer is
 * deterministic. Conservative on purpose: *next / last / every / each / other / any / since / following* before a weekday,
 * plurals, abbreviations, *today*, the past and other languages are **not read** (`docs/RELATIVE_DAYS_PHONE.md`).
 */
object RelativeDays {
    data class Day(val date: String, val phrase: String)

    const val MAX_CHARS = 1_000_000
    const val MAX_DAYS = 20

    private class Found(val start: Int, val day: Day)

    private val DAY_AFTER = Regex("""(?<![A-Za-z])day after tomorrow(?![A-Za-z])""", RegexOption.IGNORE_CASE)
    private val TOMORROW = Regex("""(?<![A-Za-z])tomorrow(?![A-Za-z])""", RegexOption.IGNORE_CASE)
    private val IN_N = Regex("""(?<![A-Za-z])in[ \t]+(\d{1,3}|one|two|three|four|five|six|seven|eight|nine|ten)[ \t]+(days?|weeks?)(?![A-Za-z])""", RegexOption.IGNORE_CASE)
    private val WEEKDAY = Regex("""(?<![A-Za-z])(sunday|monday|tuesday|wednesday|thursday|friday|saturday)(?![A-Za-z])""", RegexOption.IGNORE_CASE)
    private val BEFORE = Regex("""(?:^|[^A-Za-z])([A-Za-z]+)[ \t\r\n]+$""")
    private val ANCHOR = Regex("""(\d{4})-(\d{2})-(\d{2})""")

    private val WEEKDAYS = listOf("sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday")
    private val NUMBER_WORDS = mapOf("one" to 1, "two" to 2, "three" to 3, "four" to 4, "five" to 5, "six" to 6, "seven" to 7, "eight" to 8, "nine" to 9, "ten" to 10)
    private val NOT_A_PLAIN_WEEKDAY = setOf("next", "last", "previous", "past", "every", "each", "other", "any", "since", "following")

    private fun daysFromCivil(year: Int, month: Int, day: Int): Long {
        val y = (if (month <= 2) year - 1 else year).toLong()
        val era = Math.floorDiv(y, 400L)
        val yoe = y - era * 400
        val doy = (153 * (month + (if (month > 2) -3 else 9)) + 2) / 5 + day - 1
        val doe = yoe * 365 + yoe / 4 - yoe / 100 + doy
        return era * 146097 + doe - 719468
    }

    private fun civilFromDays(days: Long): Triple<Int, Int, Int> {
        val z = days + 719468
        val era = Math.floorDiv(z, 146097L)
        val doe = z - era * 146097
        val yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365
        val doy = doe - (365 * yoe + yoe / 4 - yoe / 100)
        val mp = (5 * doy + 2) / 153
        val day = (doy - (153 * mp + 2) / 5 + 1).toInt()
        val month = (if (mp < 10) mp + 3 else mp - 9).toInt()
        val year = (yoe + era * 400 + (if (month <= 2) 1 else 0)).toInt()
        return Triple(year, month, day)
    }

    private fun anchorDay(anchor: String): Long? {
        val m = ANCHOR.matchEntire(anchor) ?: return null
        val year = m.groupValues[1].toInt()
        val month = m.groupValues[2].toInt()
        val day = m.groupValues[3].toInt()
        if (year < 1900 || year > 2100) return null
        val days = daysFromCivil(year, month, day)
        return if (civilFromDays(days) == Triple(year, month, day)) days else null
    }

    private fun two(n: Int) = n.toString().padStart(2, '0')

    private fun format(days: Long): String? {
        val (year, month, day) = civilFromDays(days)
        return if (year > 2100) null else "${year.toString().padStart(4, '0')}-${two(month)}-${two(day)}"
    }

    /** 0 = Sunday. */
    private fun weekdayOf(days: Long): Int = Math.floorMod(days + 4, 7L).toInt()

    /** The relative days a text names, as dates, in the order they appear, each date once. */
    @JvmStatic
    fun extract(input: String, anchor: String): List<Day> {
        val base = anchorDay(anchor) ?: return emptyList()
        val text = if (input.length > MAX_CHARS) input.substring(0, MAX_CHARS) else input
        val taken = BooleanArray(text.length)
        val found = ArrayList<Found>()

        fun free(start: Int, end: Int): Boolean {
            for (i in start until end) if (taken[i]) return false
            return true
        }
        fun add(start: Int, end: Int, daysAhead: Long, phrase: String) {
            val date = format(base + daysAhead) ?: return
            if (!free(start, end)) return
            for (i in start until end) taken[i] = true
            found.add(Found(start, Day(date, phrase)))
        }

        for (m in DAY_AFTER.findAll(text)) add(m.range.first, m.range.last + 1, 2, "day after tomorrow")
        for (m in TOMORROW.findAll(text)) add(m.range.first, m.range.last + 1, 1, "tomorrow")
        for (m in IN_N.findAll(text)) {
            val raw = m.groupValues[1].lowercase()
            val n = NUMBER_WORDS[raw] ?: raw.toInt()
            val weeks = m.groupValues[2].lowercase().startsWith("week")
            if (n < 1 || (if (weeks) n > 52 else n > 365)) continue
            add(m.range.first, m.range.last + 1, if (weeks) n * 7L else n.toLong(), "in $n ${if (weeks) "week" else "day"}${if (n == 1) "" else "s"}")
        }
        for (m in WEEKDAY.findAll(text)) {
            val start = m.range.first
            val before = BEFORE.find(text.substring(maxOf(0, start - 16), start))
            if (before != null && before.groupValues[1].lowercase() in NOT_A_PLAIN_WEEKDAY) continue
            val word = m.groupValues[1].lowercase()
            val delta = Math.floorMod(WEEKDAYS.indexOf(word) - weekdayOf(base), 7)
            add(start, m.range.last + 1, if (delta == 0) 7L else delta.toLong(), word)
        }

        val seen = HashSet<String>()
        val out = ArrayList<Day>()
        for (f in found.sortedBy { it.start }) {
            if (!seen.add(f.day.date)) continue
            out.add(f.day)
            if (out.size == MAX_DAYS) break
        }
        return out
    }
}
