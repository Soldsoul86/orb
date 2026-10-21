package org.portableidentity.core

import org.json.JSONObject
import org.junit.Test
import org.junit.Assert.*
import java.io.File

/** Only public, disposable signature material leaves this JVM. NOT a Signal interoperability proof. */
class GuestPublicFixtureTest {
    @Test fun exportPublicStateForBrowserVerification() {
        val controller=IdentityCore.key();val device=IdentityCore.key()
        val id=IdentityCore.id(controller);val origin="https://guest.example"
        val payload=JSONObject().put("v",1).put("id",id).put("device",IdentityCore.publicKey(device))
            .put("revision",1).put("issued",1000).put("epoch","a".repeat(32)).put("route",origin)
            .put("policy",JSONObject().put("display_name","Home repairs").put("discovery_mode","UNLISTED"))
        val token=IdentityCore.sign(payload,controller,IdentityCore.STATE)
        assertEquals(id,IdentityCore.verifyState(token,id).getString("id"))
        System.getenv("VEIL_PUBLIC_FIXTURE")?.let { path ->
            File(path).writeText(JSONObject().put("id",id).put("origin",origin).put("state",token).toString())
        }
    }
}
