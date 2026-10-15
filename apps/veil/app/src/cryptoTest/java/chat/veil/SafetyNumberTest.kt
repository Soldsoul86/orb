package chat.veil

import org.junit.Assert.*
import org.junit.Test
import org.signal.libsignal.protocol.IdentityKey
import org.signal.libsignal.protocol.IdentityKeyPair
import org.signal.libsignal.protocol.fingerprint.NumericFingerprintGenerator

/** Runs with real libsignal JNI on both the JVM and Android. */
class SafetyNumberTest {
    private fun key() = IdentityKeyPair.generate().publicKey.serialize().b64()

    @Test fun bothParticipantsSeeAllSixtyDigitsAndIdentityChangesAreDetected() {
        val alice = key(); val bob = key(); val stranger = key()
        val number = safetyNumber(alice, bob)
        assertTrue(number.matches(Regex("[0-9]{60}")))
        assertEquals(number, safetyNumber(bob, alice))
        // Reload the public-key representation as after a restart.
        assertEquals(number, safetyNumber(alice.unb64().b64(), bob.unb64().b64()))
        assertNotEquals(number, safetyNumber(alice, stranger))
        assertNotEquals(number, safetyNumber(stranger, bob))
    }

    @Test fun malformedIdentityCannotProduceComparison() {
        assertTrue(runCatching { safetyNumber(ByteArray(32).b64(), key()) }.isFailure)
        assertTrue(runCatching { safetyNumber(key(), "not an identity") }.isFailure)
    }

    @Test fun upstreamNumericFingerprintVector() {
        // libsignal v0.105.0 NumericFingerprintGeneratorTest's published vector.
        // Veil uses public identity bytes as stable IDs, rather than phone numbers.
        fun hex(s: String) = s.chunked(2).map { it.toInt(16).toByte() }.toByteArray()
        val alice = IdentityKey(hex("0506863bc66d02b40d27b8d49ca7c09e9239236f9d7d25d6fcca5ce13c7064d868"), 0)
        val bob = IdentityKey(hex("05f781b6fb32fed9ba1cf2de978d4d5da28dc34046ae814402b5c0dbd96fda907b"), 0)
        val result = NumericFingerprintGenerator(5200).createFor(2,
            "+14152222222".toByteArray(), alice, "+14153333333".toByteArray(), bob)
        assertEquals("300354477692869396892869876765458257569162576843440918079131",
            result.displayableFingerprint.displayText)
    }
}
