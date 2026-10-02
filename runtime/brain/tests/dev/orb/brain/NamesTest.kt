package dev.orb.brain

import java.io.File

/** The name matcher, held to the cases a person wrote down (`runtime/entities/tests/name-cases.ts`). */
object NamesTest {
    @Suppress("UNCHECKED_CAST")
    fun run(root: File) {
        Harness.suite("names: held to the hand-written cases")
        val vectors = Json.parse(File(root, "runtime/brain/tests/vectors/names.json").readText()) as Map<String, Any?>
        val cases = vectors["cases"] as List<Map<String, Any?>>
        var found = 0
        var nothing = 0
        for (c in cases) {
            val contacts = (c["contacts"] as List<Map<String, Any?>>).map { Names.Contact(it["id"] as String, it["name"] as String) }
            val expect = (c["expect"] as List<Map<String, Any?>>).map { Names.Match(it["id"] as String, it["by"] as String, it["word"] as String) }
            Harness.equal(c["name"] as String, Names.match(c["text"] as String, contacts), expect)
            val shared = c["shared"] as List<String>?
            if (shared != null) Harness.equal("   ...and the shared first names", Names.sharedFirstNames(contacts), shared)
            if (expect.isEmpty()) nothing++ else found++
        }
        Harness.check("both kinds of case ran (${cases.size})", found >= 10 && nothing >= 10)

        Harness.suite("names: bounds and determinism")
        val priya = listOf(Names.Contact("1", "Priya Shah"))
        Harness.equal("a name inside the first million characters is read", Names.match("${"a ".repeat(499_990)} Priya", priya).size, 1)
        Harness.equal("one past it is not", Names.match("${"a ".repeat(500_001)}Priya", priya), emptyList<Names.Match>())
        val two = listOf(Names.Contact("1", "Priya Shah"), Names.Contact("2", "Anil"))
        Harness.equal("deterministic", Names.match("Anil and Priya", two), Names.match("Anil and Priya", two))
    }
}
