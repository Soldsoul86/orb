package chat.veil

import org.json.JSONObject
import org.json.JSONArray
import org.junit.Assert.*
import org.junit.Test
import java.nio.file.Files
import java.net.HttpURLConnection
import java.net.URI
import java.util.Base64
import java.time.Instant
import java.security.SecureRandom

/** Two independent native Signal clients through a real loopback relay. NOT a physical-phone demo. */
class PurposeNetworkTest {
    private fun secret()=Base64.getUrlEncoder().withoutPadding().encodeToString(ByteArray(32).also { SecureRandom().nextBytes(it) })
    @Test(timeout=90000) fun discoverRequestApproveQueueRevokeWithActualSignalCiphertext() {
        val dir=Files.createTempDirectory("veil-purpose-fixture")
        val db=dir.resolve("relay.sqlite")
        val fixture=java.io.File(System.getProperty("veil.relayDir"),"demo_fixture.py")
        val process=ProcessBuilder("python3","-u",fixture.absolutePath,db.toString()).redirectError(ProcessBuilder.Redirect.INHERIT).start()
        val input=process.inputStream.bufferedReader();val commands=process.outputStream.bufferedWriter()
        try {
            val port=input.readLine().toInt();val origin="http://127.0.0.1:$port"
            val owner=secret();val visitor=secret();val unauthorized=secret()
            fun request(method:String,path:String,token:String="",data:JSONObject?=null):Pair<Int,JSONObject> {
                val conn=URI(origin+path).toURL().openConnection() as HttpURLConnection
                conn.requestMethod=method;conn.connectTimeout=5000;conn.readTimeout=5000
                if(token.isNotEmpty())conn.setRequestProperty("Authorization","Bearer $token")
                if(data!=null) { conn.doOutput=true;conn.setRequestProperty("Content-Type","application/json");conn.outputStream.use { it.write(data.toString().toByteArray()) } }
                return try { val code=conn.responseCode;val stream=if(code<400)conn.inputStream else conn.errorStream
                    code to JSONObject(stream.bufferedReader().use { it.readText() })
                } finally { conn.disconnect() }
            }
            fun clock(value:String) { commands.write("clock ${Instant.parse(value).epochSecond}\n");commands.flush();assertEquals("ok",input.readLine()) }
            for(token in listOf(owner,visitor,unauthorized))assertEquals(201,request("POST","/v2/accounts",token).first)
            clock("2026-10-19T06:00:00Z")
            val work=opaqueId();val privateFacet=opaqueId();val sale=opaqueId()
            for((id,p) in listOf(work to PurposePolicy.template("Professional").copy(discovery=DiscoveryMode.PUBLIC_SEARCHABLE),privateFacet to PurposePolicy.template("Personal"),sale to PurposePolicy.template("Temporary sale",Instant.parse("2026-10-19T06:00:00Z").epochSecond))) {
                assertEquals(201,request("POST","/v2/facets",owner,JSONObject().put("id",id).put("invite",secret()).put("policy",p.json()).put("publish_confirmed",id==work)).first)
            }
            val (searchCode,search)=request("POST","/v2/directory",visitor,JSONObject().put("query","Work"))
            assertEquals(200,searchCode);assertEquals(1,search.getJSONArray("listings").length())
            assertEquals(work,search.getJSONArray("listings").getJSONObject(0).getString("id"))
            assertFalse(search.toString().contains(privateFacet));assertFalse(search.toString().contains("account_id"))
            val alice=JSONObject();val bob=JSONObject();SignalSession.initialize(alice);SignalSession.initialize(bob)
            val slot=opaqueId();val grant=opaqueId()
            request("POST","/v2/facets/$work/slots",owner,JSONObject().put("slots",JSONArray().put(JSONObject().put("id",slot).put("bundle",PurposeCipher.bundle(alice))))).also { assertEquals(200,it.first) }
            val (reserveCode,reservation)=request("POST","/v2/facets/$work/reserve",visitor,JSONObject().put("id",grant).put("bundle",PurposeCipher.bundle(bob)))
            assertEquals(201,reserveCode)
            bob.put("peer",reservation.getJSONObject("bundle")).put("id",grant).put("facet",work)
            alice.put("peer",PurposeCipher.bundle(bob)).put("id",grant).put("facet",work)
            val canary="consulting-canary-"+opaqueId()
            fun envelope(text:String):JSONObject {
                val id=opaqueId();val expiry=Instant.parse("2026-10-25T06:00:00Z").epochSecond
                val message=JSONObject().put("v",1).put("id",id).put("facet",work).put("grant",grant).put("kind","text").put("text",text).put("expires",expiry)
                return JSONObject().put("id",id).put("body",PurposeCipher.seal(bob,message).b64()).put("kind","text").put("expires",expiry)
            }
            val intro=envelope(canary)
            assertEquals(201,request("PUT","/v2/grants/$grant/introduction",visitor,intro).first)
            val denied=envelope("not approved yet")
            assertEquals(403,request("PUT","/v2/grants/$grant/messages/${denied.getString("id")}",visitor,denied).first)
            // Inspect real SQLite/WAL bytes while the introduction is still pending.
            Files.list(dir).use { files -> files.forEach { path ->
                val raw=String(Files.readAllBytes(path),Charsets.ISO_8859_1)
                assertFalse(raw.contains(canary));assertFalse(raw.contains(owner));assertFalse(raw.contains(visitor))
                assertFalse(raw.contains(alice.getString("identity")));assertFalse(raw.contains(bob.getString("identity")))
            } }
            val received=request("GET","/v2/grants/$grant/messages",owner).second.getJSONArray("messages").getJSONObject(0)
            assertEquals(canary,PurposeCipher.open(alice,received.getString("body").unb64()).getString("text"))
            request("DELETE","/v2/grants/$grant/messages/${received.getString("id")}",owner)
            assertEquals(200,request("POST","/v2/grants/$grant/decision",owner,JSONObject().put("status","APPROVED")).first)
            clock("2026-10-19T18:00:00Z")
            val queued=envelope("after hours")
            val sent=request("PUT","/v2/grants/$grant/messages/${queued.getString("id")}",visitor,queued)
            assertEquals(201,sent.first);assertEquals("queued_until_open",sent.second.getString("status"))
            assertEquals(0,request("GET","/v2/grants/$grant/messages",owner).second.getJSONArray("messages").length())
            assertEquals(404,request("GET","/v2/grants/$grant/messages",unauthorized).first)
            assertEquals(404,request("PUT","/v2/grants/$privateFacet/messages/${queued.getString("id")}",visitor,queued).first)
            clock("2026-10-20T03:30:00Z")
            val delivered=request("GET","/v2/grants/$grant/messages",owner).second.getJSONArray("messages").getJSONObject(0)
            assertEquals("after hours",PurposeCipher.open(alice,delivered.getString("body").unb64()).getString("text"))
            assertEquals(safetyNumber(alice.getString("publicIdentity"),bob.getString("publicIdentity")),safetyNumber(bob.getString("publicIdentity"),alice.getString("publicIdentity")))
            assertEquals(200,request("POST","/v2/grants/$grant/decision",owner,JSONObject().put("status","REVOKED")).first)
            assertEquals(403,request("PUT","/v2/grants/$grant/messages/${queued.getString("id")}",visitor,queued).first)
            assertEquals(0,request("GET","/v2/grants/$grant/messages",owner).second.getJSONArray("messages").length())
            // Existing /v1 mailbox contract still accepts and retrieves opaque envelopes.
            val read=secret();val write=secret()
            val box=request("POST","/v1/boxes",data=JSONObject().put("reader",read).put("writer",write)).second.getString("id")
            val old=JSONObject().put("body",intro.getString("body")).put("expires",System.currentTimeMillis()/1000+60)
            val mid=opaqueId();assertEquals(201,request("PUT","/v1/boxes/$box/messages/$mid",write,old).first)
            assertEquals(old.getString("body"),request("GET","/v1/boxes/$box/messages",read).second.getJSONArray("messages").getJSONObject(0).getString("body"))
        } finally {
            runCatching { commands.write("quit\n");commands.flush() }
            process.waitFor(5,java.util.concurrent.TimeUnit.SECONDS);process.destroyForcibly()
            Files.walk(dir).use { paths -> paths.sorted(java.util.Comparator.reverseOrder()).forEach(Files::deleteIfExists) }
        }
    }
}
