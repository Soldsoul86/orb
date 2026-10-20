package chat.veil

import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.util.concurrent.TimeUnit

class RelayClient(url: String) {
    val base: String
    init {
        val parsed = url.trim().toHttpUrl()
        require(parsed.isHttps && parsed.username.isEmpty() && parsed.password.isEmpty() && parsed.query == null && parsed.fragment == null && parsed.encodedPath == "/") { "Use an HTTPS origin, without a path" }
        base = parsed.toString().trimEnd('/')
    }
    companion object {
        // Reuse TLS connections and allow the hosted relay to wake from idle.
        // Keep a finite deadline and never follow a capability-bearing redirect.
        private val client = OkHttpClient.Builder().connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(60, TimeUnit.SECONDS).callTimeout(90, TimeUnit.SECONDS)
            .followRedirects(false).followSslRedirects(false).build()
    }
    fun request(method: String, path: String, token: String = "", data: JSONObject? = null): JSONObject {
        val body = if (method == "PUT" || method == "POST") (data ?: JSONObject()).toString().toRequestBody("application/json".toMediaType()) else null
        val req = Request.Builder().url(base + path).method(method, body)
        if (token.isNotEmpty()) req.header("Authorization", "Bearer $token")
        client.newCall(req.build()).execute().use { response ->
            if (!response.isSuccessful) throw RelayRejected(response.code)
            val source = response.body?.source() ?: error("Empty relay response")
            // Reject hostile responses before buffering an unlimited body.
            source.request(12L * 1024 * 1024 + 1)
            require(source.buffer.size <= 12L * 1024 * 1024) { "Relay response too large" }
            val bytes = source.readByteArray()
            return JSONObject(bytes.toString(Charsets.UTF_8))
        }
    }
}
