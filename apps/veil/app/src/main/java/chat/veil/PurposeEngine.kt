package chat.veil

import android.content.Context
import org.json.JSONObject
import org.json.JSONArray
import java.security.SecureRandom
import java.util.UUID

const val PURPOSE_DEFAULT_RELAY="https://veil-relay-soldsoul86.onrender.com"
fun opaqueId(): String = UUID.randomUUID().toString().replace("-","")
private fun deviceSecret() = ByteArray(32).also { SecureRandom().nextBytes(it) }.b64().trimEnd('=').replace('+','-').replace('/','_')

data class PurposeFacet(val id:String,val alias:String,val policy:PurposePolicy,val link:String,val published:Boolean)
data class PurposeContact(val id:String,val facet:String,val owner:Boolean,val policy:PurposePolicy,val status:String,
                          val messages:List<ChatMessage>,val safetyNumber:String,val compared:Boolean)
data class PurposeSnapshot(val ready:Boolean,val relay:String,val facets:List<PurposeFacet>,val contacts:List<PurposeContact>)
data class PurposeListing(val id:String,val alias:String,val policy:PurposePolicy,val invite:String="")

/** Every caller must hold MainActivity's process mutex. No existing chat vault writes. */
class PurposeEngine(context: Context) {
    private val vault=Vault(context,"purposes.v1")
    private val legacy=Vault(context)
    private fun load()=vault.read()
    private fun save(s:JSONObject) { require(s.toString().length<4*1024*1024) { "Purpose storage full" };vault.write(s) }
    private fun api(s:JSONObject,m:String,p:String,data:JSONObject?=null)=RelayClient(s.getString("relay")).request(m,"/v2$p",s.getString("token"),data)
    fun setup() {
        val s=load()
        if (!s.has("token")) {
            s.put("v",1).put("token",deviceSecret()).put("facets",JSONObject()).put("contacts",JSONObject())
                .put("relay",legacy.read().optString("relay",PURPOSE_DEFAULT_RELAY))
            save(s) // Preserve generated credential before the first possibly-committed request.
        }
        RelayClient(s.getString("relay")).request("GET","/v2/capabilities")
        s.put("account",api(s,"POST","/accounts").getString("id"));save(s)
    }
    fun create(policy:PurposePolicy, publishConfirmed:Boolean) {
        val s=load();require(s.has("account"));val facets=s.getJSONObject("facets")
        require(facets.length()<8)
        require(policy.discovery!=DiscoveryMode.PUBLIC_SEARCHABLE || publishConfirmed)
        val id=opaqueId();val f=JSONObject().put("id",id).put("invite",deviceSecret()).put("policy",policy.json())
            .put("slots",JSONObject()).put("confirmed",publishConfirmed)
        facets.put(id,f);save(s)
        publish(s,f);save(s)
    }
    private fun publish(s:JSONObject,f:JSONObject) {
        if(!f.has("alias")) {
            val result=api(s,"POST","/facets",JSONObject().put("id",f.getString("id")).put("invite",f.getString("invite"))
                .put("policy",f.getJSONObject("policy")).put("publish_confirmed",f.getBoolean("confirmed")))
            f.put("alias",result.getString("alias"));save(s)
        }
        val slots=f.getJSONObject("slots")
        if(slots.length()==0) {
            repeat(4) { val key=JSONObject();SignalSession.initialize(key);slots.put(opaqueId(),key) }
            save(s) // Private prekeys durable before their public halves become discoverable.
        }
        if(!f.optBoolean("slotsUploaded")) {
            val entries=JSONArray()
            slots.keys().forEach { sid -> entries.put(JSONObject().put("id",sid).put("bundle",PurposeCipher.bundle(slots.getJSONObject(sid)))) }
            api(s,"POST","/facets/${f.getString("id")}/slots",JSONObject().put("slots",entries))
            f.put("slotsUploaded",true);save(s)
        }
    }
    fun update(id:String,policy:PurposePolicy,consent:Boolean) {
        val s=load();val f=s.getJSONObject("facets").getJSONObject(id)
        val result=api(s,"PUT","/facets/$id",JSONObject().put("policy",policy.json()).put("publish_confirmed",consent))
        f.put("policy",result.getJSONObject("policy"));save(s)
    }
    fun search(query:String):List<PurposeListing> {
        val s=load();val encoded=java.net.URLEncoder.encode(query,Charsets.UTF_8.name())
        return api(s,"GET","/directory?q=$encoded").getJSONArray("listings").objects().map(::listing)
    }
    private fun listing(j:JSONObject)=PurposeListing(j.getString("id"),j.getString("alias"),PurposePolicy.from(j.getJSONObject("policy")))
    fun lookup(link:String):PurposeListing {
        val s=load();val parsed=PurposeLink.parse(link,s.getString("relay"))
        return listing(api(s,"POST","/lookup",JSONObject().put("alias",parsed.first).put("invite",parsed.second))).copy(invite=parsed.second)
    }
    fun request(target:PurposeListing,text:String) {
        require(text.isNotBlank() && text.length<=4000)
        val s=load();val contacts=s.getJSONObject("contacts");require(contacts.length()<16)
        val id=opaqueId();val c=JSONObject();SignalSession.initialize(c)
        c.put("id",id).put("facet",target.id).put("owner",false).put("policy",target.policy.json()).put("invite",target.invite)
            .put("status","RESERVED").put("intro",text).put("messages",JSONArray()).put("outbox",JSONArray()).put("seen",JSONObject())
        contacts.put(id,c);save(s)
        finishRequest(s,c)
    }
    private fun finishRequest(s:JSONObject,c:JSONObject) {
        val id=c.getString("id")
        if(!c.has("peer")) {
            val r=api(s,"POST","/facets/${c.getString("facet")}/reserve",JSONObject().put("id",id)
                .put("bundle",PurposeCipher.bundle(c)).put("invite",c.optString("invite")))
            c.put("peer",r.getJSONObject("bundle")).put("slot",r.getString("slot")).put("policy",r.getJSONObject("policy"));save(s)
        }
        if(c.has("intro")) {
            queue(s,c,c.getString("intro"),true)
            c.remove("intro");c.remove("invite");save(s)
        }
        flush(s,c)
    }
    fun decide(id:String,status:String) {
        require(status in listOf("APPROVED","REJECTED","BLOCKED","REVOKED"))
        val s=load();val c=s.getJSONObject("contacts").getJSONObject(id)
        api(s,"POST","/grants/$id/decision",JSONObject().put("status",status));c.put("status",status);save(s)
    }
    fun compare(id:String) {
        val s=load();val c=s.getJSONObject("contacts").getJSONObject(id)
        require(safetyNumber(c.getString("publicIdentity"),c.getJSONObject("peer").getString("identity")).length==60)
        c.put("compared",true);save(s)
    }
    fun send(id:String,text:String) {
        val s=load();val c=s.getJSONObject("contacts").getJSONObject(id)
        require(c.getString("status")=="APPROVED") { "Approval required" }
        queue(s,c,text,false);flush(s,c)
    }
    private fun queue(s:JSONObject,c:JSONObject,text:String,intro:Boolean) {
        require(text.isNotBlank() && text.length<=4000 && c.getJSONArray("outbox").length()<10 && c.getJSONArray("messages").length()<80)
        val m=JSONObject().put("v",1).put("id",opaqueId()).put("grant",c.getString("id")).put("facet",c.getString("facet"))
            .put("kind","text").put("text",text).put("expires",now()/1000+7*86400)
        val cipher=PurposeCipher.seal(c,m)
        val e=JSONObject().put("id",m.getString("id")).put("body",cipher.b64()).put("kind","text").put("expires",m.getLong("expires"))
        c.getJSONArray("outbox").put(JSONObject().put("envelope",e).put("intro",intro))
        c.getJSONArray("messages").put(m.put("mine",true).put("status","Queued on this phone"))
        if(intro) c.remove("intro")
        save(s) // Session + exact ciphertext + local message commit before upload.
    }
    private fun flush(s:JSONObject,c:JSONObject) {
        for(item in c.getJSONArray("outbox").objects()) {
            val e=item.getJSONObject("envelope")
            val tail=if(item.getBoolean("intro")) "introduction" else "messages/${e.getString("id")}" 
            val result=api(s,"PUT","/grants/${c.getString("id")}/$tail",e)
            c.put("outbox",JSONArray(c.getJSONArray("outbox").objects().filter { it.getJSONObject("envelope").getString("id")!=e.getString("id") }))
            c.getJSONArray("messages").objects().firstOrNull { it.getString("id")==e.getString("id") }?.put("status",if(result.optString("status")=="queued_until_open") "Queued until open" else "Accepted by relay")
            save(s)
        }
    }
    fun sync() {
        val s=load();if(!s.has("account"))return
        val facets=s.getJSONObject("facets");val contacts=s.getJSONObject("contacts")
        // Refresh server versions before retrying mutations. Never overwrite a newer policy silently.
        val remoteFacets=api(s,"GET","/facets").getJSONArray("facets").objects()
        remoteFacets.forEach { r -> facets.optJSONObject(r.getString("id"))?.put("policy",r.getJSONObject("policy"))?.put("alias",r.getString("alias")) }
        save(s)
        facets.keys().asSequence().toList().forEach { id -> val f=facets.getJSONObject(id)
            if(PurposePolicy.from(f.getJSONObject("policy")).status==PurposeStatus.ACTIVE) runCatching { publish(s,f) }
        }
        val remote=api(s,"GET","/grants").getJSONArray("grants").objects()
        remote.forEach { r ->
            val id=r.getString("id")
            if(!contacts.has(id) && r.getBoolean("owner") && contacts.length()<16) {
                val slot=facets.optJSONObject(r.getString("facet"))?.getJSONObject("slots")?.optJSONObject(r.getString("slot"))
                if(slot!=null) {
                    require(!slot.has("usedBy") || slot.getString("usedBy")==id) { "Contact key already consumed" }
                    slot.put("usedBy",id)
                    val c=JSONObject(slot.toString()).put("id",id).put("facet",r.getString("facet")).put("owner",true)
                        .put("peer",r.getJSONObject("bundle")).put("slot",r.getString("slot"))
                        .put("messages",JSONArray()).put("outbox",JSONArray()).put("seen",JSONObject())
                    contacts.put(id,c)
                }
            }
            contacts.optJSONObject(id)?.also { c ->
                // A pinned requester key cannot silently change through directory metadata.
                if(r.getBoolean("owner")) require(c.getJSONObject("peer").toString()==r.getJSONObject("bundle").toString() || c.getJSONObject("peer").getString("identity")==r.getJSONObject("bundle").getString("identity"))
                c.put("policy",r.getJSONObject("policy")).put("status",r.getString("status"))
            }
        }
        save(s)
        var failed=false
        contacts.keys().asSequence().toList().forEach { id ->
            val c=contacts.getJSONObject(id)
            prune(c);save(s)
            // A failed send must not prevent receiving another conversation.
            if(c.getString("status")=="RESERVED" && !c.getBoolean("owner")) {
                finishRequest(s,c)
            } else if(c.getString("status") in listOf("PENDING","APPROVED")) {
                if(runCatching { flush(s,c) }.isFailure)failed=true
            } else { c.put("outbox",JSONArray());save(s) }
            if(c.getString("status") !in listOf("PENDING","APPROVED"))return@forEach
            // Reload on failure so speculative Signal mutations never become durable.
            try {
                val incoming=api(s,"GET","/grants/$id/messages").getJSONArray("messages").objects()
                for(e in incoming) {
                    val mid=e.getString("id");require(mid.matches(Regex("[a-f0-9]{32}")))
                    if(!c.getJSONObject("seen").has(mid)) {
                        require(c.getJSONArray("messages").length()<80)
                        val m=PurposeCipher.open(c,e.getString("body").unb64())
                        require(m.getString("id")==mid && m.getString("kind")==e.getString("kind"))
                        require(m.getLong("expires")<=now()/1000+7*86400)
                        if(m.getLong("expires")>now()/1000) c.getJSONArray("messages").put(m.put("mine",false).put("status","Received"))
                        c.getJSONObject("seen").put(mid,now()/1000+7*86400);save(s)
                    }
                    api(s,"DELETE","/grants/$id/messages/$mid")
                }
            } catch (_:Exception) {
                // Stop using this mutable snapshot; the next poll reloads the last durable state.
                // No speculative ratchet state is saved after a failed decode/validation.
                throw IllegalStateException("Purpose delivery paused; retry after checking connection or contact limits")
            }
        }
        if(failed) error("Some purpose messages remain queued; check hours, permissions or connection")
    }
    private fun prune(c:JSONObject) {
        val t=now()/1000
        c.put("messages",JSONArray(c.getJSONArray("messages").objects().filter { it.getLong("expires")>t }))
        c.put("outbox",JSONArray(c.getJSONArray("outbox").objects().filter { it.getJSONObject("envelope").getLong("expires")>t }))
        val seen=c.getJSONObject("seen");seen.keys().asSequence().toList().filter { seen.getLong(it)<=t }.forEach(seen::remove)
    }
    fun snapshot():PurposeSnapshot {
        val s=load();if(!s.has("account"))return PurposeSnapshot(false,s.optString("relay",PURPOSE_DEFAULT_RELAY),emptyList(),emptyList())
        val facets=s.getJSONObject("facets");val contacts=s.getJSONObject("contacts")
        val fs=facets.keys().asSequence().map { id -> val f=facets.getJSONObject(id);val p=PurposePolicy.from(f.getJSONObject("policy"));val alias=f.optString("alias")
            PurposeFacet(id,alias,p,if(alias.isEmpty()) "" else PurposeLink.create(s.getString("relay"),alias,if(p.discovery==DiscoveryMode.UNLISTED)f.getString("invite") else ""),f.optBoolean("slotsUploaded"))
        }.toList()
        val cs=contacts.keys().asSequence().map { id -> val c=contacts.getJSONObject(id);prune(c)
            PurposeContact(id,c.getString("facet"),c.getBoolean("owner"),PurposePolicy.from(c.getJSONObject("policy")),c.getString("status"),
                c.getJSONArray("messages").objects().map { m -> ChatMessage(m.getString("id"),m.getBoolean("mine"),"text",Mode.PROTECTED,m.getString("text"),"",m.getLong("expires")*1000,0,0,"",m.getString("status")) },
                if(c.has("peer")) safetyNumber(c.getString("publicIdentity"),c.getJSONObject("peer").getString("identity")) else "",c.optBoolean("compared"))
        }.toList()
        save(s);return PurposeSnapshot(true,s.getString("relay"),fs,cs)
    }
    fun report(id:String) { val s=load();api(s,"POST","/facets/$id/report",JSONObject().put("reason","ABUSE")) }
}
