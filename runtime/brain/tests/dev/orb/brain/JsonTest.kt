package dev.orb.brain

object JsonTest {
    fun run() {
        Harness.suite("the reader reads what the journal writes")
        Harness.equal("an object", Json.parse("""{"a":1,"b":"x","c":true,"d":null,"e":[1,2]}"""),
            linkedMapOf<String, Any?>("a" to 1L, "b" to "x", "c" to true, "d" to null, "e" to listOf(1L, 2L)))
        Harness.equal("whitespace between tokens is allowed", Json.parse(" { \"a\" : [ 1 , 2 ] } "), mapOf("a" to listOf(1L, 2L)))
        Harness.equal("negative integers", Json.parse("-5"), -5L)
        Harness.equal("zero", Json.parse("0"), 0L)
        Harness.equal("the largest safe integer", Json.parse("9007199254740991"), 9007199254740991L)
        Harness.equal("escapes", Json.parse("\"a\\n\\t\\\"\\\\\\/\\u0041\\u00e9\""), "a\n\t\"\\/A\u00e9")
        Harness.equal("a surrogate pair survives as the two UTF-16 units it is", Json.parse("\"\\ud83d\\ude42\""), "\uD83D\uDE42")
        Harness.equal("raw non-ASCII passes through", Json.parse("\"é🙂\""), "é🙂")
        Harness.equal("an empty object and array", Json.parse("[{},[]]"), listOf(emptyMap<String, Any?>(), emptyList<Any?>()))

        Harness.suite("anything outside it is refused, not repaired")
        Harness.refuses("a fraction") { Json.parse("1.5") }
        Harness.refuses("an exponent") { Json.parse("1e3") }
        Harness.refuses("an integer past 2^53 - 1") { Json.parse("9007199254740992") }
        Harness.refuses("a huge integer") { Json.parse("123456789012345678901234567890") }
        Harness.refuses("negative zero") { Json.parse("-0") }
        Harness.refuses("a leading zero") { Json.parse("01") }
        Harness.refuses("a bare minus") { Json.parse("-") }
        Harness.refuses("a duplicate key") { Json.parse("""{"a":1,"a":2}""") }
        Harness.refuses("trailing data") { Json.parse("""{"a":1} x""") }
        Harness.refuses("two values") { Json.parse("1 2") }
        Harness.refuses("a raw newline inside a string") { Json.parse("\"a\nb\"") }
        Harness.refuses("a bad escape") { Json.parse("\"\\q\"") }
        Harness.refuses("a short unicode escape") { Json.parse("\"\\u12\"") }
        Harness.refuses("a non-hex unicode escape") { Json.parse("\"\\u12zz\"") }
        Harness.refuses("an unterminated string") { Json.parse("\"abc") }
        Harness.refuses("an unterminated object") { Json.parse("""{"a":1""") }
        Harness.refuses("an unterminated array") { Json.parse("[1,2") }
        Harness.refuses("a trailing comma in an array") { Json.parse("[1,]") }
        Harness.refuses("a trailing comma in an object") { Json.parse("""{"a":1,}""") }
        Harness.refuses("a missing colon") { Json.parse("""{"a" 1}""") }
        Harness.refuses("an unquoted key") { Json.parse("{a:1}") }
        Harness.refuses("a single-quoted string") { Json.parse("'a'") }
        Harness.refuses("a bare word") { Json.parse("nope") }
        Harness.refuses("an empty input") { Json.parse("") }
        Harness.refuses("NaN") { Json.parse("NaN") }

        Harness.suite("depth is bounded")
        val ok = "[".repeat(Json.MAX_DEPTH) + "]".repeat(Json.MAX_DEPTH)
        Harness.check("nesting at the limit reads", try { Json.parse(ok); true } catch (e: JsonError) { false })
        val tooDeep = "[".repeat(Json.MAX_DEPTH + 2) + "]".repeat(Json.MAX_DEPTH + 2)
        Harness.refuses("nesting past it is refused, not a stack overflow") { Json.parse(tooDeep) }
        Harness.refuses("a hostile ten-thousand-deep line is refused") { Json.parse("[".repeat(10000)) }
    }
}
