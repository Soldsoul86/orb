package dev.orb.brain

/**
 * One journal line, opened the way `@orb/journal` presents an event to a reader — **one reader for every
 * layer**, so the Observer and the graph cannot disagree about what a line says.
 *
 * - **v1** (what this phone writes): the type and `causes` are on the envelope, the payload is the payload.
 * - **v2 stored**: the payload is a wrapper `{causes, data, nonce, schema, type}`; the real type and lineage are
 *   inside it. Recognised by shape, as `isWrapped` does in TypeScript.
 * - **presented v2**, or any envelope whose payload is not a wrapper: read as v1.
 *
 * [causes] is `null` when the line states no lineage (*cannot say* — never *built on nothing*).
 */
internal class Line(
    val event: Map<String, Any?>,
    val type: String,
    val causes: List<String>?,
    val payload: Any?,
    val hasPayload: Boolean,
)

internal object Lines {
    @Suppress("UNCHECKED_CAST")
    private fun isWrapped(p: Any?): Boolean =
        p is Map<*, *> && p["nonce"] is String && p["causes"] is List<*> && p["schema"] is Map<*, *> &&
            p["type"] is String && p.containsKey("data")

    /** Null when the line cannot be read at all (not JSON, not an object, no type, malformed lineage). */
    @Suppress("UNCHECKED_CAST")
    fun read(text: String): Line? {
        val event = try { Json.parse(text) } catch (e: JsonError) { return null } as? Map<String, Any?> ?: return null
        val envelopeType = event["type"] as? String ?: return null
        val payload = event["payload"]
        if (isWrapped(payload)) {
            val inner = payload as Map<String, Any?>
            val causes = inner["causes"] as List<Any?>
            if (!causes.all { it is String }) return null
            return Line(event, inner["type"] as String, causes as List<String>, inner["data"], true)
        }
        val causes: List<String>? = when (val raw = event["causes"]) {
            null -> null
            is List<*> -> if (raw.all { it is String }) raw as List<String> else return null
            else -> return null
        }
        return Line(event, envelopeType, causes, payload, payload != null)
    }
}
