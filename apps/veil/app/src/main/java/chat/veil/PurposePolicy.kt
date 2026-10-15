package chat.veil

import org.json.JSONArray
import org.json.JSONObject
import java.time.ZoneId

enum class DiscoveryMode { UNLISTED, LINK_ONLY, PUBLIC_SEARCHABLE }
enum class RequestMode { DISABLED, REQUEST_APPROVAL, AUTO_ACCEPT_WITH_LIMITS }
enum class OutsideHours { REJECT, ACCEPT_AND_QUEUE }
enum class PurposeStatus { ACTIVE, PAUSED, REVOKED }

data class PurposePolicy(
    val displayName: String, val description: String = "",
    val discovery: DiscoveryMode = DiscoveryMode.UNLISTED,
    val requests: RequestMode = RequestMode.REQUEST_APPROVAL,
    val timezone: String = "Asia/Kolkata", val weekdays: List<Int> = (1..7).toList(),
    val start: Int = 0, val end: Int = 1440,
    val outside: OutsideHours = OutsideHours.ACCEPT_AND_QUEUE,
    val inactivityDays: Int = 30, val expiresAt: Long = 0,
    val status: PurposeStatus = PurposeStatus.ACTIVE, val version: Int = 1
) {
    fun validate(): PurposePolicy {
        require(displayName.isNotBlank() && displayName.length <= 60 && description.length <= 240)
        require(timezone in ZoneId.getAvailableZoneIds()) { "Choose an IANA timezone" }
        require(weekdays.isNotEmpty() && weekdays.distinct().size == weekdays.size && weekdays.all { it in 1..7 })
        require(start in 0..1439 && end in 1..1440 && start < end) { "End must follow start; overnight hours are not supported" }
        require(inactivityDays in 1..90 && expiresAt in 0..4102444800L && version in 1..1000000)
        return this
    }
    fun json(): JSONObject {
        validate()
        return JSONObject().put("display_name",displayName).put("description",description)
            .put("discovery_mode",discovery.name).put("contact_request_mode",requests.name)
            .put("allowed_content_types",JSONArray(listOf("text")))
            .put("schedule",JSONObject().put("timezone",timezone).put("weekdays",JSONArray(weekdays)).put("start",start).put("end",end))
            .put("outside_hours_behavior",outside.name).put("first_contact_message_limit",1)
            .put("inactivity_days",inactivityDays).put("expires_at",expiresAt)
            .put("notification_behavior","SILENT_IN_APP").put("status",status.name).put("policy_version",version)
    }
    fun summary(): String {
        fun hour(m: Int) = "%02d:%02d".format(java.util.Locale.ROOT,m/60,m%60)
        val days=if(weekdays==(1..7).toList()) "Every day" else if(weekdays==(1..5).toList()) "Monday–Friday" else weekdays.joinToString { listOf("Mon","Tue","Wed","Thu","Fri","Sat","Sun")[it-1] }
        return "${displayName}\n${discoveryLabel(discovery)} · text only\n$days, ${hour(start)}–${hour(end)} · $timezone\n"+
            (when(requests) { RequestMode.DISABLED -> "New requests disabled"; RequestMode.REQUEST_APPROVAL -> "One introduction, then your approval"; RequestMode.AUTO_ACCEPT_WITH_LIMITS -> "Automatically approve introductions, with rate limits" })+
            "\n"+(if(outside==OutsideHours.ACCEPT_AND_QUEUE) "Outside hours: queue until open" else "Outside hours: reject new messages")+
            "\nIntroductions may arrive any time; reveal only during hours.\nAccess expires after $inactivityDays inactive days. Silent in-app delivery."+
            (if(expiresAt>0) "\nPurpose expires ${java.time.Instant.ofEpochSecond(expiresAt)}." else "")
    }
    companion object {
        fun from(j: JSONObject): PurposePolicy {
            require(j.getJSONArray("allowed_content_types").toString()=="[\"text\"]")
            require(j.getInt("first_contact_message_limit")==1 && j.getString("notification_behavior")=="SILENT_IN_APP")
            val s=j.getJSONObject("schedule");val days=s.getJSONArray("weekdays")
            return PurposePolicy(j.getString("display_name"),j.getString("description"),DiscoveryMode.valueOf(j.getString("discovery_mode")),
                RequestMode.valueOf(j.getString("contact_request_mode")),s.getString("timezone"),(0 until days.length()).map { days.getInt(it) },
                s.getInt("start"),s.getInt("end"),OutsideHours.valueOf(j.getString("outside_hours_behavior")),j.getInt("inactivity_days"),
                j.getLong("expires_at"),PurposeStatus.valueOf(j.getString("status")),j.getInt("policy_version")).validate()
        }
        fun template(name: String, at: Long = System.currentTimeMillis()/1000): PurposePolicy = when(name) {
            "Professional" -> PurposePolicy("Work",weekdays=(1..5).toList(),start=540,end=1080,discovery=DiscoveryMode.LINK_ONLY)
            "Personal" -> PurposePolicy("Personal")
            "Temporary sale" -> PurposePolicy("Sale enquiry",discovery=DiscoveryMode.LINK_ONLY,expiresAt=at+7*86400)
            else -> error("Choose a supported template")
        }
        fun interpret(text: String): PurposePolicy {
            val normalized=text.trim().lowercase(java.util.Locale.ROOT).replace(Regex("\\s+")," ")
            // Deliberately exact grammar. No keyword-only inference that ignores negation/exceptions.
            require(normalized == "weekdays, 9-6 india time; intro allowed, further messages require approval; text only.") {
                "That instruction is not fully supported. Use the form and confirm every rule. Files, holidays and overnight hours are not available yet."
            }
            return template("Professional")
        }
        fun discoveryLabel(d: DiscoveryMode) = when(d) { DiscoveryMode.UNLISTED -> "Private invite only"; DiscoveryMode.LINK_ONLY -> "Anyone with the link"; DiscoveryMode.PUBLIC_SEARCHABLE -> "Public directory" }
    }
}
