package chat.veil

import org.signal.libsignal.protocol.IdentityKey
import org.signal.libsignal.protocol.fingerprint.NumericFingerprintGenerator

/**
 * Libsignal's symmetric 60-digit display fingerprint, version 2 / 5200 iterations.
 * Veil has no account/phone number: the serialized public identity key is also
 * the stable installation identifier. Both participants use this same mapping.
 * This is a display for manual comparison, not automatic identity verification.
 */
fun safetyNumber(localPublicIdentity: String, peerPublicIdentity: String): String {
    val local = localPublicIdentity.unb64()
    val peer = peerPublicIdentity.unb64()
    require(local.size == 33 && peer.size == 33)
    return NumericFingerprintGenerator(5200).createFor(
        2, local, IdentityKey(local, 0), peer, IdentityKey(peer, 0)
    ).displayableFingerprint.displayText.also {
        check(it.matches(Regex("[0-9]{60}")))
    }
}
