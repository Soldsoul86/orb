package dev.orb.brain

import java.io.File

object GraphTest {
    private fun nodeMap(n: GraphNode): Map<String, Any?> {
        val m = LinkedHashMap<String, Any?>()
        m["id"] = n.id; m["kind"] = n.kind; m["type"] = n.type; m["lane"] = n.lane; m["device"] = n.device
        m["hlc"] = mapOf("physical" to n.hlcPhysical, "counter" to n.hlcCounter)
        m["recordedAt"] = n.recordedAt
        if (n.causes != null) m["causes"] = n.causes
        if (n.source != null) m["source"] = n.source
        if (n.confidencePercent != null) m["confidencePercent"] = n.confidencePercent
        if (n.attachments != null) m["attachments"] = n.attachments
        return m
    }

    private fun <T> answer(a: Answer<T>, value: Any?) = mapOf("value" to value, "closed" to a.closed, "unresolved" to a.unresolved, "scope" to a.scope.toLong())

    private fun ids(nodes: List<GraphNode>) = nodes.map { it.id }

    @Suppress("UNCHECKED_CAST")
    fun run(root: File) {
        Harness.suite("held to @orb/evidence by the shared vectors")
        val vectors = Json.parse(File(root, "runtime/brain/tests/vectors/graph.json").readText()) as Map<String, Any?>
        var queries = 0
        var lowerBounds = 0
        for (s in vectors["scenarios"] as List<Map<String, Any?>>) {
            val name = s["name"] as String
            val g = Evidence.build(s["lines"] as List<String>)
            Harness.equal("$name: no line unreadable", g.unreadableLines.size, 0)
            Harness.equal("$name: the same nodes", g.nodes().map { nodeMap(it) }, s["nodes"])
            var wrong = 0
            for (q in s["queries"] as List<Map<String, Any?>>) {
                val actual: Map<String, Any?> = when (q["op"]) {
                    "provenance" -> g.provenance(q["id"] as String).let { answer(it, ids(it.value)) }
                    "observationsOf" -> g.observationsOf(q["id"] as String).let { answer(it, ids(it.value)) }
                    "dependentsOf" -> g.dependentsOf(q["id"] as String).let { answer(it, ids(it.value)) }
                    "fromSource" -> g.fromSource(q["sensor"] as String, q["from"] as Long?, q["to"] as Long?).let { a ->
                        answer(a, a.value.map { mapOf("id" to it.node.id, "occurredAt" to it.occurredAt, "occurredAtKnown" to it.occurredAtKnown) })
                    }
                    "holding" -> g.holding(q["identity"] as String).let { answer(it, ids(it.value)) }
                    else -> mapOf("unknown op" to q["op"])
                }
                queries++
                val expected = q["expected"] as Map<String, Any?>
                if (expected["closed"] == false) lowerBounds++
                if (actual != expected) {
                    wrong++
                    if (wrong <= 3) println("    FAIL   ${q["op"]} ${q["id"] ?: q["sensor"] ?: q["identity"]}\n           expected $expected\n           actual   $actual")
                }
            }
            Harness.equal("$name: every query answers as TypeScript does", wrong, 0)
        }
        Harness.check("a great many questions were asked ($queries)", queries > 400)
        Harness.check("including lower bounds that name what they missed ($lowerBounds)", lowerBounds > 20)

        Harness.suite("a line that cannot be read is named, never skipped")
        val good = Evidence.build((vectors["scenarios"] as List<Map<String, Any?>>)[0]["lines"] as List<String>)
        val lines = ((vectors["scenarios"] as List<Map<String, Any?>>)[0]["lines"] as List<String>).toMutableList()
        val id = lines[0].substringAfter("\"id\":\"").substringBefore('"')
        lines.add(2, "{not json")
        val damaged = Evidence.build(lines)
        Harness.equal("it is counted, by line number", damaged.unreadableLines, listOf(3))
        Harness.equal("so provenance of a held event is not closed", damaged.provenance(id).closed, false)
        Harness.check("and says which line", damaged.provenance(id).unresolved.contains("line:3"))
        Harness.check("and still says what it can", damaged.nodes().size == good.nodes().size)
        Harness.equal("a forward answer is a lower bound too", damaged.dependentsOf(id).closed, false)
        Harness.equal("a sensor query likewise", damaged.fromSource("orb.sensor.assist").closed, false)
        Harness.equal("without it every answer is closed again", good.dependentsOf(id).closed, true)
        lines[2] = "{\"id\":\"x\",\"type\":\"orb.shared\"}"
        Harness.equal("an event missing what an envelope must carry is unreadable too", Evidence.build(lines).unreadableLines, listOf(3))

        Harness.suite("it carries no content")
        val fields = GraphNode::class.java.declaredFields.map { it.name }.toSet()
        val allowed = setOf("id", "kind", "type", "lane", "device", "hlcPhysical", "hlcCounter", "recordedAt", "causes", "source", "confidencePercent", "attachments")
        Harness.equal("a node has only the allowed fields", fields, allowed)
        val secret = "{\"id\":\"A\",\"lane\":\"l\",\"device\":\"d\",\"hlc\":{\"physical\":1,\"counter\":0},\"wallClock\":1,\"type\":\"orb.observation\",\"causes\":[],\"payload\":{\"source\":\"orb.sensor.assist@d\",\"confidencePercent\":100,\"data\":{\"package\":\"com.chat\",\"text\":\"the secret words\"},\"attachments\":[\"sha256:00\"]}}"
        val node = Evidence.build(listOf(secret)).node("A")!!
        Harness.check("an Observation's data is nowhere in the node", !nodeMap(node).toString().contains("secret") && !nodeMap(node).toString().contains("com.chat"))
        Harness.equal("only its source, confidence and attachment identity", Triple(node.source, node.confidencePercent, node.attachments), Triple("orb.sensor.assist@d", 100L, listOf("sha256:00")))

        Harness.suite("sensors match by name, at any install")
        Harness.check("the same name", EvidenceGraph.sourceMatches("orb.sensor.assist", "orb.sensor.assist"))
        Harness.check("at an install", EvidenceGraph.sourceMatches("orb.sensor.assist@orb-1", "orb.sensor.assist"))
        Harness.check("not a sensor that merely starts the same", !EvidenceGraph.sourceMatches("orb.sensor.assist2@orb-1", "orb.sensor.assist"))
        Harness.check("not another install", !EvidenceGraph.sourceMatches("orb.sensor.assist@orb-1", "orb.sensor.assist@orb-2"))

        Harness.suite("a hostile history cannot hang it")
        val cyc = Evidence.build(listOf(
            "{\"id\":\"A\",\"lane\":\"l\",\"device\":\"d\",\"hlc\":{\"physical\":1,\"counter\":0},\"wallClock\":1,\"type\":\"t\",\"causes\":[\"B\"],\"payload\":{}}",
            "{\"id\":\"B\",\"lane\":\"l\",\"device\":\"d\",\"hlc\":{\"physical\":2,\"counter\":0},\"wallClock\":2,\"type\":\"t\",\"causes\":[\"A\"],\"payload\":{}}"))
        Harness.equal("provenance around a cycle ends", ids(cyc.provenance("A").value), listOf("B"))
        Harness.equal("so do dependents", ids(cyc.dependentsOf("A").value), listOf("B"))
        val self = Evidence.build(listOf("{\"id\":\"A\",\"lane\":\"l\",\"device\":\"d\",\"hlc\":{\"physical\":1,\"counter\":0},\"wallClock\":1,\"type\":\"t\",\"causes\":[\"A\"],\"payload\":{}}"))
        Harness.equal("and an event that cites itself", ids(self.provenance("A").value), emptyList<String>())
        Harness.equal("the empty history has nothing to be missing", Evidence.build(emptyList()).fromSource("x").closed, true)
    }
}
