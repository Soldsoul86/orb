package chat.veil.matrix.interop

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import java.io.File
import java.util.UUID
import java.util.concurrent.TimeUnit
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request as HttpRequest
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Test
import org.junit.runner.RunWith
import org.matrix.rustcomponents.sdk.crypto.*
import org.portableidentity.core.IdentityCore as Identity
import uniffi.matrix_sdk_crypto.CollectStrategy
import uniffi.matrix_sdk_crypto.DecryptionSettings
import uniffi.matrix_sdk_crypto.LocalTrust
import uniffi.matrix_sdk_crypto.TrustRequirement

/** Real native SDK on an Android emulator. Never logs or exports private key material. */
@RunWith(AndroidJUnit4::class)
class InteropTest {
    private val http = OkHttpClient.Builder().callTimeout(45, TimeUnit.SECONDS).build()
    private val origin = "http://10.0.2.2:8765"
    private var token = ""
    private lateinit var machine: OlmMachine
    private val purposeKey = Identity.key()
    private val purposeId = Identity.id(purposeKey)
    private val context = InstrumentationRegistry.getInstrumentation().targetContext
    private val files get() = context.filesDir
    private fun now() = System.currentTimeMillis() / 1000
    private fun json(vararg pairs: Pair<String, Any>): JSONObject = JSONObject().also { obj -> pairs.forEach { obj.put(it.first, it.second) } }
    private fun sign(payload: JSONObject, type: String) = Identity.sign(payload, purposeKey, type)
    private fun publish(name: String, value: JSONObject) {
        val tmp = File(files, "$name.tmp")
        tmp.writeText(value.toString())
        check(tmp.renameTo(File(files, name)))
    }
    private fun request(path: String, method: String = "GET", body: JSONObject? = null): JSONObject {
        val b = HttpRequest.Builder().url(origin + path)
        if (token.isNotEmpty()) b.header("Authorization", "Bearer $token")
        b.method(method, body?.toString()?.toRequestBody("application/json".toMediaType()))
        http.newCall(b.build()).execute().use {
            check(it.isSuccessful) { "Matrix HTTP ${it.code} at ${path.substringBefore('?')}" }
            return JSONObject(it.body!!.string())
        }
    }
    private fun transmit(r: Request) {
        val id: String
        val kind: RequestType
        val response: JSONObject
        when (r) {
            is Request.KeysUpload -> {
                id = r.requestId; kind = RequestType.KEYS_UPLOAD
                val body = JSONObject(r.body)
                body.keys().asSequence().toList().filter { body.isNull(it) }.forEach(body::remove)
                response = request("/_matrix/client/v3/keys/upload", "POST", body)
            }
            is Request.KeysQuery -> {
                id = r.requestId; kind = RequestType.KEYS_QUERY
                val devices = JSONObject(); r.users.forEach { devices.put(it, JSONArray()) }
                response = request("/_matrix/client/v3/keys/query", "POST", json("device_keys" to devices))
            }
            is Request.KeysClaim -> {
                id = r.requestId; kind = RequestType.KEYS_CLAIM
                response = request("/_matrix/client/v3/keys/claim", "POST", json("one_time_keys" to JSONObject(r.oneTimeKeys)))
            }
            is Request.ToDevice -> {
                id = r.requestId; kind = RequestType.TO_DEVICE
                check(r.eventType == "m.room.encrypted")
                response = request("/_matrix/client/v3/sendToDevice/${r.eventType}/$id", "PUT", json("messages" to JSONObject(r.body)))
            }
            else -> error("Unexpected SDK request; no permissive fallback")
        }
        machine.markRequestAsSent(id, kind, response.toString())
    }
    private fun drain() { machine.outgoingRequests().forEach(::transmit) }
    private fun verifyCard(card: JSONObject, pin: String): JSONObject {
        check(card.getString("id") == pin)
        Identity.verifyState(card.getString("state"), pin)
        val binding = Identity.verify(card.getString("binding"), pin, "pi-matrix-binding+jws")
        check(binding.getInt("v") == 1 && binding.getString("iss") == pin)
        check(binding.getString("state_hash") == Identity.hash(card.getString("state").toByteArray()))
        return binding.getJSONObject("endpoint")
    }
    private fun verifyDevice(endpoint: JSONObject) {
        val user = endpoint.getString("user_id")
        val deviceId = endpoint.getString("device_id")
        val d = checkNotNull(machine.getDevice(user, deviceId, 0u))
        for (algorithm in listOf("curve25519", "ed25519")) {
            check((d.keys["$algorithm:$deviceId"] ?: d.keys[algorithm]) == endpoint.getString(algorithm)) { "Signed SDK device key mismatch" }
        }
        machine.setLocalTrust(user, deviceId, LocalTrust.VERIFIED)
    }

