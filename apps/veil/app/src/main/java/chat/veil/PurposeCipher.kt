package chat.veil

import org.json.JSONObject

/** Context is inside Signal's authenticated payload, not just relay routing metadata. */
object PurposeCipher {
    fun bundle(s: JSONObject) = JSONObject().put("identity",s.getString("publicIdentity"))
        .put("registration",s.getInt("registration")).put("prekey",s.getString("prekeyPublic"))
        .put("signed",s.getString("signedPublic")).put("signature",s.getString("signature"))
        .put("kyber",s.getString("kyberPublic")).put("kyberSignature",s.getString("kyberSignature"))
    fun seal(s: JSONObject, message: JSONObject): ByteArray {
        validate(s,message)
        val bytes=message.toString().toByteArray()
        return try { SignalSession(s).encrypt(bytes) } finally { bytes.fill(0) }
    }
    fun open(s: JSONObject, bytes: ByteArray): JSONObject {
        val plain=SignalSession(s).decrypt(bytes)
        return try { JSONObject(plain.toString(Charsets.UTF_8)).also { validate(s,it) } } finally { plain.fill(0) }
    }
    private fun validate(s: JSONObject,m: JSONObject) {
        require(m.getInt("v")==1 && m.getString("facet")==s.getString("facet") && m.getString("grant")==s.getString("id"))
        require(m.getString("id").matches(Regex("[a-f0-9]{32}")) && m.getString("kind")=="text")
        require(m.getString("text").isNotBlank() && m.getString("text").length<=4000)
        require(m.getLong("expires")>0)
    }
}
