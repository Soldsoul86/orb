package chat.veil

import org.junit.Assert.*
import org.junit.Test
import org.json.JSONObject
import org.portableidentity.core.IdentityCore as Core
import org.portableidentity.core.DiscoveryPublication
import java.io.File
import java.net.HttpURLConnection
import java.net.ServerSocket
import java.net.URL
import java.nio.file.Files
import java.util.concurrent.TimeUnit

class DiscoveryOwnerTest {
    @Test fun existingVaultSignsOnlyReviewedPurposeAndUnpublishesProvider() {
        val tmp=Files.createTempDirectory("veil-discovery-owner").toFile();val port=ServerSocket(0).use{it.localPort}
        val origin="https://127.0.0.1:$port"
        val process=ProcessBuilder("python3",File(System.getProperty("veil.providerDir"),"fixture.py").path,"--db",File(tmp,"test.sqlite").path,"--port",port.toString(),"--logical-https").redirectErrorStream(true).redirectOutput(File(tmp,"fixture.log")).start()
        val wire=mutableListOf<String>()
        fun post(route:String,path:String,data:JSONObject):JSONObject {
            assertEquals(origin,route);wire.add(data.toString())
            val c=URL("http://127.0.0.1:$port$path").openConnection() as HttpURLConnection
            try {c.requestMethod="POST";c.doOutput=true;c.connectTimeout=1000;c.readTimeout=5000;c.setRequestProperty("Content-Type","application/json");c.outputStream.use{it.write(data.toString().toByteArray())};check(c.responseCode==200);return JSONObject(c.inputStream.bufferedReader().use{it.readText()})}finally{c.disconnect()}
        }
        try {
            var started=false;repeat(100){if(!started){started=runCatching{post(origin,"/v3/nonce",JSONObject())}.isSuccess;if(!started)Thread.sleep(50)}};assertTrue(started)
            var saved=JSONObject();val session=PortableSession(saved,{saved=JSONObject(it.toString())},::post);session.createIdentity()
            val a=session.createFacet(PurposePolicy("TEST discovery",timezone="UTC"),origin,false)
            val b=session.createFacet(PurposePolicy("TEST private",timezone="UTC"),origin,false)
            val before=session.card(b)
            assertEquals(0,session.search(b,origin,"TEST discovery").size)
            val draft="""{"v":1,"visibility":"PUBLIC","profile":{"alias":"TEST owner","purpose":"Android interface redesign","category":"DESIGN & CREATE","tags":["ui"],"accepting":true}}"""
            val export=session.signDiscovery(a,draft);val token=JSONObject(export).getString("publication")
            val verified=Core.verify(token,a,DiscoveryPublication.TYPE)
            assertEquals(1,verified.getInt("revision"));assertEquals("PUBLIC",verified.getString("visibility"));assertEquals(before,session.card(b))
            assertEquals(1,session.search(b,origin,"TEST discovery").size)
            assertEquals(export,session.discoveryExport(a));assertFalse(export.contains(saved.getJSONObject("wallet").getString("d")))
            assertFalse(wire.joinToString().contains(saved.getJSONObject("facets").getJSONObject(a).getJSONObject("controller").getString("d")))
            System.getenv("VEIL_DISCOVERY_OWNER_FIXTURE")?.let {File(it).writeText(JSONObject(export).put("controller",a).toString())}
            val removed=session.signDiscovery(a,"""{"v":1,"visibility":"PRIVATE","profile":{}}""")
            val removal=Core.verify(JSONObject(removed).getString("publication"),a,DiscoveryPublication.TYPE)
            assertEquals(2,removal.getInt("revision"));assertTrue(removal.isNull("state"));assertEquals(0,removal.getJSONObject("profile").length())
            assertEquals(0,session.search(b,origin,"TEST discovery").size);assertEquals(before,session.card(b))
            val restored=PortableSession(saved,{},::post);assertEquals(removed,restored.discoveryExport(a))
        }finally{process.destroyForcibly();process.waitFor(10,TimeUnit.SECONDS);tmp.deleteRecursively()}
    }
}
