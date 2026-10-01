package dev.orb.brain

import java.io.File

object TranslateTest {
    @Suppress("UNCHECKED_CAST")
    fun run(root: File) {
        Harness.suite("the translation carries only the fields the TypeScript lists name")
        val everything = LinkedHashMap<String, Any?>()
        for (f in Translate.ASSIST_FIELDS + Translate.SHARE_FIELDS) everything[f] = "x"
        everything["attachment"] = "sha256:00"
        everything["text"] = "secret"
        everything["elapsedRealtimeMs"] = 5L
        for ((name, fields) in listOf("assist" to Translate.ASSIST_FIELDS, "share" to Translate.SHARE_FIELDS)) {
            val t = (if (name == "assist") Translate.assist(everything) else Translate.share(everything))!!
            Harness.check("$name: no key outside its list", fields.containsAll(t.data.keys))
            Harness.check("$name: no content-bearing key", "text" !in t.data.keys && "attachment" !in t.data.keys)
        }

        Harness.suite("held to the TypeScript by the shared vectors")
        val vectors = Json.parse(File(root, "runtime/brain/tests/vectors/observations.json").readText()) as Map<String, Any?>
        val cases = vectors["cases"] as List<Map<String, Any?>>
        var translated = 0
        var refused = 0
        for (c in cases) {
            val plan = Observer.plan(listOf(c["line"] as String))
            val expected = c["expected"] as Map<String, Any?>?
            if (expected == null) {
                Harness.equal(c["name"] as String, plan.drafts.size, 0)
                refused++
            } else {
                Harness.equal(c["name"] as String, plan.drafts.singleOrNull()?.payload, expected)
                Harness.equal("   ...and it cites its event", plan.drafts.singleOrNull()?.causes, listOf(c["id"]))
                translated++
            }
        }
        Harness.check("both kinds of case ran", translated > 10 && refused > 3)

        Harness.suite("and by the lines the phone itself wrote")
        for (f in vectors["fixtures"] as List<Map<String, Any?>>) {
            val file = f["file"] as String
            val lines = File(root, file).readLines().filter { it.isNotEmpty() }
            val plan = Observer.plan(lines)
            Harness.equal("$file reads whole", plan.unreadable, 0)
            val expected = (f["expected"] as List<Map<String, Any?>>).filter { it["expected"] != null }
            Harness.equal("$file: one Observation per translatable event", plan.drafts.size, expected.size)
            for ((draft, want) in plan.drafts.zip(expected)) {
                Harness.equal("$file: ${want["cause"]}", draft.payload, want["expected"])
                Harness.equal("   ...cites its event", draft.causes, listOf(want["cause"]))
            }
        }
    }
}
