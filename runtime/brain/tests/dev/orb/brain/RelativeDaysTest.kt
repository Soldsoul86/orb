package dev.orb.brain

import java.io.File

/** The relative-day reader, held to the cases a person worked out on a calendar (`runtime/entities/tests/relative-cases.ts`). */
object RelativeDaysTest {
    @Suppress("UNCHECKED_CAST")
    fun run(root: File) {
        Harness.suite("relative days: held to the hand-written cases")
        val vectors = Json.parse(File(root, "runtime/brain/tests/vectors/relative.json").readText()) as Map<String, Any?>
        val cases = vectors["cases"] as List<Map<String, Any?>>
        var found = 0
        var nothing = 0
        for (c in cases) {
            val expect = (c["expect"] as List<Map<String, Any?>>).map { RelativeDays.Day(it["date"] as String, it["phrase"] as String) }
            Harness.equal(c["name"] as String, RelativeDays.extract(c["text"] as String, c["anchor"] as String), expect)
            if (expect.isEmpty()) nothing++ else found++
        }
        Harness.check("both kinds of case ran (${cases.size})", found >= 25 && nothing >= 25)

        Harness.suite("relative days: bounds and determinism")
        Harness.equal("a word inside the first million characters is read", RelativeDays.extract("${"a ".repeat(499_990)} tomorrow", "2026-10-06").size, 1)
        Harness.equal("one past it is not", RelativeDays.extract("${"a ".repeat(500_001)}tomorrow", "2026-10-06"), emptyList<RelativeDays.Day>())
        val many = RelativeDays.extract((1..30).joinToString(" ") { "in $it days" }, "2026-10-06")
        Harness.equal("at most 20 days", many.size, RelativeDays.MAX_DAYS)
        Harness.equal("the earliest in the text", many.first().phrase, "in 1 day")
        Harness.equal("and no later", many.last().phrase, "in 20 days")
        val text = "tomorrow, Friday and in two weeks"
        Harness.equal("deterministic", RelativeDays.extract(text, "2026-10-06"), RelativeDays.extract(text, "2026-10-06"))
        Harness.check("a different anchor moves every date", RelativeDays.extract(text, "2026-10-06") != RelativeDays.extract(text, "2026-10-07"))
    }
}
