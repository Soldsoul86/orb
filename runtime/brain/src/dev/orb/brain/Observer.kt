package dev.orb.brain

/** An event to append: its type, its payload, and the events it cites. Plain data; nothing is written here. */
class Draft(val type: String, val payload: Map<String, Any?>, val causes: List<String>)

/** What a pass found. [unreadable] > 0 means **nothing is planned** — see [Observer.plan]. */
class Plan(val drafts: List<Draft>, val unreadable: Int)

/**
 * Which Observations a lane is missing — pure, deterministic, and writing nothing.
 *
 * An Observation is the formal record that something occurred; for each device event Orb
 * translates (`orb.assist.captured`, `orb.shared`) there should be one, citing it in `causes`.
 * This finds the ones that are not there yet.
 *
 * **Idempotent by citation, not by a stored marker:** an event is *observed* when some Observation
 * in the lane cites it. Nothing is stored beside the journal, so there is no second record to drift
 * or to outlive an erase.
 *
 * **Cannot check is not fine.** If any line cannot be read, the pass plans nothing: an unreadable
 * line might be the Observation that already cites an event, and writing a second one would be a
 * duplicate of a record this pass could not see.
 */
object Observer {
    const val OBSERVATION_TYPE = "orb.observation"

    private class Line(val id: String, val device: String, val type: String, val causes: List<String>, val payload: Any?)

    /** One journal line, with the v2 envelope (real type and causes inside the payload) opened. Null if unreadable. */
    @Suppress("UNCHECKED_CAST")
    private fun read(text: String): Line? {
        val event = try { Json.parse(text) } catch (e: JsonError) { return null } as? Map<String, Any?> ?: return null
        val id = event["id"] as? String ?: return null
        val device = event["device"] as? String ?: return null
        val envelopeType = event["type"] as? String ?: return null
        val wrapped = (event["v"] as? Long) == 2L
        if (!wrapped) {
            val causes = event["causes"] as? List<Any?> ?: return null
            if (!causes.all { it is String }) return null
            return Line(id, device, envelopeType, causes as List<String>, event["payload"])
        }
        val inner = event["payload"] as? Map<String, Any?> ?: return null
        val type = inner["type"] as? String ?: return null
        val causes = inner["causes"] as? List<Any?> ?: return null
        if (!causes.all { it is String }) return null
        return Line(id, device, type, causes as List<String>, inner["data"])
    }

    @JvmStatic
    fun plan(lines: List<String>): Plan {
        val read = ArrayList<Line>(lines.size)
        var unreadable = 0
        for (text in lines) {
            if (text.isEmpty()) continue
            val line = read(text)
            if (line == null) unreadable++ else read.add(line)
        }
        if (unreadable > 0) return Plan(emptyList(), unreadable)

        val cited = HashSet<String>()
        for (line in read) if (line.type == OBSERVATION_TYPE) cited.addAll(line.causes)

        val drafts = ArrayList<Draft>()
        for (line in read) {
            val sensor = Translate.sensorFor(line.type) ?: continue
            if (line.id in cited) continue
            val translation = Translate.of(line.type, line.payload) ?: continue
            val payload = LinkedHashMap<String, Any?>()
            payload["source"] = Translate.source(sensor, line.device)
            payload["confidencePercent"] = Translate.CONFIDENCE_PERCENT
            payload["data"] = translation.data
            if (translation.attachments.isNotEmpty()) payload["attachments"] = translation.attachments
            drafts.add(Draft(OBSERVATION_TYPE, payload, listOf(line.id)))
        }
        return Plan(drafts, 0)
    }
}
