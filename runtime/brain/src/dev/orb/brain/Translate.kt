package dev.orb.brain

/**
 * A device event's clear payload, as the Observation's `data` — the Kotlin twin of
 * `packages/device-watch/src/assist.ts` and `share.ts`, held to them by `tests/vectors`.
 *
 * **Nothing here interprets.** A field of the wrong type is *left out, never coerced*; a missing
 * `because` is `"unknown"`; the attachment is carried **by identity or not at all**. The sealed
 * text is never reachable from here: the payload does not contain it.
 */
object Translate {
    const val ASSIST_TYPE = "orb.assist.captured"
    const val SHARED_TYPE = "orb.shared"
    const val ASSIST_SENSOR = "orb.sensor.assist"
    const val SHARE_SENSOR = "orb.sensor.share"
    const val CONFIDENCE_PERCENT = 100L

    /** A scheme-tagged identity: the only shape an Observation accepts as an attachment. */
    private val IDENTITY = Regex("^[a-z0-9]+:[0-9a-f]+$")

    class Translation(val data: Map<String, Any?>, val attachments: List<String>)

    /** Which sensor perceived an event of this type, or null when this event is not one Orb translates here. */
    fun sensorFor(type: String): String? = when (type) {
        ASSIST_TYPE -> ASSIST_SENSOR
        SHARED_TYPE -> SHARE_SENSOR
        else -> null
    }

    /** Every field the translation can carry, in the TypeScript lists' words. Used by the leak guard. */
    val ASSIST_FIELDS = listOf("because", "package", "textNodes", "textChars", "webUri", "resolveOutcome",
        "attachmentBytes", "versionCode", "passwordFields", "rekept")
    val SHARE_FIELDS = listOf("because", "shareReadable", "action", "mimeType", "referrer", "itemCount",
        "references", "resolved", "absenceReason", "resolveOutcome", "resolveDetail", "attachmentBytes", "textChars", "rekept")

    fun assist(payload: Any?): Translation? = from(payload, ASSIST_FIELDS)
    fun share(payload: Any?): Translation? = from(payload, SHARE_FIELDS)

    fun of(type: String, payload: Any?): Translation? = when (type) {
        ASSIST_TYPE -> assist(payload)
        SHARED_TYPE -> share(payload)
        else -> null
    }

    /** The source: the sensor, at the install that holds the lane. */
    fun source(sensor: String, device: String) = "$sensor@$device"

    @Suppress("UNCHECKED_CAST")
    private fun from(payload: Any?, fields: List<String>): Translation? {
        if (payload !is Map<*, *>) return null
        val flat = payload as Map<String, Any?>
        val data = LinkedHashMap<String, Any?>()
        data["because"] = (flat["because"] as? String) ?: "unknown"
        for (field in fields) {
            if (field == "because") continue
            val v = flat[field] ?: continue
            // Wrong type is left out. Long is the only number the reader produces, and it is always safe.
            when (field) {
                "package", "action", "mimeType", "referrer", "references", "absenceReason", "resolveOutcome", "resolveDetail" ->
                    if (v is String) data[field] = v
                "textNodes", "textChars", "attachmentBytes", "versionCode", "passwordFields", "itemCount" ->
                    if (v is Long) data[field] = v
                "webUri", "shareReadable", "resolved", "rekept" ->
                    if (v is Boolean) data[field] = v
            }
        }
        val identity = flat["attachment"] as? String
        val attachments = if (identity != null && IDENTITY.matches(identity)) listOf(identity) else emptyList()
        return Translation(data, attachments)
    }
}
