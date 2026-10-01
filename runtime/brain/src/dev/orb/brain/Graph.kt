package dev.orb.brain

/** What a node is, judged from the events alone. */
object NodeKind {
    const val OBSERVATION = "observation"
    const val DEVICE_EVENT = "device-event"
    const val OTHER = "other"
}

/**
 * One event as a node. No field carries what an Observation's `data` says, nor anything from inside a
 * sealed attachment: identity, kind, clocks, lineage and an Observation's source / confidence / attachment
 * *identities* only.
 *
 * [causes] `null` is *cannot say* (the line carries no readable lineage); an empty list is *built on nothing*.
 */
class GraphNode(
    val id: String, val kind: String, val type: String, val lane: String, val device: String,
    val hlcPhysical: Long, val hlcCounter: Long, val recordedAt: Long, val causes: List<String>?,
    val source: String?, val confidencePercent: Long?, val attachments: List<String>?,
)

/**
 * An answer, and how far to trust it. [closed] means nothing needed was missing or unreadable within what is
 * held; **a closed-false answer is a lower bound**. [unresolved] names what stopped it — ids, or `line:N` for a
 * journal line that could not be read at all.
 */
class Answer<T>(val value: T, val closed: Boolean, val unresolved: List<String>, val scope: Int)

/** An Observation placed by **when the thing happened**; [occurredAtKnown] is false when it is only when it was written. */
class Occurrence(val node: GraphNode, val occurredAt: Long, val occurredAtKnown: Boolean)

/**
 * The Evidence Graph on the phone — the Kotlin twin of `@orb/evidence` (`runtime/evidence`), held to it by
 * `tests/vectors/graph.json`, which TypeScript computes. A typed view over lineage, **never stored**: build
 * it from the journal's lines, ask, drop it. Pure — it reads only what it is handed.
 *
 * Lineage is the journal's own: the walks below are `lineage.ts`'s, step for step (BFS, a visited set so a
 * cycle cannot hang it, an unheld cause *named* rather than skipped), because there must be one meaning of
 * "built on" and two implementations are held to it by vectors, not by hope.
 */
class EvidenceGraph internal constructor(
    private val all: List<GraphNode>,
    private val unreadableObservations: Set<String>,
    /** Journal lines that could not be read. Any makes every answer a lower bound and is named in it. */
    val unreadableLines: List<Int>,
) {
    private val byId = LinkedHashMap<String, GraphNode>()
    private val dependents = HashMap<String, MutableList<String>>()
    private val unreadableMarks = unreadableLines.map { "line:$it" }

    init {
        for (n in all) byId[n.id] = n
        for (n in all) for (cause in n.causes ?: emptyList()) dependents.getOrPut(cause) { ArrayList() }.add(n.id)
    }

    fun node(id: String): GraphNode? = byId[id]
    fun nodes(): List<GraphNode> = all.map { byId[it.id]!! }

    private fun typed(ids: List<String>): List<GraphNode> = ids.filter { byId.containsKey(it) }.map { byId[it]!! }

    private class Walk(val ids: List<String>, val unresolved: List<String>)

    /** `lineage.ts`'s walk: BFS, visited set, unheld causes named, opaque events named. */
    private fun walk(roots: List<String>, step: (String) -> List<String>, opaque: (String) -> Boolean): Walk {
        val seen = HashSet<String>(roots)
        val reached = ArrayList<String>()
        val unresolved = LinkedHashSet<String>()
        val queue = ArrayDeque(roots)
        for (root in roots) if (!byId.containsKey(root)) unresolved.add(root)
        while (queue.isNotEmpty()) {
            val id = queue.removeFirst()
            if (opaque(id)) unresolved.add(id)
            for (next in step(id)) {
                if (!byId.containsKey(next)) { unresolved.add(next); continue }
                if (seen.contains(next)) continue
                seen.add(next)
                reached.add(next)
                queue.addLast(next)
            }
        }
        return Walk(reached, unresolved.toList())
    }

    private fun <T> answer(value: T, unresolved: List<String>): Answer<T> {
        val all = unresolved + unreadableMarks
        return Answer(value, all.isEmpty(), all, this.all.size)
    }

    /** What this event rests on, nearest first. */
    fun provenance(id: String): Answer<List<GraphNode>> {
        val w = walk(listOf(id), { byId[it]?.causes ?: emptyList() }, { byId[it]?.causes == null })
        return answer(typed(w.ids), w.unresolved)
    }

    /** A forward answer is complete only if every event could say what it cites; one that cannot is named. */
    private fun <T> forward(value: T, root: String, walked: Walk?): Answer<T> {
        val cannotSay = all.filter { it.causes == null }.map { it.id }
        val names = LinkedHashSet<String>()
        if (!byId.containsKey(root)) names.add(root)
        walked?.unresolved?.let { names.addAll(it) }
        names.addAll(cannotSay)
        return answer(value, names.sorted())
    }

    /** The Observations that cite this event. */
    fun observationsOf(id: String): Answer<List<GraphNode>> {
        val observations = typed(dependents[id] ?: emptyList()).filter { it.kind == NodeKind.OBSERVATION }
        return forward(observations, id, null)
    }

    /** Everything built on this event, directly or through any chain. */
    fun dependentsOf(id: String): Answer<List<GraphNode>> {
        val w = walk(listOf(id), { dependents[it] ?: emptyList() }, { false })
        return forward(typed(w.ids), id, w)
    }

    private fun occurrence(node: GraphNode): Occurrence {
        val held = (node.causes ?: emptyList()).mapNotNull { byId[it] }
        if (held.isEmpty()) return Occurrence(node, node.recordedAt, false)
        return Occurrence(node, held.minOf { it.recordedAt }, true)
    }

    private fun withUnreadable(): List<String> = unreadableObservations.sorted()

    /** Observations by sensor — the name alone, or that name at an install — by when they happened. [from]/[to] inclusive. */
    fun fromSource(sensor: String, from: Long? = null, to: Long? = null): Answer<List<Occurrence>> {
        val found = ArrayList<Occurrence>()
        for (node in byId.values) {
            val source = node.source
            if (node.kind != NodeKind.OBSERVATION || source == null) continue
            if (!sourceMatches(source, sensor)) continue
            val o = occurrence(node)
            if (from != null && o.occurredAt < from) continue
            if (to != null && o.occurredAt > to) continue
            found.add(o)
        }
        found.sortWith(Comparator { a, b ->
            if (a.occurredAt != b.occurredAt) a.occurredAt.compareTo(b.occurredAt) else a.node.id.compareTo(b.node.id)
        })
        return answer(found, withUnreadable())
    }

    /** Observations that hold this sealed content, by identity. */
    fun holding(identity: String): Answer<List<GraphNode>> =
        answer(byId.values.filter { it.attachments?.contains(identity) == true }, withUnreadable())

    companion object {
        /** The same name, or that name at an install — and not a sensor that merely starts the same. */
        @JvmStatic
        fun sourceMatches(source: String, sensor: String): Boolean = source == sensor || source.startsWith("$sensor@")
    }
}

