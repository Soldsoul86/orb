package chat.veil

import org.junit.Assert.*
import org.junit.Test
import org.json.JSONObject
import org.portableidentity.core.IdentityCore as Core
import java.io.File
import java.net.HttpURLConnection
import java.net.ServerSocket
import java.net.URL
import java.nio.file.Files
import java.util.concurrent.TimeUnit

/** Response-loss fault injection around a real provider and native Signal; not a TLS test. */
class ContactInvitationRetryTest {
    @Test fun lostResponsesRetrySameIdentityInvitationRequestAndCiphertext() {
        val tmp=Files.createTempDirectory("veil-retry").toFile();val port=ServerSocket(0).use{it.localPort}
        val origin="https://127.0.0.1:$port"
        val fixture=File(System.getProperty("veil.providerDir"),"fixture.py")
        val process=ProcessBuilder("python3",fixture.path,"--db",File(tmp,"relay.sqlite").path,"--port",port.toString(),"--logical-https").redirectErrorStream(true).redirectOutput(File(tmp,"fixture.log")).start()
        var lose="";val wire=mutableListOf<String>()
        fun post(route:String,path:String,data:JSONObject):JSONObject {
            assertEquals(origin,route);wire.add(data.toString())
            val op=if(data.has("request"))JSONObject(String(Core.decode(data.getString("request")))).getString("op") else ""
            // Loopback HTTP only in this JVM fixture; production and two-device tests enforce HTTPS.
            val c=URL("http://127.0.0.1:$port$path").openConnection() as HttpURLConnection
            try {
                c.requestMethod="POST";c.doOutput=true;c.connectTimeout=1000;c.readTimeout=5000
                c.setRequestProperty("Content-Type","application/json");c.outputStream.use{it.write(data.toString().toByteArray())}
                check(c.responseCode==200){"Fixture rejected request ${c.responseCode}"}
                val result=JSONObject(c.inputStream.bufferedReader().use{it.readText()})
                if(op==lose && lose.isNotEmpty()){lose="";error("Injected response loss after commit")}
                return result
            }finally{c.disconnect()}
        }
        try {
            var started=false
            repeat(100){if(!started){started=runCatching{post(origin,"/v3/nonce",JSONObject())}.isSuccess;if(!started)Thread.sleep(50)}}
            assertTrue(started)
            var savedA=JSONObject();var savedB=JSONObject()
            var a=PortableSession(savedA,{savedA=JSONObject(it.toString())},::post)
            var b=PortableSession(savedB,{savedB=JSONObject(it.toString())},::post)
            val draft="3".repeat(32);lose="invite"
            assertTrue(runCatching{a.prepareInvitation(draft,ContactExperience.Kind.TEMPORARY,origin=origin)}.isFailure)
            val wallet=a.snapshot().getString("wallet_id")
            a=PortableSession(savedA,{savedA=JSONObject(it.toString())},::post)
            val owner=a.prepareInvitation(draft,ContactExperience.Kind.TEMPORARY,origin=origin);val link=a.invitationLink(owner)
            assertEquals(wallet,a.snapshot().getString("wallet_id"));assertEquals(1,a.snapshot().getJSONArray("facets").length())
            val requestId="4".repeat(32);lose="reserve"
            assertTrue(runCatching{b.requestInvitation(link,"A retry-safe introduction",requestId)}.isFailure)
            b=PortableSession(savedB,{savedB=JSONObject(it.toString())},::post);lose="intro"
            assertTrue(runCatching{b.requestInvitation(link,"A retry-safe introduction",requestId)}.isFailure)
            b=PortableSession(savedB,{savedB=JSONObject(it.toString())},::post)
            assertEquals(requestId,b.requestInvitation(link,"A retry-safe introduction",requestId))
            assertEquals(1,b.snapshot().getJSONArray("facets").length());assertEquals(1,b.snapshot().getJSONArray("contacts").length())
            a.sync(owner);assertEquals(1,a.snapshot().getJSONArray("contacts").getJSONObject(0).getJSONArray("messages").length())
            lose="decision";assertTrue(runCatching{a.decide(requestId,"APPROVED")}.isFailure)
            assertTrue(a.snapshot().getJSONArray("contacts").getJSONObject(0).getBoolean("access_change_pending"))
            a.syncContact(requestId);b.syncContact(requestId)
            lose="send";assertTrue(runCatching{b.send(requestId,"Exactly one encrypted retry")}.isFailure)
            b.syncContact(requestId);a.syncContact(requestId)
            val messages=a.snapshot().getJSONArray("contacts").getJSONObject(0).getJSONArray("messages")
            assertEquals(2,messages.length());assertEquals("Exactly one encrypted retry",messages.getJSONObject(1).getString("text"))
            assertFalse(wire.joinToString().contains("Exactly one encrypted retry"));assertFalse(wire.joinToString().contains("A retry-safe introduction"))
            assertFalse(wire.joinToString().contains(savedA.getJSONObject("wallet").getString("d")))
        }finally{process.destroyForcibly();process.waitFor(10,TimeUnit.SECONDS);tmp.deleteRecursively()}
    }
}
