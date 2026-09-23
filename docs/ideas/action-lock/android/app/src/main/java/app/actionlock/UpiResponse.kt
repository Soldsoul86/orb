package app.actionlock

import android.content.Intent

/**
 * Reads the result a UPI app hands back. The NPCI linking spec returns a
 * "response" string (txnId=…&responseCode=…&Status=…); some apps put the
 * fields in separate extras instead, so both are accepted. Parsing of the
 * string itself happens in the page (src/upi.ts), which is unit-tested.
 */
object UpiResponse {
    private val FIELDS = listOf("txnId", "responseCode", "Status", "txnRef", "ApprovalRefNo")

    fun from(data: Intent?): String? {
        val extras = data?.extras ?: return null
        extras.getString("response")?.takeIf { it.isNotBlank() }?.let { return it }
        val parts = FIELDS.mapNotNull { key ->
            val value = extras.getString(key) ?: extras.getString(key.lowercase())
            value?.let { "$key=$it" }
        }
        return parts.takeIf { it.isNotEmpty() }?.joinToString("&")
    }
}
