package dev.orb.brain

/**
 * Names: which of a person's contacts a text *mentions by name* (`docs/PEOPLE_PHONE.md` §3.4). A port of
 * `runtime/entities/src/names.ts`, held to its **hand-written** cases by `tests/vectors/names.json`. Pure: contacts and text in,
 * matches out, nothing stored.
 *
 * Deliberately plain, because a name is a word that happens to be a name: the **full name** (two words or more) matches as a
 * whole-word phrase in any case; a **first name** (three letters or more) matches only if it is **unique among the contacts** and
 * **capitalised** (a script with no case always is) and **not the first word of the text, a line or a sentence** (cased scripts only);
 * whole words only. Every match says which kind it is.
 */
object Names {
    data class Contact(val id: String, val name: String)
    data class Match(val id: String, val by: String, val word: String)

    const val MAX_CHARS = 1_000_000
    const val MAX_CONTACTS = 5000
    const val MIN_FIRST = 3

    /** Lower case that never changes the length of the text, so a position found in the folded text is one in the original. */
    private fun fold(text: String): String {
        val out = StringBuilder()
        var i = 0
        while (i < text.length) {
            val cp = text.codePointAt(i)
            val ch = String(Character.toChars(cp))
            val lower = ch.lowercase()
            out.append(if (lower.length == ch.length) lower else ch)
            i += ch.length
        }
        return out.toString()
    }

    private fun isLetter(cp: Int) = Character.isLetter(cp)

    private fun isLetterOrNumber(cp: Int): Boolean {
        if (Character.isLetter(cp)) return true
        val t = Character.getType(cp)
        return t == Character.DECIMAL_DIGIT_NUMBER.toInt() || t == Character.LETTER_NUMBER.toInt() || t == Character.OTHER_NUMBER.toInt()
    }

    private fun words(name: String): List<String> = name.split(' ', '\t', '\r', '\n').filter { it.isNotEmpty() }

    private fun letterCount(word: String): Int {
        var n = 0
        var i = 0
        while (i < word.length) {
            val cp = word.codePointAt(i)
            if (isLetter(cp)) n++
            i += Character.charCount(cp)
        }
        return n
    }

    private fun firstName(name: String): String? {
        val first = words(name).firstOrNull() ?: return null
        return if (letterCount(first) >= MIN_FIRST) first else null
    }

    /** First names (lower case) that more than one contact has. */
    @JvmStatic
    fun sharedFirstNames(contacts: List<Contact>): List<String> {
        val count = HashMap<String, Int>()
        for (c in contacts.take(MAX_CONTACTS)) {
            val f = firstName(c.name) ?: continue
            val key = fold(f)
            count[key] = (count[key] ?: 0) + 1
        }
        return count.filter { it.value > 1 }.keys.sorted()
    }

    private fun bounded(text: String, start: Int, end: Int): Boolean {
        if (start > 0 && isLetterOrNumber(text.codePointBefore(start))) return false
        if (end < text.length && isLetterOrNumber(text.codePointAt(end))) return false
        return true
    }

    private fun occurrences(text: String, lowerText: String, word: String): List<Int> {
        val out = ArrayList<Int>()
        val target = fold(word)
        var from = 0
        while (true) {
            val at = lowerText.indexOf(target, from)
            if (at < 0) break
            if (bounded(text, at, at + target.length)) out.add(at)
            from = at + 1
        }
        return out
    }

    private fun capitalised(text: String, at: Int): Boolean {
        val cp = text.codePointAt(at)
        val ch = String(Character.toChars(cp))
        return ch == ch.uppercase()
    }

    private fun cased(text: String, at: Int): Boolean {
        val ch = String(Character.toChars(text.codePointAt(at)))
        return ch.lowercase() != ch.uppercase()
    }

    private val BLANKS = setOf(' ', '\t', '\u00a0')
    private val SENTENCE_ENDS = setOf('.', '!', '?', '\u2026', '\u0964')

    /** Is the word at [at] the first of the text, of a line, or of a sentence? Only blanks may come between. */
    private fun startsSentence(text: String, at: Int): Boolean {
        var i = at - 1
        while (i >= 0 && text[i] in BLANKS) i--
        if (i < 0) return true
        val prev = text[i]
        return prev == '\n' || prev == '\r' || prev in SENTENCE_ENDS
    }

    /** The contacts a text mentions by name, each at most once (the first way it was found), in contact order. */
    @JvmStatic
    fun match(input: String, contacts: List<Contact>): List<Match> {
        val text = if (input.length > MAX_CHARS) input.substring(0, MAX_CHARS) else input
        val lower = fold(text)
        val shared = sharedFirstNames(contacts).toSet()
        val out = ArrayList<Match>()
        for (c in contacts.take(MAX_CONTACTS)) {
            val parts = words(c.name)
            if (parts.size >= 2) {
                val phrase = parts.joinToString(" ")
                val at = occurrences(text, lower, phrase).firstOrNull()
                if (at != null) {
                    out.add(Match(c.id, "full", text.substring(at, at + phrase.length)))
                    continue
                }
            }
            val first = firstName(c.name) ?: continue
            if (fold(first) in shared) continue
            for (at in occurrences(text, lower, first)) {
                if (capitalised(text, at) && !(cased(text, at) && startsSentence(text, at))) {
                    out.add(Match(c.id, "first", text.substring(at, at + first.length)))
                    break
                }
            }
        }
        return out
    }
}