    @Test fun browserRequestAndroidApprovalAndReply() {
        val input = JSONObject(InstrumentationRegistry.getInstrumentation().context.assets.open("runtime.json").bufferedReader().readText())
        val account = input.getJSONObject("account")
        val guest = input.getJSONObject("guest")
        val guestPin = input.getString("guestPin") // Independent public fixture pin, supplied before provider contact.
        val endpoint = verifyCard(guest, guestPin)
        // Negative identity binding is checked using the same production identity-core verifier.
        check(runCatching { verifyCard(guest, purposeId) }.isFailure)
        val login = request("/_matrix/client/v3/login", "POST", json("type" to "m.login.password",
            "identifier" to json("type" to "m.id.user", "user" to account.getString("username")),
            "password" to account.getString("password"), "device_id" to account.getString("device")))
        token = login.getString("access_token")
        machine = OlmMachine(login.getString("user_id"), login.getString("device_id"), File(files, "crypto").absolutePath, Identity.secret())
        try {
            drain()
            machine.updateTrackedUsers(listOf(endpoint.getString("user_id")))
            drain()
            verifyDevice(endpoint)
            val p = json("display_name" to "Home Repairs", "description" to "", "discovery_mode" to "UNLISTED",
                "contact_request_mode" to "REQUEST_APPROVAL", "allowed_content_types" to JSONArray(listOf("text")),
                "schedule" to json("timezone" to "UTC", "weekdays" to JSONArray((1..7).toList()), "start" to 0, "end" to 1440),
                "outside_hours_behavior" to "REJECT", "first_contact_message_limit" to 1, "inactivity_days" to 7,
                "expires_at" to (now()+3600), "notification_behavior" to "SILENT_IN_APP", "status" to "ACTIVE", "policy_version" to 1)
            val state = sign(json("v" to 1, "id" to purposeId, "device" to Identity.publicKey(purposeKey), "revision" to 1,
                "issued" to now(), "epoch" to UUID.randomUUID().toString().replace("-", ""), "route" to "https://veil.test", "policy" to p), "pi-state+jws")
            val ownEndpoint = JSONObject(machine.identityKeys()).put("user_id", login.getString("user_id")).put("device_id", login.getString("device_id"))
            val binding = sign(json("v" to 1, "iss" to purposeId, "state_hash" to Identity.hash(state.toByteArray()), "endpoint" to ownEndpoint), "pi-matrix-binding+jws")
            val own = json("id" to purposeId, "state" to state, "binding" to binding)
            publish("public.json", own) // Public identity only, obtained by harness over adb rather than provider.
            val invitation = UUID.randomUUID().toString().replace("-", "") + UUID.randomUUID().toString().replace("-", "")
            val policy = json("v" to 1, "iss" to purposeId, "invitation" to invitation, "revision" to 1,
                "issued" to now(), "expires" to (now()+900), "status" to "pending", "owner" to own, "guest" to guest)
            fun submitPolicy() { request("/veil/policy", "POST", json("owner" to purposeId, "token" to sign(policy, "pi-matrix-policy+jws"))) }
            submitPolicy()
            publish("ready.json", json("invitation" to invitation))
            var since = ""
            var decrypted = false
            val deadline = now()+180
            while (!decrypted && now()<deadline) {
                val sync = request("/_matrix/client/v3/sync?timeout=1000" + if (since.isEmpty()) "" else "&since=$since")
                since = sync.getString("next_batch")
                val events = sync.optJSONObject("to_device") ?: json("events" to JSONArray())
                val raw = events.getJSONArray("events")
                // No plaintext or unknown-device path is passed to our application decryptor.
                for (i in 0 until raw.length()) {
                    val e = raw.getJSONObject(i)
                    check(e.getString("type") == "m.room.encrypted" && e.getString("sender") == endpoint.getString("user_id"))
                    check(e.getJSONObject("content").getString("sender_key") == endpoint.getString("curve25519"))
                }
                val lists = sync.optJSONObject("device_lists") ?: JSONObject()
                fun strings(a: JSONArray?) = if (a == null) emptyList() else (0 until a.length()).map { a.getString(it) }
                val counts = sync.optJSONObject("device_one_time_keys_count") ?: JSONObject()
                val result = machine.receiveSyncChanges(events.toString(), DeviceLists(strings(lists.optJSONArray("changed")), strings(lists.optJSONArray("left"))),
                    counts.keys().asSequence().associateWith { counts.getInt(it) }, strings(sync.optJSONArray("device_unused_fallback_key_types")), since,
                    DecryptionSettings(TrustRequirement.UNTRUSTED))
                // TrustRequirement applies to Megolm cross-signing. This is Olm with an exact
                // signed Curve25519/Ed25519 pin plus an inner purpose-controller signature.
                drain()
                verifyDevice(endpoint)
                for (encoded in result.toDeviceEvents) {
                    val event = JSONObject(encoded)
                    check(event.getString("type") == "chat.veil.interop" && event.getString("sender") == endpoint.getString("user_id"))
                    val m = Identity.verify(event.getJSONObject("content").getString("jws"), guestPin, "pi-matrix-message+jws")
                    check(m.getInt("v") == 1 && m.getString("iss") == guestPin && m.getString("recipient") == purposeId)
                    check(m.getString("invitation") == invitation && m.getLong("expires") > now())
                    check(m.getString("text") == "VEIL_REQUEST_CANARY_8a19")
                    check(!decrypted)
                    decrypted = true
                }
            }
            check(decrypted) { "Native SDK request decryption timed out" }
            policy.put("revision", 2).put("status", "approved"); submitPolicy()
            machine.getMissingSessions(listOf(endpoint.getString("user_id")))?.let(::transmit)
            verifyDevice(endpoint)
            val reply = sign(json("v" to 1, "iss" to purposeId, "recipient" to guestPin, "invitation" to invitation,
                "id" to UUID.randomUUID().toString(), "expires" to (now()+120), "text" to "VEIL_REPLY_CANARY_53c2"), "pi-matrix-message+jws")
            val outgoing = checkNotNull(machine.createEncryptedToDeviceRequest(endpoint.getString("user_id"), endpoint.getString("device_id"),
                "chat.veil.interop", json("jws" to reply).toString(), CollectStrategy.ONLY_TRUSTED_DEVICES))
            transmit(outgoing)
            val ackDeadline = now()+120
            while (!File(files, "revoke").exists() && now()<ackDeadline) Thread.sleep(250)
            check(File(files, "revoke").exists()) { "Browser did not acknowledge encrypted reply" }
            policy.put("revision", 3).put("status", "revoked"); submitPolicy()
            publish("result.json", json("requestDecrypted" to true, "replyEncrypted" to true, "revoked" to true))
        } finally { machine.close() }
    }
}
