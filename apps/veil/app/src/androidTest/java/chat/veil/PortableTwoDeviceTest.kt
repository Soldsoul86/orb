package chat.veil

import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.*
import org.junit.Test
import org.json.JSONObject
import org.portableidentity.core.IdentityCore as Core
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.MediaType.Companion.toMediaType
import java.io.File
import java.security.KeyStore
import java.security.cert.CertificateFactory
import javax.net.ssl.SSLContext
import javax.net.ssl.TrustManagerFactory
import javax.net.ssl.X509TrustManager

/** Host-coordinated two-emulator test. Test-only CA; production RelayClient remains unchanged. */
class PortableTwoDeviceTest {
    @Test fun stage() {
        val args=InstrumentationRegistry.getArguments();val stage=args.getString("stage") ?: return
        require(args.getString("disposableFixture")=="true")
        val context=InstrumentationRegistry.getInstrumentation().targetContext
        val dir=File(context.filesDir,"portable-fixture");dir.mkdirs()
        fun read(name:String)=File(dir,name).readText()
        fun write(name:String,value:String) {File(dir,name).writeText(value)}
        val ca=File(dir,"ca.pem").inputStream().use {CertificateFactory.getInstance("X.509").generateCertificate(it)}
        val store=KeyStore.getInstance(KeyStore.getDefaultType()).apply {load(null);setCertificateEntry("fixture",ca)}
        val factory=TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm()).apply {init(store)}
        val trust=factory.trustManagers.filterIsInstance<X509TrustManager>().single()
        val ssl=SSLContext.getInstance("TLS").apply {init(null,arrayOf(trust),null)}
        val http=OkHttpClient.Builder().sslSocketFactory(ssl.socketFactory,trust).followRedirects(false).followSslRedirects(false).build()
        val originA="https://127.0.0.1:18443";val originB="https://127.0.0.1:18444"
        var afterShutdown=stage in setOf("restore","accept","receive-new","receive-reply","revoke","revoked")
        val transport={origin:String,path:String,data:JSONObject ->
            if(afterShutdown)assertEquals("No A request allowed after shutdown",originB,origin)
            val request=Request.Builder().url(origin+path).post(data.toString().toRequestBody("application/json".toMediaType())).build()
            http.newCall(request).execute().use {response ->check(response.isSuccessful){"Fixture status ${response.code}"};JSONObject(response.body!!.string())}
        }
        if(stage=="restore") {
            // A fresh client without old Signal sessions, on a disposable emulator only.
            File(context.noBackupFilesDir,"identity.v1").delete()
        }
        val vault=Vault(context,if(stage.startsWith("contact-"))"contact-test.v1" else "identity.v1");val session=PortableSession(vault.read(),vault::write,transport)
        when(stage) {
            "contact-owner" -> {
                assertFalse(session.ready())
                val draft="1".repeat(32)
                val id=session.prepareInvitation(draft,ContactExperience.Kind.TEMPORARY,origin=originA)
                val link=session.invitationLink(id)
                assertEquals(id,session.prepareInvitation(draft,ContactExperience.Kind.TEMPORARY,origin=originA))
                assertEquals(link,session.invitationLink(id));assertEquals(1,session.snapshot().getJSONArray("facets").length())
                write("facet",id);write("link",link)
            }
            "contact-peer" -> {
                val link=read("link")
                repeat(3){session.previewInvitation(link)}
                assertFalse(session.ready()) // preview does not create any local identity
                val draft="2".repeat(32);val id=session.requestInvitation(link,"Contact invitation introduction",draft)
                assertEquals(id,session.requestInvitation(link,"Contact invitation introduction",draft))
                assertEquals(1,session.snapshot().getJSONArray("contacts").length())
                write("grant",id)
                assertTrue(runCatching{session.send(id,"Not yet accepted")}.isFailure)
            }
            "contact-approve" -> {
                session.sync(read("facet"));val c=session.snapshot().getJSONArray("contacts").getJSONObject(0)
                assertEquals("Contact invitation introduction",c.getJSONArray("messages").getJSONObject(0).getString("text"))
                write("grant",c.getString("id"));session.decide(c.getString("id"),"APPROVED")
                val expires=session.snapshot().getJSONArray("contacts").getJSONObject(0).getLong("access_expires")
                assertTrue(expires-System.currentTimeMillis()/1000 in (ContactExperience.WEEK-10)..ContactExperience.WEEK)
            }
            "contact-send" -> {session.syncContact(read("grant"));session.send(read("grant"),"Real encrypted invitation chat")}
            "contact-reply" -> {
                session.syncContact(read("grant"));val messages=session.snapshot().getJSONArray("contacts").getJSONObject(0).getJSONArray("messages")
                assertEquals("Real encrypted invitation chat",messages.getJSONObject(messages.length()-1).getString("text"))
                session.send(read("grant"),"Real encrypted contact reply")
            }
            "contact-receive" -> {
                session.syncContact(read("grant"));val messages=session.snapshot().getJSONArray("contacts").getJSONObject(0).getJSONArray("messages")
                assertEquals("Real encrypted contact reply",messages.getJSONObject(messages.length()-1).getString("text"))
            }
            "contact-end" -> {session.cancelInvitation(read("facet"));session.decide(read("grant"),"REVOKED")}
            "contact-blocked" -> {
                assertTrue(runCatching{session.previewInvitation(read("link"))}.isFailure)
                session.syncContact(read("grant"));assertTrue(runCatching{session.send(read("grant"),"After end access")}.isFailure)
            }
            "owner" -> {
                session.createIdentity()
                val id=session.createFacet(PurposePolicy("Portable professional",timezone="Europe/London",discovery=DiscoveryMode.PUBLIC_SEARCHABLE),originA,true)
                session.publish(id);write("facet",id);write("card",session.card(id));write("wallet",session.snapshot().getString("wallet_id"))
            }
            "peer" -> {
                session.createIdentity()
                val id=session.createFacet(PurposePolicy("Personal",timezone="America/Toronto"),originA,false)
                assertEquals(1,session.search(id,originA,"Portable professional").size)
                write("facet",id);write("grant",session.request(id,read("card"),"Android introduction"))
                assertTrue(runCatching {session.send(read("grant"),"No permission")}.isFailure)
            }
            "approve" -> {
                session.sync(read("facet"));val c=session.snapshot().getJSONArray("contacts").getJSONObject(0)
                assertEquals("Android introduction",c.getJSONArray("messages").getJSONObject(0).getString("text"))
                write("grant",c.getString("id"));session.decide(read("grant"),"APPROVED")
            }
            "send-original" -> {session.sync(read("facet"));session.send(read("grant"),"Approved Android Signal message")}
            "export" -> {
                session.sync(read("facet"));val m=session.snapshot().getJSONArray("contacts").getJSONObject(0).getJSONArray("messages")
                assertEquals("Approved Android Signal message",m.getJSONObject(m.length()-1).getString("text"))
                val key=Core.secret();write("recovery",key);write("backup",session.exportIdentity(key))
            }
            "restore" -> {
                assertFalse(session.ready());session.importIdentity(read("backup"),read("recovery"))
                assertEquals(read("wallet"),session.snapshot().getString("wallet_id"))
                session.migrate(read("facet"),originB,true);write("new-card",session.card(read("facet")))
                assertEquals(0,session.snapshot().getJSONArray("contacts").getJSONObject(0).getJSONArray("messages").length())
            }
            "accept" -> {session.acceptRoute(read("grant"),read("new-card"));session.send(read("grant"),"NEW Android message with A offline")}
            "receive-new" -> {
                session.sync(read("facet"));val messages=session.snapshot().getJSONArray("contacts").getJSONObject(0).getJSONArray("messages")
                assertEquals("NEW Android message with A offline",messages.getJSONObject(0).getString("text"))
                session.send(read("grant"),"NEW Android reply via B")
            }
            "receive-reply" -> {
                session.sync(read("facet"));val messages=session.snapshot().getJSONArray("contacts").getJSONObject(0).getJSONArray("messages")
                assertEquals("NEW Android reply via B",messages.getJSONObject(messages.length()-1).getString("text"))
            }
            "revoke" -> session.decide(read("grant"),"REVOKED")
            "revoked" -> {session.sync(read("facet"));assertTrue(runCatching {session.send(read("grant"),"Unauthorized")}.isFailure)}
            else -> error("Unknown fixture stage")
        }
        // No keys, cards, message bodies, backup or recovery key appear in instrumentation output.
        println("PASS portable two-device stage: $stage")
    }
}