/** Builds the graph from the journal's lines. A line that cannot be read is *named*, never skipped silently. */
object Evidence {
    @JvmStatic
    @Suppress("UNCHECKED_CAST")
    fun build(lines: List<String>): EvidenceGraph {
        val nodes = ArrayList<GraphNode>()
        val unreadableLines = ArrayList<Int>()
        val unreadableObservations = LinkedHashSet<String>()

        // First pass: parse, and learn which events some Observation cites.
        val parsed = ArrayList<Pair<Int, Line>>()
        lines.forEachIndexed { i, text ->
            if (text.isEmpty()) return@forEachIndexed
            val p = Lines.read(text)
            if (p == null) unreadableLines.add(i + 1) else parsed.add(Pair(i, p))
        }
        val observed = HashSet<String>()
        for ((_, p) in parsed) if (p.type == Observer.OBSERVATION_TYPE) observed.addAll(p.causes ?: emptyList())

        for ((lineIndex, p) in parsed) {
            val e = p.event
            val id = e["id"] as? String
            val lane = e["lane"] as? String
            val device = e["device"] as? String
            val hlc = e["hlc"] as? Map<String, Any?>
            val wall = e["wallClock"] as? Long
            val physical = hlc?.get("physical") as? Long
            val counter = hlc?.get("counter") as? Long
            if (id == null || lane == null || device == null || wall == null || physical == null || counter == null) {
                // An event missing what an envelope must carry is not an event this reader can place.
                unreadableLines.add(lineIndex + 1)
                continue
            }
            val kind = if (p.type == Observer.OBSERVATION_TYPE) NodeKind.OBSERVATION
                else if (id in observed) NodeKind.DEVICE_EVENT else NodeKind.OTHER
            var source: String? = null
            var confidence: Long? = null
            var attachments: List<String>? = null
            if (kind == NodeKind.OBSERVATION) {
                val body = p.payload as? Map<String, Any?>
                if (!p.hasPayload || body == null) {
                    unreadableObservations.add(id)
                } else {
                    source = body["source"] as? String
                    confidence = body["confidencePercent"] as? Long
                    attachments = (body["attachments"] as? List<Any?>)?.filterIsInstance<String>()
                }
            }
            nodes.add(GraphNode(id, kind, p.type, lane, device, physical, counter, wall, p.causes, source, confidence, attachments))
        }
        return EvidenceGraph(nodes, unreadableObservations, unreadableLines.sorted())
    }
}
