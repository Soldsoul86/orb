package org.portableidentity.core
import org.json.JSONObject
import org.junit.Test
import org.junit.Assert.*

class IdentityCoreTest {
    @Test fun offlineIdentityProofAndAdversarialInputs() {
        val key=IdentityCore.key();val other=IdentityCore.key();val at=1000L
        val challenge=JSONObject().put("nonce",IdentityCore.secret()).put("aud","independent-verifier").put("expires",1060)
        val proof=IdentityCore.proveControl(key,challenge,at)
        assertEquals(IdentityCore.id(key),IdentityCore.verifyControl(proof,IdentityCore.id(key),challenge,at).getString("iss"))
        assertTrue(runCatching { IdentityCore.verifyControl(proof,IdentityCore.id(other),challenge,at) }.isFailure)
        assertTrue(runCatching { IdentityCore.verifyControl(proof,IdentityCore.id(key),challenge,1061) }.isFailure)
        challenge.put("nonce",IdentityCore.secret())
        assertTrue(runCatching { IdentityCore.verifyControl(proof,IdentityCore.id(key),challenge,at) }.isFailure)
        assertFalse(IdentityCore.publicKey(key).has("d"))
        assertNotEquals(IdentityCore.id(key),IdentityCore.id(other))
    }
    @Test fun standardJweRecoveryAndWrongKeyRefusal() {
        val key=IdentityCore.key();val secret=IdentityCore.secret()
        val backup=IdentityCore.exportIdentity(JSONObject().put("v",1).put("owner",key),secret)
        assertFalse(backup.contains(key.getString("d")))
        assertEquals(IdentityCore.id(key),IdentityCore.id(IdentityCore.importIdentity(backup,secret).getJSONObject("owner")))
        assertTrue(runCatching { IdentityCore.importIdentity(backup,IdentityCore.secret()) }.isFailure)
        assertTrue(runCatching { IdentityCore.importIdentity(backup,"password") }.isFailure)
        assertTrue(runCatching { IdentityCore.rotateController() }.isFailure)
    }
}
