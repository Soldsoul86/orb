package dev.orb.brain

import java.io.File

/** The handle extractor, held to the cases a person wrote down (`runtime/entities/tests/handle-cases.ts`). */
object HandlesTest {
    @Suppress("UNCHECKED_CAST")
    fun run(root: File) {
        Harness.suite("handles: held to the hand-written cases")
        val vectors = Json.parse(File(root, "runtime/brain/tests/vectors/handles.json").readText()) as Map<String, Any?>
        val cases = vectors["cases"] as List<Map<String, Any?>>
        var found = 0
        var nothing = 0
        for (c in cases) {
            val expect = (c["expect"] as List<Map<String, Any?>>).map { Handles.Handle(it["kind"] as String, it["value"] as String) }
            Harness.equal(c["name"] as String, Handles.extract(c["text"] as String), expect)
            if (expect.isEmpty()) nothing++ else found++
        }
        Harness.check("both kinds of case ran (${cases.size})", found > 30 && nothing > 15)

        Harness.suite("handles: bounds and purity")
        val padding = "a ".repeat(499_990)
        Harness.equal("a number inside the first million characters is read", Handles.extract("$padding 9876543210").map { it.kind }, listOf("phone"))
        Harness.equal("one past it is not", Handles.extract("${"a ".repeat(500_001)}9876543210"), emptyList<Handles.Handle>())
        val numbers = (0 until 300).map { "98765" + (10_000 + it).toString().takeLast(5) }
        val many = Handles.extract(numbers.joinToString(" "))
        Harness.equal("at most 200 distinct handles", many.size, Handles.MAX_HANDLES)
        Harness.equal("the earliest ones", many.first().value, "+91" + numbers.first())
        Harness.equal("and no later", many.last().value, "+91" + numbers[199])
        val text = "call 9876543210, pay ravi@oksbi, ₹1,200 on 12/10/2026 at https://example.com"
        Harness.equal("deterministic", Handles.extract(text), Handles.extract(text))
        Harness.equal("five handles in that text", Handles.extract(text).size, 5)
        Harness.check("a card number appears nowhere in the answer", !Handles.extract("card 4111 1111 1111 1111 and 9876543210").toString().contains("4111"))
        Harness.equal("a non-breaking space ends a link as a space does", Handles.extract("https://example.com/a\u00a0call 9876543210").map { it.value }, listOf("example.com", "+919876543210"))
    }
}
