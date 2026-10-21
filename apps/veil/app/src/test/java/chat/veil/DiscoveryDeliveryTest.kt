package chat.veil

import java.io.IOException
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import org.portableidentity.core.IdentityCore as Core
import org.portableidentity.core.DiscoveryPublication

/** Transport-failure and recovery boundaries; real PostgreSQL CAS is tested separately. */
class DiscoveryDeliveryTest {
    private val now=1800000000L
    private val provider="https://provider.example"
    private val directory="https://directory.example"
    private val draft="""{"v":1,"visibility":"PUBLIC","profile":{"alias":"TEST owner","purpose":"Android interface redesign","category":"DESIGN & CREATE","tags":["ui"],"accepting":true}}"""
    @Test fun persistedCommandRetriesExactlyThenStaleRestoreRequiresSignedReconciliation() {
        var saved=JSONObject();var hosted:String?=null;var loseResponse=true
        val attempts=mutableListOf<String>()
        fun transport(origin:String,path:String,body:JSONObject):JSONObject = when(path) {
            "/v3/nonce" -> JSONObject().put("aud",provider).put("nonce",Core.secret()).put("expires",now+60)
            "/v3/command" -> JSONObject().also {assertEquals(provider,origin)}
            "/api/current" -> JSONObject().put("publication",hosted ?: JSONObject.NULL).also{assertEquals(directory,origin)}
            "/api/publish" -> {
                assertEquals(directory,origin);attempts.add(body.toString());hosted=body.getString("publication")
                val d=Core.verify(hosted!!,body.getString("controller"),DiscoveryPublication.TYPE)
                if(loseResponse){loseResponse=false;throw IOException("disposable test response loss")}
                JSONObject().put("revision",d.getLong("revision")).put("visibility",d.getString("visibility")).put("hosted",d.getString("visibility")=="PUBLIC")
            }
            else -> error("Unexpected transport path")
        }
        fun session(state:JSONObject)=PortableSession(state,{saved=JSONObject(it.toString())},::transport,{now})
        val first=session(saved);first.createIdentity()
        val id=first.createFacet(PurposePolicy("TEST owner",timezone="UTC",outside=OutsideHours.REJECT),provider,false)
        val recoveryKey=Core.secret();val backup=first.exportIdentity(recoveryKey)
        assertThrows(IOException::class.java){first.publishDiscovery(id,draft,directory)}
        assertTrue(saved.getJSONObject("facets").getJSONObject(id).has("discovery_pending"))
        val restarted=session(JSONObject(saved.toString()))
        assertEquals(directory+"/#profile/"+id.substringAfterLast(':'),restarted.retryDiscovery(id))
        assertEquals(attempts[0],attempts[1]);assertFalse(saved.getJSONObject("facets").getJSONObject(id).has("discovery_pending"))
        val stale=JSONObject(saved.toString());val oldToken=hosted!!
        restarted.publishDiscovery(id,draft,directory)
        assertEquals(2,Core.verify(hosted!!,id,DiscoveryPublication.TYPE).getInt("revision"))
        val restored=session(stale)
        assertThrows(DiscoveryChanged::class.java){restored.publishDiscovery(id,draft,directory)}
        val latest=hosted!!;restored.reconcileDiscovery(id,latest)
        val expired=PortableSession(JSONObject(saved.toString()),{},::transport,{now+31*86400})
        assertThrows(IllegalArgumentException::class.java){expired.reconcileDiscovery(id,latest)}
        assertThrows(Exception::class.java){restored.reconcileDiscovery(id,latest.dropLast(8)+"AAAAAAAA")}
        assertEquals(2,saved.getJSONObject("facets").getJSONObject(id).getInt("discovery_revision"))
        assertThrows(IllegalArgumentException::class.java){restored.reconcileDiscovery(id,oldToken)}
        val conflict=Core.verify(latest,id,DiscoveryPublication.TYPE).put("expires",now+600)
        val controller=saved.getJSONObject("facets").getJSONObject(id).getJSONObject("controller")
        assertThrows(IllegalArgumentException::class.java){restored.reconcileDiscovery(id,DiscoveryPublication.sign(conflict,controller))}
        val fresh=session(JSONObject());fresh.importIdentity(backup,recoveryKey)
        fresh.reconcileDiscovery(id,latest)
        assertTrue(saved.getJSONObject("facets").getJSONObject(id).getBoolean("needs_migration"))
        assertThrows(IllegalArgumentException::class.java){fresh.publishDiscovery(id,draft,directory)}
        assertFalse(attempts.joinToString().contains(controller.getString("d")))
    }
    @Test fun unsignedCountersAndWrongControllerCannotRecover() {
        val db=JSONObject();val session=PortableSession(db,{}, {_,_,_->error("No network in recovery")},{now})
        session.createIdentity();val id=session.createFacet(PurposePolicy("TEST",timezone="UTC"),provider,false)
        assertThrows(Exception::class.java){session.reconcileDiscovery(id,"{\"revision\":999999}")}
        val key=Core.key()
        val token=Core.sign(JSONObject().put("v",1).put("controller",id).put("revision",999999),key,DiscoveryPublication.TYPE)
        assertThrows(Exception::class.java){session.reconcileDiscovery(id,token)}
        assertFalse(db.getJSONObject("facets").getJSONObject(id).has("discovery_revision"))
    }
}
