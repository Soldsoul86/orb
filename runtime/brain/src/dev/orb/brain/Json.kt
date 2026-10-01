package dev.orb.brain

/** The journal's own JSON, read strictly. Anything outside it is refused, never repaired. */
class JsonError(message: String) : Exception(message)

/**
 * A strict reader for the subset the journal writes: objects, arrays, strings, booleans, null and
 * **safe integers**.
 *
 * *Refused, not guessed:* a number with a fraction or exponent, an integer beyond 2^53 − 1,
 * a duplicate key in one object, a raw control character in a string, a bad escape, nesting past
 * [MAX_DEPTH], and anything after the value. The journal's encoder cannot produce any of these, so
 * meeting one means the line is not what the journal wrote — and a reader that "made sense of it"
 * would be interpreting a line nobody can vouch for.
 *
 * Values: `Map<String, Any?>` (insertion order), `List<Any?>`, `String`, `Long`, `Boolean`, `null`.
 */
object Json {
    const val MAX_DEPTH = 64
    private const val MAX_SAFE = 9007199254740991L

    @JvmStatic
    fun parse(text: String): Any? {
        val reader = Reader(text)
        reader.skipSpace()
        val value = reader.value(0)
        reader.skipSpace()
        if (!reader.atEnd()) throw JsonError("unexpected data after the value, at ${reader.at}")
        return value
    }

    private class Reader(private val s: String) {
        var at = 0

        fun atEnd() = at >= s.length

        fun skipSpace() {
            while (at < s.length && (s[at] == ' ' || s[at] == '\t' || s[at] == '\n' || s[at] == '\r')) at++
        }

        fun value(depth: Int): Any? {
            if (depth > MAX_DEPTH) throw JsonError("nested deeper than $MAX_DEPTH")
            if (atEnd()) throw JsonError("unexpected end")
            return when (val c = s[at]) {
                '{' -> obj(depth)
                '[' -> arr(depth)
                '"' -> str()
                't' -> literal("true", true)
                'f' -> literal("false", false)
                'n' -> literal("null", null)
                '-', in '0'..'9' -> num()
                else -> throw JsonError("unexpected '$c' at $at")
            }
        }

        private fun literal(word: String, v: Any?): Any? {
            if (!s.startsWith(word, at)) throw JsonError("bad literal at $at")
            at += word.length
            return v
        }

        private fun num(): Long {
            val start = at
            if (s[at] == '-') at++
            if (atEnd()) throw JsonError("bad number at $start")
            if (s[at] == '0') {
                at++
            } else if (s[at] in '1'..'9') {
                while (at < s.length && s[at] in '0'..'9') at++
            } else throw JsonError("bad number at $start")
            if (at < s.length && (s[at] == '.' || s[at] == 'e' || s[at] == 'E')) {
                throw JsonError("only integers are valid (at $start)")
            }
            val text = s.substring(start, at)
            if (text == "-0") throw JsonError("negative zero at $start")
            val n = text.toLongOrNull() ?: throw JsonError("number out of range at $start")
            if (n > MAX_SAFE || n < -MAX_SAFE) throw JsonError("not a safe integer at $start")
            return n
        }

        private fun str(): String {
            at++ // opening quote
            val out = StringBuilder()
            while (true) {
                if (atEnd()) throw JsonError("unterminated string")
                val c = s[at++]
                when {
                    c == '"' -> return out.toString()
                    c == '\\' -> {
                        if (atEnd()) throw JsonError("unterminated escape")
                        when (val e = s[at++]) {
                            '"' -> out.append('"')
                            '\\' -> out.append('\\')
                            '/' -> out.append('/')
                            'b' -> out.append('\b')
                            'f' -> out.append('\u000c')
                            'n' -> out.append('\n')
                            'r' -> out.append('\r')
                            't' -> out.append('\t')
                            'u' -> {
                                if (at + 4 > s.length) throw JsonError("short \\u escape")
                                val hex = s.substring(at, at + 4)
                                if (!hex.all { it in '0'..'9' || it in 'a'..'f' || it in 'A'..'F' }) {
                                    throw JsonError("bad \\u escape at $at")
                                }
                                out.append(hex.toInt(16).toChar())
                                at += 4
                            }
                            else -> throw JsonError("bad escape '\\$e' at ${at - 1}")
                        }
                    }
                    c < ' ' -> throw JsonError("raw control character in a string at ${at - 1}")
                    else -> out.append(c)
                }
            }
        }

        private fun arr(depth: Int): List<Any?> {
            at++
            val out = ArrayList<Any?>()
            skipSpace()
            if (!atEnd() && s[at] == ']') { at++; return out }
            while (true) {
                skipSpace()
                out.add(value(depth + 1))
                skipSpace()
                if (atEnd()) throw JsonError("unterminated array")
                when (s[at++]) {
                    ',' -> continue
                    ']' -> return out
                    else -> throw JsonError("expected ',' or ']' at ${at - 1}")
                }
            }
        }

        private fun obj(depth: Int): Map<String, Any?> {
            at++
            val out = LinkedHashMap<String, Any?>()
            skipSpace()
            if (!atEnd() && s[at] == '}') { at++; return out }
            while (true) {
                skipSpace()
                if (atEnd() || s[at] != '"') throw JsonError("expected a key at $at")
                val key = str()
                skipSpace()
                if (atEnd() || s[at++] != ':') throw JsonError("expected ':' at ${at - 1}")
                skipSpace()
                val v = value(depth + 1)
                if (out.containsKey(key)) throw JsonError("duplicate key \"$key\"")
                out[key] = v
                skipSpace()
                if (atEnd()) throw JsonError("unterminated object")
                when (s[at++]) {
                    ',' -> continue
                    '}' -> return out
                    else -> throw JsonError("expected ',' or '}' at ${at - 1}")
                }
            }
        }
    }
}
