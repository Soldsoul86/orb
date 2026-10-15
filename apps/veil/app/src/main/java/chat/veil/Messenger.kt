package chat.veil

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.security.SecureRandom
import java.util.UUID

const val MAX_MEDIA = 5 * 1024 * 1024
private const val WEEK = 7 * 86400_000L
fun now() = System.currentTimeMillis()
fun JSONArray.objects(): List<JSONObject> = (0 until length()).map { getJSONObject(it) }

data class ChatMessage(val id: String, val mine: Boolean, val kind: String, val mode: Mode,
    val text: String, val mime: String, val expires: Long, val viewMs: Long, val deadline: Long,
    val watermark: String, val status: String)
data class Snapshot(val ready: Boolean, val paired: Boolean, val verified: Boolean,
    val localFingerprint: String, val peerFingerprint: String, val messages: List<ChatMessage>, val pending: Int)

/** Calls must be serialized by the controller. Every operation reloads its committed snapshot. */
class Messenger(context: Context) {
    private val vault = Vault(context)
    private fun load(): JSONObject = vault.read()
    private fun secret(): String = ByteArray(32).also { SecureRandom().nextBytes(it) }.b64().trimEnd('=').replace('+', '-').replace('/', '_')
    fun setup(url: String) {
        val s = load(); require(!s.has("box"))
        val relay = RelayClient(url)
        if (!s.has("identity")) SignalSession.initialize(s)
        val reader = secret(); val writer = secret()
        val response = relay.request("POST", "/v1/boxes", data = JSONObject().put("reader", reader).put("writer", writer))
        s.put("relay", relay.base).put("box", response.getString("id"))
            .put("reader", reader).put("writer", writer).put("inviteExpires", now()+86400_000L)
            .put("messages", JSONArray()).put("outbox", JSONArray()).put("seen", JSONObject())
        vault.write(s)
    }
    fun invitation(): String {
        val s = load(); require(!s.has("peer")) { "This installation is already paired" }
        require(now() < s.getLong("inviteExpires")) { "Invitation expired; reset app data and pair again" }
        return "veil1:" + JSONObject().put("v", 1).put("relay", s.getString("relay"))
            .put("box", s.getString("box")).put("writer", s.getString("writer"))
            .put("identity", s.getString("publicIdentity")).put("registration", s.getInt("registration"))
            .put("prekey", s.getString("prekeyPublic")).put("signed", s.getString("signedPublic"))
            .put("signature", s.getString("signature")).put("kyber", s.getString("kyberPublic"))
            .put("kyberSignature", s.getString("kyberSignature")).put("expires", s.getLong("inviteExpires"))
            .toString().toByteArray().b64()
    }
    fun pair(invitation: String) {
        val s = load(); require(s.has("box") && !s.has("peer"))
        require(invitation.startsWith("veil1:") && invitation.length < 8192)
        val peer = JSONObject(invitation.removePrefix("veil1:").trim().unb64().toString(Charsets.UTF_8))
        require(peer.getInt("v") == 1 && peer.getLong("expires") in (now()+1)..(now()+86400_000L)) { "Invitation expired or invalid" }
        require(peer.getString("relay") == s.getString("relay")) { "Use the same relay on both phones" }
        require(peer.getString("box").matches(Regex("[a-f0-9]{32}")))
        require(peer.getString("writer").matches(Regex("[A-Za-z0-9_-]{43}")))
        require(peer.getString("identity") != s.getString("publicIdentity")) { "Cannot pair with yourself" }
        require(peer.getString("identity").unb64().size == 33)
        s.put("peer", peer).put("verified", false)
        vault.write(s)
    }
    fun verify() { val s = load(); require(s.has("peer")); s.put("verified", true); vault.write(s) }
    private fun prune(s: JSONObject): Boolean {
        val oldMessages = s.optJSONArray("messages")?.length() ?: 0
        val oldOutbox = s.optJSONArray("outbox")?.length() ?: 0
        val oldSeen = s.optJSONObject("seen")?.length() ?: 0
        s.put("messages", JSONArray(s.optJSONArray("messages")?.objects()?.filter { it.getLong("expires") > now() } ?: emptyList<JSONObject>()))
        s.put("outbox", JSONArray(s.optJSONArray("outbox")?.objects()?.filter { it.getLong("expires") > now() } ?: emptyList<JSONObject>()))
        val seen = s.optJSONObject("seen") ?: JSONObject()
        seen.keys().asSequence().toList().filter { seen.getLong(it) <= now() }.forEach { seen.remove(it) }
        s.put("seen", seen)
        return oldMessages != s.getJSONArray("messages").length() || oldOutbox != s.getJSONArray("outbox").length() || oldSeen != seen.length()
    }
    fun snapshot(): Snapshot {
        val s = load()
        if (!s.has("box")) return Snapshot(false, false, false, "", "", emptyList(), 0)
        if (prune(s)) vault.write(s)
        val pending = s.getJSONArray("outbox").objects().map { it.getString("id") }.toSet()
        return Snapshot(true, s.has("peer"), s.optBoolean("verified"), fingerprint(s.getString("publicIdentity")),
            s.optJSONObject("peer")?.let { fingerprint(it.getString("identity")) } ?: "",
            s.getJSONArray("messages").objects().map { m -> ChatMessage(m.getString("id"), m.getBoolean("mine"), m.getString("kind"),
                Mode.valueOf(m.getString("mode")), m.optString("text"), m.optString("mime"), m.getLong("expires"), m.optLong("viewMs"),
                m.optLong("deadline"), m.getString("watermark"), if (m.getString("id") in pending) "Queued" else if (m.getBoolean("mine")) "Relayed" else "Received") }, pending.size)
    }
    fun send(text: String, media: ByteArray?, mime: String, mode: Mode, ttl: Long, viewMs: Long) {
        val s = load(); require(s.optBoolean("verified")) { "Compare identities first" }; prune(s)
        require(ttl in 60_000L..WEEK && viewMs in listOf(0L, 15_000L))
        require((media != null && media.size <= MAX_MEDIA && mime in listOf("image/jpeg", "image/png", "image/webp", "video/mp4")) ||
            (media == null && text.isNotBlank() && text.length <= 4000))
        require(s.getJSONArray("messages").length() < 80 && s.getJSONArray("outbox").length() < 20) { "Conversation is full; wait for expiration" }
        require(s.toString().length < 24*1024*1024) { "Local storage limit reached" }
        val id = UUID.randomUUID().toString().replace("-", "")
        val expires = now() + ttl
        val m = JSONObject().put("v", 1).put("id", id).put("kind", if (media == null) "text" else if (mime.startsWith("video/")) "video" else "photo")
            .put("mode", mode.name).put("text", if (media == null) text else "").put("mime", mime)
            .put("expires", expires).put("viewMs", viewMs).put("watermark", fingerprint(s.getJSONObject("peer").getString("identity")).take(12))
        media?.let { m.put("media", it.b64()) }
        val plain = m.toString().toByteArray()
        val ciphertext = try { SignalSession(s).encrypt(plain) } finally { plain.fill(0) }
        require(s.toString().length + m.toString().length + ciphertext.size*4L/3 < 24*1024*1024) { "Local storage limit reached" }
        s.getJSONArray("outbox").put(JSONObject().put("id", id).put("body", ciphertext.b64()).put("expires", expires))
        s.getJSONArray("messages").put(m.put("mine", true))
        // Ratchet advancement and exact ciphertext commit together BEFORE upload.
        vault.write(s)
    }
    fun sync() {
        var s = load(); if (!s.optBoolean("verified")) return
        if (prune(s)) vault.write(s)
        val relay = RelayClient(s.getString("relay")); val peer = s.getJSONObject("peer")
        for (m in s.getJSONArray("outbox").objects()) {
            // Relay accepts <= seven days; rounded down, expiration remains authoritative inside ciphertext.
            relay.request("PUT", "/v1/boxes/${peer.getString("box")}/messages/${m.getString("id")}", peer.getString("writer"),
                JSONObject().put("body", m.getString("body")).put("expires", m.getLong("expires") / 1000))
            s.getJSONArray("outbox").let { arr -> s.put("outbox", JSONArray(arr.objects().filter { it.getString("id") != m.getString("id") })) }
            vault.write(s)
        }
        val path = "/v1/boxes/${s.getString("box")}/messages"
        val incoming = relay.request("GET", path, s.getString("reader")).getJSONArray("messages")
        for (envelope in incoming.objects()) {
            val id = envelope.getString("id"); require(id.matches(Regex("[a-f0-9]{32}")))
            if (!s.getJSONObject("seen").has(id)) {
                require(s.toString().length < 24*1024*1024 && s.getJSONArray("messages").length() < 80) { "Local storage limit reached" }
                val bytes = envelope.getString("body").unb64(); require(bytes.size <= 8*1024*1024)
                val plain = SignalSession(s).decrypt(bytes)
                val m = try { JSONObject(plain.toString(Charsets.UTF_8)) } finally { plain.fill(0) }
                require(m.getInt("v") == 1 && m.getString("id") == id)
                require(m.getString("kind") in listOf("text", "photo", "video"))
                Mode.valueOf(m.getString("mode"))
                require(m.optString("text").length <= 4000 && m.optString("media").length <= 8*1024*1024)
                require(m.getLong("expires") <= now() + WEEK)
                require(m.optLong("viewMs") in listOf(0L, 15_000L))
                if (m.getString("kind") != "text") require(m.getString("mime") in listOf("image/jpeg", "image/png", "image/webp", "video/mp4"))
                // Receiver chooses its own label; the sender cannot impersonate another recipient in the overlay.
                m.put("watermark", fingerprint(s.getString("publicIdentity")).take(12)).put("mine", false)
                require(s.toString().length + m.toString().length < 24*1024*1024) { "Local storage limit reached" }
                if (m.getLong("expires") > now()) s.getJSONArray("messages").put(m)
                s.getJSONObject("seen").put(id, now()+WEEK)
                vault.write(s) // Durable message + ratchet + replay marker BEFORE acknowledgement.
            }
            relay.request("DELETE", "$path/$id", s.getString("reader"))
        }
    }
    fun open(id: String): Pair<ChatMessage, ByteArray> {
        val s = load(); prune(s)
        val m = s.getJSONArray("messages").objects().firstOrNull { it.getString("id") == id } ?: error("This message has expired")
        require(m.getString("kind") != "text")
        if (m.optLong("viewMs") > 0 && !m.has("deadline")) {
            m.put("deadline", minOf(m.getLong("expires"), now()+m.getLong("viewMs")))
            vault.write(s) // Budget begins at first opening and never resets on reopening.
        }
        require(m.optLong("deadline", Long.MAX_VALUE) > now()) { "Viewing time is over" }
        return snapshot().messages.first { it.id == id } to m.getString("media").unb64()
    }
}
