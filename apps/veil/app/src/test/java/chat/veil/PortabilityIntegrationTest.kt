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

/** Real native libsignal, JOSE cross-implementation verification and two process/DB stacks. */
class PortabilityIntegrationTest {
    @Test fun originalProviderOfflineFreshRestoreAndNewSignalConversation() {
        val directory=File(System.getProperty("veil.providerDir"));val temp=Files.createTempDirectory("pi-proof").toFile()
        fun port()=ServerSocket(0).use {it.localPort}
        val portA=port();var portB=port();while(portB==portA)portB=port()
        val a="http://127.0.0.1:$portA";val b="http://127.0.0.1:$portB"
        fun launch(port:Int,db:String)=ProcessBuilder("python3",File(directory,"fixture.py").path,"--db",File(temp,db).path,"--port",port.toString()).redirectErrorStream(true).redirectOutput(File(temp,"$db.log")).start()
        val processA=launch(portA,"a.sqlite");val processB=launch(portB,"b.sqlite")
        var aOffline=false;var postShutdownRequests=0
        val requests=mutableListOf<String>()
        fun post(origin:String,path:String,data:JSONObject):JSONObject {
            if(aOffline) { assertEquals("No request to A after shutdown",b,origin);postShutdownRequests++ }
            requests.add(data.toString())
            val c=URL(origin+path).openConnection() as HttpURLConnection
            try {
                c.requestMethod="POST";c.doOutput=true;c.connectTimeout=3000;c.readTimeout=5000
                c.setRequestProperty("Content-Type","application/json");c.outputStream.use {it.write(data.toString().toByteArray())}
                check(c.responseCode==200) {"Provider response ${c.responseCode}"}
                return JSONObject(c.inputStream.bufferedReader().use {it.readText()})
            } finally {c.disconnect()}
        }
        try {
            for(origin in listOf(a,b)) {
                var started=false
                repeat(100) {if(!started) {started=runCatching {post(origin,"/v3/nonce",JSONObject())}.isSuccess;if(!started)Thread.sleep(100)}}
                assertTrue("Provider started",started)
            }
            var aliceSaved=JSONObject();val alice=PortableSession(JSONObject(),{aliceSaved=JSONObject(it.toString())},::post)
            var bobSaved=JSONObject();val bob=PortableSession(JSONObject(),{bobSaved=JSONObject(it.toString())},::post)
            alice.createIdentity();bob.createIdentity()
            assertNotEquals(alice.snapshot().getString("wallet_id"),bob.snapshot().getString("wallet_id"))
            val policy=PurposePolicy("Global work",timezone="Europe/Paris",discovery=DiscoveryMode.PUBLIC_SEARCHABLE)
            val aid=alice.createFacet(policy,a,true);val bid=bob.createFacet(PurposePolicy("Contact",timezone="America/New_York"),a,false)
            alice.publish(aid)
            assertEquals(1,bob.search(bid,a,"Global work").size)
            val gid=bob.request(bid,alice.card(aid),"Introduction only")
            assertTrue(runCatching {bob.send(gid,"Not approved")}.isFailure)
            alice.sync(aid);assertEquals("Introduction only",alice.snapshot().getJSONArray("contacts").getJSONObject(0).getJSONArray("messages").getJSONObject(0).getString("text"))
            alice.decide(gid,"APPROVED");bob.sync(bid)
            bob.send(gid,"Before migration: real Signal");alice.sync(aid)
            alice.send(gid,"Original reply");bob.sync(bid)
            val secret=Core.secret();val encrypted=alice.exportIdentity(secret)
            assertFalse(encrypted.contains("controller"));assertFalse(encrypted.contains("Global work"))
            assertTrue(runCatching {Core.importIdentity(encrypted,Core.secret())}.isFailure)
            val decoded=Core.importIdentity(encrypted,secret)
            assertFalse(decoded.toString().contains("Original reply"));assertFalse(decoded.toString().contains("session"))
            // Stop A: its API, directory and relay vanish with its process; remove its database too.
            processA.destroy();assertTrue(processA.waitFor(10,TimeUnit.SECONDS));File(temp,"a.sqlite").delete()
            assertTrue(runCatching {URL("$a/healthz").openConnection().apply {connectTimeout=500}.getInputStream().close()}.isFailure)
            aOffline=true
            var restoredSaved=JSONObject();val restored=PortableSession(JSONObject(),{restoredSaved=JSONObject(it.toString())},::post)
            restored.importIdentity(encrypted,secret)
            assertEquals(alice.snapshot().getString("wallet_id"),restored.snapshot().getString("wallet_id"))
            restored.migrate(aid,b,true)
            val card=restored.card(aid);val cardFile=File(temp,"route-card.json");cardFile.writeText(card)
            val verifier=ProcessBuilder("python3",File(directory,"open_verifier.py").path,cardFile.path,aid).redirectErrorStream(true).start()
            val output=verifier.inputStream.bufferedReader().readText();assertEquals(output,0,verifier.waitFor());assertTrue(output.contains("PASS"))
            // Tampered/wrong-controller route rejected without contacting either provider.
            val fake=JSONObject(card);val falseState=Core.verifyState(fake.getString("state"));falseState.put("route","https://attacker.invalid")
            fake.put("state",Core.sign(falseState,Core.key(),Core.STATE))
            assertTrue(runCatching {bob.acceptRoute(gid,fake.toString())}.isFailure)
            bob.acceptRoute(gid,card)
            bob.send(gid,"NEW message while A is OFFLINE");restored.sync(aid)
            val received=restored.snapshot().getJSONArray("contacts").getJSONObject(0).getJSONArray("messages")
            assertEquals(1,received.length());assertEquals("NEW message while A is OFFLINE",received.getJSONObject(0).getString("text"))
            restored.send(gid,"NEW reply via independent B");bob.sync(bid)
            assertEquals("NEW reply via independent B",bob.snapshot().getJSONArray("contacts").getJSONObject(0).getJSONArray("messages").getJSONObject(1).getString("text"))
            assertTrue(postShutdownRequests>10)
            // The wire carries no root private JWK, Signal state or message plaintext.
            val wire=requests.joinToString("\n")
            listOf("NEW message while A is OFFLINE","NEW reply via independent B","Before migration: real Signal").forEach {assertFalse(wire.contains(it))}
            assertFalse(wire.contains(aliceSaved.getJSONObject("wallet").getString("d")))
            assertFalse(wire.contains(restoredSaved.getJSONObject("facets").getJSONObject(aid).getJSONObject("controller").getString("d")))
            assertFalse(wire.contains(bobSaved.getJSONObject("wallet").getString("d")))
            restored.decide(gid,"REVOKED");bob.sync(bid);assertTrue(runCatching {bob.send(gid,"After revocation")}.isFailure)
            println("PASS: independent Python verifier, A process stopped and DB removed, fresh JWE restore, same controller, NEW Signal message/reply through B, revocation. JVM processes; not physical devices.")
        } finally {processA.destroyForcibly();processB.destroyForcibly();processA.waitFor(10,TimeUnit.SECONDS);processB.waitFor(10,TimeUnit.SECONDS);temp.deleteRecursively()}
    }
}
