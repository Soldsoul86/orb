package chat.veil

import org.json.JSONObject
import java.net.URI
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

/** Presentation defaults; authorization remains in the existing signed policy/provider. */
object ContactExperience {
    const val DEFAULT_PROVIDER="https://veil-relay-soldsoul86.onrender.com"
    const val WEEK=7*86400L
    enum class Kind(val title:String,val detail:String) {
        TEMPORARY("Temporary","Share privately. Access ends automatically."),
        WORK("Work","Set when people can reach you."),
        PERSONAL("Personal","For people you trust.")
    }
    fun policy(kind:Kind,zone:String=ZoneId.systemDefault().id)=when(kind) {
        Kind.TEMPORARY -> PurposePolicy("Temporary contact",timezone=zone)
        Kind.WORK -> PurposePolicy("Work",timezone=zone,weekdays=(1..5).toList(),start=540,end=1080)
        Kind.PERSONAL -> PurposePolicy("Personal",timezone=zone)
    }
    fun accessSeconds(kind:Kind)=if(kind==Kind.TEMPORARY)WEEK else 30*86400L
    fun link(origin:String,token:String):String {
        require(token.matches(Regex("[A-Za-z0-9_-]{43}")))
        val u=URI(origin);require(u.scheme=="https" && u.host!=null && u.rawUserInfo==null && u.rawPath.isNullOrEmpty() && u.rawQuery==null && u.rawFragment==null)
        return "$origin/i#$token"
    }
    fun parse(value:String):Pair<String,String> {
        require(value.length<=2500)
        val u=URI(value.trim())
        require(u.scheme=="https" && u.host!=null && u.rawUserInfo==null && u.rawPath=="/i" && u.rawQuery==null)
        val token=u.rawFragment ?: error("Invitation is incomplete")
        require(token.matches(Regex("[A-Za-z0-9_-]{43}")))
        val origin="https://${u.rawAuthority}";return origin to token
    }
    fun date(seconds:Long,zone:ZoneId=ZoneId.systemDefault()):String = DateTimeFormatter.ofPattern("d MMM, HH:mm z",java.util.Locale.getDefault()).format(Instant.ofEpochSecond(seconds).atZone(zone))
    fun summary(p:PurposePolicy,accessSeconds:Long):String {
        val days=accessSeconds/86400
        return "Approval required · Text messages · Access lasts $days days from acceptance"
    }
    fun status(c:JSONObject,now:Long=System.currentTimeMillis()/1000):String = when {
        c.optLong("access_expires") in 1..now -> "Access ended"
        c.optBoolean("pending") -> "Waiting to send — not delivered"
        c.optString("status")=="PENDING" -> "Waiting for acceptance"
        c.optString("status")=="RESERVED" -> "Request not sent yet"
        c.optString("status")=="APPROVED" -> "Accepted"
        c.optString("status")=="REVOKED" -> "Access ended"
        c.optString("status")=="REJECTED" -> "Request declined"
        c.optString("status")=="EXPIRED" -> "Expired"
        else -> "Unavailable"
    }
}
