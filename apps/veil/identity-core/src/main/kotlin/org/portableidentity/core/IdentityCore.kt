package org.portableidentity.core

import com.nimbusds.jose.*
import com.nimbusds.jose.crypto.*
import com.nimbusds.jose.jwk.ECKey
import com.nimbusds.jose.jwk.Curve
import com.nimbusds.jose.jwk.gen.ECKeyGenerator
import org.json.JSONObject
import java.security.MessageDigest
import java.security.SecureRandom
import java.util.Base64

/** Provider-neutral RFC 9278 key identifiers and JOSE. No network or Android dependency. */
object IdentityCore {
    const val PREFIX = "urn:ietf:params:oauth:jwk-thumbprint:sha-256:"
    const val STATE = "pi-state+jws"
    const val PROOF = "pi-proof+jws"
    const val GRANT = "pi-grant+jws"
    const val CHANNEL = "pi-channel+jws"
    const val BACKUP = "pi-backup+jwe"
    private val random = SecureRandom()
    fun encode(bytes: ByteArray): String = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes)
    fun decode(value: String): ByteArray {
        require(value.matches(Regex("[A-Za-z0-9_-]+")))
        return Base64.getUrlDecoder().decode(value).also { require(encode(it)==value) }
    }
    fun secret(): String = encode(ByteArray(32).also(random::nextBytes))
    fun hash(bytes: ByteArray): String = encode(MessageDigest.getInstance("SHA-256").digest(bytes))
    fun key(): JSONObject = JSONObject(ECKeyGenerator(Curve.P_256).generate().toJSONString())
    fun publicKey(key: JSONObject): JSONObject = JSONObject(ECKey.parse(key.toString()).toPublicJWK().toJSONString())
    fun id(key: JSONObject): String {
        val k=ECKey.parse(key.toString());require(k.curve==Curve.P_256)
        return PREFIX+k.computeThumbprint().toString()
    }
    fun validatePublic(key: JSONObject): JSONObject {
        require(key.keys().asSequence().toSet()==setOf("kty","crv","x","y"))
        val k=ECKey.parse(key.toString());require(!k.isPrivate && k.curve==Curve.P_256)
        require(k.x.decode().size==32 && k.y.decode().size==32)
        k.toECPublicKey() // curve/point validation by the JOSE/JCA implementation
        return key
    }
    fun sign(payload: JSONObject, privateKey: JSONObject, type: String): String {
        require(payload.toString().length<=128*1024)
        val key=ECKey.parse(privateKey.toString());require(key.isPrivate && key.curve==Curve.P_256)
        val jws=JWSObject(JWSHeader.Builder(JWSAlgorithm.ES256).type(JOSEObjectType(type)).jwk(key.toPublicJWK()).build(),Payload(payload.toString()))
        jws.sign(ECDSASigner(key));return jws.serialize()
    }
    fun verify(token: String, expectedId: String, type: String): JSONObject {
        require(token.length<=256*1024)
        val jws=JWSObject.parse(token)
        require(jws.header.toJSONObject().keys==setOf("alg","typ","jwk"))
        require(jws.header.algorithm==JWSAlgorithm.ES256 && jws.header.type==JOSEObjectType(type))
        val pub=JSONObject(jws.header.jwk.toJSONString());validatePublic(pub)
        require(id(pub)==expectedId && jws.verify(ECDSAVerifier(ECKey.parse(pub.toString())))) { "Invalid signature or controller" }
        return JSONObject(jws.payload.toString())
    }
    fun verifyState(token: String, expectedId: String?=null, minimumRevision: Long=1): JSONObject {
        val jws=JWSObject.parse(token)
        val identifier=expectedId ?: id(JSONObject(jws.header.jwk.toJSONString()))
        return verify(token,identifier,STATE).also {
            require(it.getInt("v")==1 && it.getString("id")==identifier && it.getLong("revision")>=minimumRevision)
            require(it.getLong("revision")<=1_000_000)
            validatePublic(it.getJSONObject("device"))
        }
    }
    fun proveControl(key: JSONObject, challenge: JSONObject, now: Long): String {
        require(challenge.getString("nonce").length==43 && now<challenge.getLong("expires"))
        return sign(JSONObject().put("v",1).put("iss",id(key)).put("aud",challenge.getString("aud"))
            .put("nonce",challenge.getString("nonce")).put("iat",now).put("exp",minOf(now+60,challenge.getLong("expires"))),key,PROOF)
    }
    fun verifyControl(proof: String, expected: String, challenge: JSONObject, now: Long): JSONObject =
        verify(proof,expected,PROOF).also {
            require(it.getInt("v")==1 && it.getString("iss")==expected && it.getString("aud")==challenge.getString("aud"))
            require(it.getString("nonce")==challenge.getString("nonce") && it.getLong("iat") in (now-60)..(now+5))
            require(it.getLong("exp")>now && it.getLong("exp")<=minOf(challenge.getLong("expires"),it.getLong("iat")+60))
        } // The verifier must atomically consume the nonce; see provider implementation.
    fun exportIdentity(material: JSONObject, recoveryKey: String): String {
        require(material.getInt("v")==1 && material.toString().length<=4*1024*1024)
        val key=decode(recoveryKey);require(key.size==32)
        return try {
            val obj=JWEObject(JWEHeader.Builder(JWEAlgorithm.DIR,EncryptionMethod.A256GCM).type(JOSEObjectType(BACKUP)).build(),Payload(material.toString()))
            obj.encrypt(DirectEncrypter(key));obj.serialize()
        } finally { key.fill(0) }
    }
    fun importIdentity(encrypted: String, recoveryKey: String): JSONObject {
        require(encrypted.length<=6*1024*1024)
        val key=decode(recoveryKey.trim());require(key.size==32)
        return try {
            val obj=JWEObject.parse(encrypted)
            require(obj.header.toJSONObject().keys==setOf("alg","enc","typ"))
            require(obj.header.algorithm==JWEAlgorithm.DIR && obj.header.encryptionMethod==EncryptionMethod.A256GCM && obj.header.type==JOSEObjectType(BACKUP))
            obj.decrypt(DirectDecrypter(key))
            JSONObject(obj.payload.toString()).also { require(it.getInt("v")==1) }
        } finally { key.fill(0) }
    }
    fun rotateController(): Nothing = error("A key fingerprint cannot rotate in place. Create a new identity and independently re-enroll contacts after controller compromise.")
}
