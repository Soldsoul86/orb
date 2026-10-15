package chat.veil

import java.util.Base64
import org.json.JSONObject
import org.signal.libsignal.protocol.IdentityKey
import org.signal.libsignal.protocol.IdentityKeyPair
import org.signal.libsignal.protocol.SessionBuilder
import org.signal.libsignal.protocol.SessionCipher
import org.signal.libsignal.protocol.SignalProtocolAddress
import org.signal.libsignal.protocol.ecc.ECKeyPair
import org.signal.libsignal.protocol.ecc.ECPublicKey
import org.signal.libsignal.protocol.kem.KEMKeyPair
import org.signal.libsignal.protocol.kem.KEMKeyType
import org.signal.libsignal.protocol.kem.KEMPublicKey
import org.signal.libsignal.protocol.state.KyberPreKeyRecord
import org.signal.libsignal.protocol.message.CiphertextMessage
import org.signal.libsignal.protocol.message.PreKeySignalMessage
import org.signal.libsignal.protocol.message.SignalMessage
import org.signal.libsignal.protocol.state.PreKeyBundle
import org.signal.libsignal.protocol.state.PreKeyRecord
import org.signal.libsignal.protocol.state.SessionRecord
import org.signal.libsignal.protocol.state.SignedPreKeyRecord
import org.signal.libsignal.protocol.state.impl.InMemorySignalProtocolStore
import java.security.MessageDigest
import java.security.SecureRandom

fun ByteArray.b64(): String = Base64.getEncoder().encodeToString(this)
fun String.unb64(): ByteArray = Base64.getDecoder().decode(this)
fun fingerprint(key: String): String = MessageDigest.getInstance("SHA-256").digest(key.unb64()).joinToString("") { "%02x".format(it) }

/** Signal's PQXDH / ratcheting sessions, never a locally designed key exchange. One peer/device. */
class SignalSession(private val state: JSONObject) {
    private val pair = IdentityKeyPair(state.getString("identity").unb64())
    private val store = object : InMemorySignalProtocolStore(pair, state.getInt("registration")) {
        override fun markKyberPreKeyUsed(kyberPreKeyId: Int, signedPreKeyId: Int, baseKey: ECPublicKey) {
            val used = state.optJSONArray("kyberUsed") ?: org.json.JSONArray()
            val encoded = baseKey.serialize().b64()
            require((0 until used.length()).none { used.getString(it) == encoded }) { "Reused prekey base" }
            require(used.length() < 32) { "Re-pair required" }
            super.markKyberPreKeyUsed(kyberPreKeyId, signedPreKeyId, baseKey)
            state.put("kyberUsed", used.put(encoded))
        }
    }
    private val peer = state.getJSONObject("peer")
    private fun address(key: String): SignalProtocolAddress {
        val hex = fingerprint(key).take(32)
        val uuid = "${hex.take(8)}-${hex.substring(8,12)}-${hex.substring(12,16)}-${hex.substring(16,20)}-${hex.substring(20)}"
        return SignalProtocolAddress(uuid, 1)
    }
    private val address = address(peer.getString("identity"))
    private val localAddress = address(state.getString("publicIdentity"))
    init {
        store.storeKyberPreKey(1, KyberPreKeyRecord(state.getString("kyber").unb64()))
        store.storeSignedPreKey(1, SignedPreKeyRecord(state.getString("signed").unb64()))
        if (state.has("prekey")) store.storePreKey(1, PreKeyRecord(state.getString("prekey").unb64()))
        // The peer identity is pinned only after an explicit comparison outside the relay.
        store.saveIdentity(address, IdentityKey(peer.getString("identity").unb64(), 0))
        if (state.has("session")) store.storeSession(address, SessionRecord(state.getString("session").unb64()))
    }
    private fun persist() {
        state.put("session", store.loadSession(address).serialize().b64())
        if (!store.containsPreKey(1)) state.remove("prekey")
    }
    fun encrypt(plaintext: ByteArray): ByteArray {
        if (!store.containsSession(address)) {
            val bundle = PreKeyBundle(peer.getInt("registration"), 1, 1,
                ECPublicKey(peer.getString("prekey").unb64()), 1,
                ECPublicKey(peer.getString("signed").unb64()),
                peer.getString("signature").unb64(), IdentityKey(peer.getString("identity").unb64(), 0),
                1, KEMPublicKey(peer.getString("kyber").unb64()), peer.getString("kyberSignature").unb64())
            SessionBuilder(store, address, localAddress).process(bundle)
        }
        val message = SessionCipher(store, localAddress, address).encrypt(plaintext)
        persist()
        return byteArrayOf(message.type.toByte()) + message.serialize()
    }
    fun decrypt(ciphertext: ByteArray): ByteArray {
        require(ciphertext.size > 1)
        val cipher = SessionCipher(store, localAddress, address)
        val body = ciphertext.copyOfRange(1, ciphertext.size)
        val plain = when (ciphertext[0].toInt()) {
            CiphertextMessage.PREKEY_TYPE -> cipher.decrypt(PreKeySignalMessage(body))
            CiphertextMessage.WHISPER_TYPE -> cipher.decrypt(SignalMessage(body))
            else -> error("Unsupported encrypted envelope")
        }
        persist()
        return plain
    }
    companion object {
        fun initialize(state: JSONObject) {
            val pair = IdentityKeyPair.generate()
            val prekey = ECKeyPair.generate()
            val signed = ECKeyPair.generate()
            val signature = pair.privateKey.calculateSignature(signed.publicKey.serialize())
            val kyber = KEMKeyPair.generate(KEMKeyType.KYBER_1024)
            val kyberSignature = pair.privateKey.calculateSignature(kyber.publicKey.serialize())
            state.put("kyber", KyberPreKeyRecord(1, System.currentTimeMillis(), kyber, kyberSignature).serialize().b64())
                .put("kyberPublic", kyber.publicKey.serialize().b64()).put("kyberSignature", kyberSignature.b64())
            state.put("identity", pair.serialize().b64())
                .put("publicIdentity", pair.publicKey.serialize().b64())
                .put("registration", SecureRandom().nextInt(16380) + 1)
                .put("prekey", PreKeyRecord(1, prekey).serialize().b64())
                .put("signed", SignedPreKeyRecord(1, System.currentTimeMillis(), signed, signature).serialize().b64())
                .put("prekeyPublic", prekey.publicKey.serialize().b64())
                .put("signedPublic", signed.publicKey.serialize().b64())
                .put("signature", signature.b64())
        }
    }
}
