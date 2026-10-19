package chat.veil

import org.junit.Assert.*
import org.junit.Test
import java.time.ZoneId
import org.json.JSONObject

class ContactExperienceTest {
    @Test fun linksAreOpaqueAndStrict() {
        val token="A".repeat(43);val link=ContactExperience.link("https://example.org",token)
        assertEquals("https://example.org/i#$token",link)
        assertEquals("https://example.org" to token,ContactExperience.parse(link))
        listOf("http://example.org/i#$token","https://user@example.org/i#$token","https://example.org/i?x=1#$token","https://example.org/p/$token","https://example.org/i#short","https://example.org/i#${token}%00").forEach {assertTrue(it,runCatching{ContactExperience.parse(it)}.isFailure)}
    }
    @Test fun temporaryNeverExpiresIdentityInsteadOfAccess() {
        val p=ContactExperience.policy(ContactExperience.Kind.TEMPORARY,"Pacific/Auckland")
        assertEquals(0L,p.expiresAt);assertEquals(DiscoveryMode.UNLISTED,p.discovery)
        assertEquals(RequestMode.REQUEST_APPROVAL,p.requests);assertEquals(7*86400L,ContactExperience.accessSeconds(ContactExperience.Kind.TEMPORARY))
    }
    @Test fun workUsesDeviceTimezoneAndDoesNotPromiseNotifications() {
        val p=ContactExperience.policy(ContactExperience.Kind.WORK)
        assertEquals(ZoneId.systemDefault().id,p.timezone);assertEquals((1..5).toList(),p.weekdays)
        assertEquals(540,p.start);assertEquals(1080,p.end);assertEquals("SILENT_IN_APP",p.json().getString("notification_behavior"))
    }
    @Test fun pendingIsNeverShownAsDelivered() {
        assertEquals("Waiting to send — not delivered",ContactExperience.status(JSONObject().put("status","APPROVED").put("pending",true)))
        assertEquals("Access ended",ContactExperience.status(JSONObject().put("status","APPROVED").put("access_expires",10),11))
    }
}
