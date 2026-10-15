package chat.veil

import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import java.security.SecureRandom

/** Uses the real native libsignal implementation. No fake cipher or transport assertions. */
class SignalIntegrationTest {
    private fun identities(): Pair<JSONObject, JSONObject> {
        val a = JSONObject(); val b = JSONObject()
        SignalSession.initialize(a); SignalSession.initialize(b)
        fun public(s: JSONObject) = JSONObject().put("identity", s.getString("publicIdentity"))
            .put("registration", s.getInt("registration")).put("prekey", s.getString("prekeyPublic"))
            .put("signed", s.getString("signedPublic")).put("signature", s.getString("signature"))
            .put("kyber", s.getString("kyberPublic")).put("kyberSignature", s.getString("kyberSignature"))
        a.put("peer", public(b)); b.put("peer", public(a)); return a to b
    }
    @Test fun textRoundTripAndRestart() {
        var (a, b) = identities()
        val ciphertext = SignalSession(a).encrypt("hello privately".toByteArray())
        assertFalse(ciphertext.toString(Charsets.ISO_8859_1).contains("hello privately"))
        a = JSONObject(a.toString()); b = JSONObject(b.toString())
        assertEquals("hello privately", SignalSession(b).decrypt(ciphertext).toString(Charsets.UTF_8))
        assertFalse(b.has("prekey"))
        val reply = SignalSession(b).encrypt("hello back".toByteArray())
        assertEquals("hello back", SignalSession(a).decrypt(reply).toString(Charsets.UTF_8))
        assertTrue(b.getJSONArray("kyberUsed").length() > 0)
    }
    @Test fun mediaPayloadAndOutOfOrderDelivery() {
        val (a,b) = identities()
        val first = SignalSession(a).encrypt("first".toByteArray())
        assertEquals("first", SignalSession(b).decrypt(first).toString(Charsets.UTF_8))
        val ack = SignalSession(b).encrypt("ack".toByteArray()); SignalSession(a).decrypt(ack)
        val photo = ByteArray(128*1024).also { SecureRandom().nextBytes(it) }
        val video = ByteArray(MAX_MEDIA).also { SecureRandom().nextBytes(it) }
        val c1 = SignalSession(a).encrypt(photo); val c2 = SignalSession(a).encrypt(video)
        assertArrayEquals(video, SignalSession(b).decrypt(c2))
        assertArrayEquals(photo, SignalSession(b).decrypt(c1))
        assertTrue(runCatching { SignalSession(b).decrypt(c1) }.isFailure)
    }
    @Test fun tamperingAndWrongIdentityFailClosed() {
        val (a,b) = identities()
        val original = SignalSession(a).encrypt("secret".toByteArray())
        val corrupt = original.copyOf(); corrupt[corrupt.lastIndex] = (corrupt.last().toInt() xor 1).toByte()
        val before = b.toString()
        assertTrue(runCatching { SignalSession(b).decrypt(corrupt) }.isFailure)
        // Reload last committed state after failed operations, as the Messenger does.
        val restored = JSONObject(before)
        assertEquals("secret", SignalSession(restored).decrypt(original).toString(Charsets.UTF_8))
        val (_, stranger) = identities()
        assertTrue(runCatching { SignalSession(stranger).decrypt(original) }.isFailure)
    }
    @Test fun simultaneousInitiation() {
        val (a,b) = identities()
        val one = SignalSession(a).encrypt("one".toByteArray())
        val two = SignalSession(b).encrypt("two".toByteArray())
        assertEquals("one", SignalSession(b).decrypt(one).toString(Charsets.UTF_8))
        assertEquals("two", SignalSession(a).decrypt(two).toString(Charsets.UTF_8))
        val three = SignalSession(a).encrypt("three".toByteArray())
        assertEquals("three", SignalSession(b).decrypt(three).toString(Charsets.UTF_8))
    }
}
