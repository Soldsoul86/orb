package org.portableidentity.core

import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import java.io.File

class DiscoveryPublicationTest {
    private fun request()=JSONObject("""{"v":1,"visibility":"PUBLIC","profile":{"alias":"TEST Nimbus","purpose":"Android interface redesign","category":"DESIGN & CREATE","tags":["ui"]}}""")
    @Test fun canonicalProfileUsesExistingKeyAndSuite() {
        val r=DiscoveryPublication.request(request().toString());val key=IdentityCore.key();val id=IdentityCore.id(key);val now=System.currentTimeMillis()/1000
        val policy=JSONObject("""{"display_name":"TEST Nimbus","description":"Synthetic test fixture","discovery_mode":"PUBLIC_SEARCHABLE","contact_request_mode":"REQUEST_APPROVAL","allowed_content_types":["text"],"first_contact_message_limit":1,"schedule":{"timezone":"UTC","weekdays":[1,2,3,4,5],"start":540,"end":1080},"outside_hours_behavior":"REJECT","inactivity_days":30,"expires_at":0,"notification_behavior":"SILENT_IN_APP","status":"ACTIVE","policy_version":1}""")
        val state=IdentityCore.sign(JSONObject().put("v",1).put("id",id).put("device",IdentityCore.publicKey(IdentityCore.key())).put("revision",1).put("issued",now).put("epoch","0".repeat(32)).put("route","https://test-provider.example").put("policy",policy),key,IdentityCore.STATE)
        val body=JSONObject().put("v",1).put("controller",id).put("revision",1).put("created",now).put("issued",now).put("expires",now+86400).put("visibility","PUBLIC").put("consent",true).put("profile",r.getJSONObject("profile")).put("state",state)
        val token=DiscoveryPublication.sign(body,key)
        assertEquals(id,IdentityCore.verify(token,id,DiscoveryPublication.TYPE).getString("controller"))
        assertEquals(DiscoveryPublication.canonical(body),String(IdentityCore.decode(token.split('.')[1])))
        assertThrows(Exception::class.java){IdentityCore.verify(token,IdentityCore.id(IdentityCore.key()),DiscoveryPublication.TYPE)}
        System.getenv("VEIL_DISCOVERY_FIXTURE")?.let {File(it).writeText(JSONObject().put("publication",token).put("controller",id).toString())}
    }
    @Test fun onlyReviewedFieldsAndSupportedLinks() {
        val r=request();r.getJSONObject("profile").put("email","no@example.com")
        assertThrows(Exception::class.java){DiscoveryPublication.request(r.toString())}
        assertEquals("{\"a\":\"é\",\"b\":1}",DiscoveryPublication.canonical(JSONObject().put("b",1).put("a","é")))
        assertThrows(Exception::class.java){DiscoveryPublication.canonical(1.5)}
        assertThrows(Exception::class.java){DiscoveryPublication.request("""{"v":1,"visibility":"PRIVATE","profile":{"alias":"leak"}}""")}
    }
}
