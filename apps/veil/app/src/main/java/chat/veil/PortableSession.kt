package chat.veil

import org.json.JSONArray
import org.json.JSONObject
import org.portableidentity.core.IdentityCore as Core
import java.time.Instant
import java.time.ZoneId
import java.util.UUID

/** The same client is used by Android and the independent-provider integration harness.
 * The caller serializes access. save must atomically encrypt/commit before returning.
 * No request ever contains ownership keys, Signal secrets or backup material.
 */
class PortableSession(
    private val db: JSONObject,
    private val save: (JSONObject)->Unit,
    private val transport: (String,String,JSONObject)->JSONObject,
    private val clock: ()->Long = {System.currentTimeMillis()/1000}
) {
    private fun same(a:Any?,b:Any?):Boolean = when {
        a is JSONObject && b is JSONObject -> a.keys().asSequence().toSet()==b.keys().asSequence().toSet() && a.keys().asSequence().all {same(a.get(it),b.get(it))}
        a is JSONArray && b is JSONArray -> a.length()==b.length() && (0 until a.length()).all {same(a.get(it),b.get(it))}
        a is Number && b is Number -> a.toString()==b.toString()
        else -> a==b
    }
    private fun commit() = save(db)
    private fun facets()=db.getJSONObject("facets")
    private fun contacts()=db.getJSONObject("contacts")
    private fun facet(id:String)=facets().getJSONObject(id)
    private fun contact(id:String)=contacts().getJSONObject(id)
    private fun fresh()=UUID.randomUUID().toString().replace("-","")
    private fun values(j:JSONObject)=j.keys().asSequence().toList().map(j::getJSONObject)
    private fun payload(f:JSONObject)=Core.verifyState(f.getString("state"),f.getString("id"))
    private fun q(op:String)=JSONObject().put("op",op)
    fun ready()=db.has("wallet")
    fun createIdentity() {
        check(!ready());db.put("v",1).put("wallet",Core.key()).put("facets",JSONObject()).put("contacts",JSONObject());commit()
    }
    private fun validateState(token:String,expected:String?=null,minimum:Long=1):JSONObject {
        val s=Core.verifyState(token,expected,minimum)
        require(s.keys().asSequence().toSet()==setOf("v","id","device","revision","issued","epoch","route","policy"))
        require(s.getString("epoch").matches(Regex("[a-f0-9]{32}")) && s.getLong("issued") in 1..clock()+60)
        val p=PurposePolicy.from(s.getJSONObject("policy"));require(p.requests!=RequestMode.AUTO_ACCEPT_WITH_LIMITS)
        // Production transport enforces HTTPS. Injected local test transports validate their own origins.
        require(s.getString("route").length in 8..2000)
        return s
    }
    private fun signedState(f:JSONObject,policy:PurposePolicy,route:String,epoch:String,revision:Long):String =
        Core.sign(JSONObject().put("v",1).put("id",f.getString("id")).put("device",Core.publicKey(f.getJSONObject("device")))
            .put("revision",revision).put("issued",clock()).put("epoch",epoch).put("route",route).put("policy",policy.json()),f.getJSONObject("controller"),Core.STATE)
    fun createFacet(policy:PurposePolicy,route:String,consent:Boolean):String {
        require(ready() && facets().length()<8 && policy.requests!=RequestMode.AUTO_ACCEPT_WITH_LIMITS)
        require(policy.discovery!=DiscoveryMode.PUBLIC_SEARCHABLE || consent)
        val controller=Core.key();val id=Core.id(controller)
        val f=JSONObject().put("id",id).put("controller",controller).put("device",Core.key()).put("slots",JSONObject()).put("consent",consent)
        f.put("state",signedState(f,policy,route,fresh(),1));facets().put(id,f);commit()
        return id // Local creation succeeds offline. Publication is a separate action.
    }
    private fun call(f:JSONObject,origin:String,request:JSONObject):JSONObject {
        val challenge=transport(origin,"/v3/nonce",JSONObject());val now=clock()
        require(challenge.getString("aud")==origin && challenge.getString("nonce").length==43 && challenge.getLong("expires")>now)
        val bytes=request.toString().toByteArray();val token=f.getString("state")
        val proof=JSONObject().put("v",1).put("iss",f.getString("id")).put("aud",origin).put("nonce",challenge.getString("nonce"))
            .put("iat",now).put("exp",minOf(now+60,challenge.getLong("expires"))).put("request_hash",Core.hash(bytes)).put("state_hash",Core.hash(token.toByteArray()))
        return transport(origin,"/v3/command",JSONObject().put("state",token).put("proof",Core.sign(proof,f.getJSONObject("device"),Core.PROOF)).put("request",Core.encode(bytes)))
    }
    fun publish(id:String) {
        val f=facet(id);val s=payload(f)
        call(f,s.getString("route"),q("publish").put("consent",f.getBoolean("consent")))
        if(PurposePolicy.from(s.getJSONObject("policy")).status==PurposeStatus.ACTIVE) replenish(f)
        f.put("published",true);commit()
    }
    private fun replenish(f:JSONObject) {
        val s=payload(f);val slots=f.getJSONObject("slots")
        val current=values(slots).filter { it.getString("epoch")==s.getString("epoch") }
        if(current.isEmpty()) repeat(4) {
            val slot=fresh();val signal=JSONObject();SignalSession.initialize(signal)
            val c=JSONObject().put("v",1).put("iss",f.getString("id")).put("role","owner").put("epoch",s.getString("epoch"))
                .put("slot",slot).put("bundle",PurposeCipher.bundle(signal))
            slots.put(slot,JSONObject().put("epoch",s.getString("epoch")).put("signal",signal).put("token",Core.sign(c,f.getJSONObject("controller"),Core.CHANNEL)))
        }
        commit() // Private prekeys must survive a successful upload/ambiguous network failure.
        val tokens=values(slots).filter {it.getString("epoch")==s.getString("epoch")}.map {it.getString("token")}
        call(f,s.getString("route"),q("slots").put("slots",JSONArray(tokens)))
    }
    fun updatePolicy(id:String,p:PurposePolicy,consent:Boolean) {
        val f=facet(id);val old=payload(f);val previous=PurposePolicy.from(old.getJSONObject("policy"))
        require(previous.status!=PurposeStatus.REVOKED && p.version>previous.version && p.requests!=RequestMode.AUTO_ACCEPT_WITH_LIMITS)
        require(p.discovery!=DiscoveryMode.PUBLIC_SEARCHABLE || consent)
        f.put("state",signedState(f,p,old.getString("route"),old.getString("epoch"),old.getLong("revision")+1)).put("consent",consent).put("published",false);commit();publish(id)
    }
    fun rotateDevice(id:String) {
        val f=facet(id);val old=payload(f);require(PurposePolicy.from(old.getJSONObject("policy")).status!=PurposeStatus.REVOKED)
        f.put("device",Core.key()).put("state",signedState(f,PurposePolicy.from(old.getJSONObject("policy")),old.getString("route"),old.getString("epoch"),old.getLong("revision")+1));commit();publish(id)
    }
    fun forgetRevokedFacet(id:String) {
        val f=facet(id);require(PurposePolicy.from(payload(f).getJSONObject("policy")).status==PurposeStatus.REVOKED)
        // Confirm terminal state reached the provider before dropping local control material.
        publish(id)
        values(contacts()).filter {it.getString("local")==id}.forEach {contacts().remove(it.getString("id"))}
        facets().remove(id);commit()
    }
    fun card(id:String)=JSONObject().put("v",1).put("state",facet(id).getString("state")).toString()
    fun inspectCard(card:String)=validateState(JSONObject(card).getString("state"))
    fun search(asFacet:String,origin:String,query:String):List<String> {
        val result=call(facet(asFacet),origin,q("search").put("query",query)).getJSONArray("states")
        return (0 until result.length()).map {result.getString(it)}.onEach {validateState(it)}.map {JSONObject().put("v",1).put("state",it).toString()}
    }
    fun request(asFacet:String,card:String,text:String,invitationToken:String?=null,requestId:String?=null):String {
        val token=JSONObject(card).getString("state");val owner=validateState(token);val f=facet(asFacet);val id=requestId ?: fresh()
        if(contacts().has(id)){val existing=contact(id);require(existing.getString("local")==asFacet);adopt(existing,call(f,existing.getString("route"),q("contact").put("id",id)));bind(existing);if(existing.has("outbox"))flush(existing) else if(existing.getString("status")=="RESERVED")send(id,text,true);return id}
        val result=call(f,owner.getString("route"),q("reserve").put("id",id).put("target",owner.getString("id")).put("invitation",token).apply {if(invitationToken!=null)put("invitation_token",invitationToken)})
        val c=JSONObject().put("id",id).put("local",asFacet).put("owner",owner.getString("id")).put("peer",asFacet)
            .put("owner_state",token).put("route",owner.getString("route")).put("messages",JSONArray()).put("seen",JSONArray()).put("status","RESERVED")
        contacts().put(id,c);commit();adopt(c,result);bind(c);send(id,text,true);return id
    }
    private fun channel(token:String,id:String,role:String,epoch:String,slot:String?=null,grant:String?=null):JSONObject {
        val p=Core.verify(token,id,Core.CHANNEL)
        require(p.getInt("v")==1 && p.getString("iss")==id && p.getString("role")==role && p.getString("epoch")==epoch)
        if(slot!=null)require(p.getString("slot")==slot)
        if(grant!=null)require(p.getString("grant")==grant)
        require(p.getString("slot").matches(Regex("[a-f0-9]{32}")))
        return p
    }
    private fun grant(token:String,owner:String,peer:String,id:String):JSONObject = Core.verify(token,owner,Core.GRANT).also {
        require(it.getInt("v")==1 && it.getString("iss")==owner && it.getString("aud")==peer && it.getString("id")==id)
        require(it.getLong("revision") in 1..1_000_000 && it.getString("status") in setOf("APPROVED","REVOKED","REJECTED","BLOCKED"))
    }
    private fun adopt(c:JSONObject,r:JSONObject) {
        require(r.getString("id")==c.getString("id") && r.getString("owner")==c.getString("owner") && r.getString("peer")==c.getString("peer"))
        val old=validateState(c.getString("owner_state"),c.getString("owner"))
        val owner=validateState(r.getString("owner_state"),c.getString("owner"),old.getLong("revision"))
        if(owner.getLong("revision")==old.getLong("revision"))require(same(owner,old))
        require(owner.getString("route")==c.getString("route") && owner.getString("epoch")==old.getString("epoch")) {"New route/session requires explicit acceptance"}
        val peer=validateState(r.getString("peer_state"),c.getString("peer"))
        if(c.has("peer_state")) {
            val previous=validateState(c.getString("peer_state"),c.getString("peer"))
            require(peer.getLong("revision")>=previous.getLong("revision"))
            if(peer.getLong("revision")==previous.getLong("revision"))require(same(peer,previous))
        }
        require(r.getString("epoch")==owner.getString("epoch"))
        val slot=channel(r.getString("slot"),c.getString("owner"),"owner",owner.getString("epoch"))
        if(c.has("slot"))require(c.getString("slot")==slot.getString("slot"))
        if(!r.isNull("grant")) {
            val g=grant(r.getString("grant"),c.getString("owner"),c.getString("peer"),c.getString("id"))
            if(c.has("grant")) {
                val oldGrant=grant(c.getString("grant"),c.getString("owner"),c.getString("peer"),c.getString("id"))
                require(g.getLong("revision")>=oldGrant.getLong("revision"))
                if(g.getLong("revision")==oldGrant.getLong("revision"))require(same(g,oldGrant))
                require(oldGrant.getString("status")=="APPROVED" || same(g,oldGrant))
            }
            c.put("grant",r.getString("grant"))
        } else require(!c.has("grant"))
        if(r.has("invitation_expires"))c.put("invitation_expires",r.getLong("invitation_expires")).put("access_seconds",r.getLong("access_seconds"))
        c.put("owner_state",r.getString("owner_state")).put("peer_state",r.getString("peer_state")).put("slot",slot.getString("slot")).put("slot_token",r.getString("slot")).put("status",r.getString("status"))
        if(c.getString("local")==c.getString("owner")) {
            require(values(contacts()).none {it.getString("id")!=c.getString("id") && it.getString("owner")==c.getString("owner") && it.optString("slot")==slot.getString("slot")}) {"Prekey slot reuse"}
        }
        if(!c.has("signal")) {
            val signal=if(c.getString("local")==c.getString("owner")) {
                JSONObject(facet(c.getString("local")).getJSONObject("slots").getJSONObject(slot.getString("slot")).getJSONObject("signal").toString())
            } else JSONObject().also {SignalSession.initialize(it)}
            signal.put("id",c.getString("id")).put("facet",c.getString("owner"))
            if(c.getString("local")==c.getString("peer"))signal.put("peer",slot.getJSONObject("bundle"))
            c.put("signal",signal)
        }
        if(!r.isNull("channel")) {
            val cp=channel(r.getString("channel"),c.getString("peer"),"peer",owner.getString("epoch"),slot.getString("slot"),c.getString("id"))
            if(c.has("channel"))require(same(Core.verify(c.getString("channel"),c.getString("peer"),Core.CHANNEL),cp))
            c.put("channel",r.getString("channel"))
            if(c.getString("local")==c.getString("owner")) c.getJSONObject("signal").put("peer",cp.getJSONObject("bundle"))
        }
        commit()
    }
    private fun bind(c:JSONObject) {
        val f=facet(c.getString("local"));require(f.getString("id")==c.getString("peer"))
        if(!c.has("channel")) {
            val owner=validateState(c.getString("owner_state"))
            val p=JSONObject().put("v",1).put("iss",f.getString("id")).put("role","peer").put("epoch",owner.getString("epoch"))
                .put("slot",c.getString("slot")).put("grant",c.getString("id")).put("bundle",PurposeCipher.bundle(c.getJSONObject("signal")))
            c.put("channel",Core.sign(p,f.getJSONObject("controller"),Core.CHANNEL));commit()
        }
        call(f,c.getString("route"),q("bind").put("id",c.getString("id")).put("channel",c.getString("channel")))
    }
    fun decide(id:String,status:String,accessSeconds:Long?=null) {
        val c=contact(id);val f=facet(c.getString("local"));require(f.getString("id")==c.getString("owner"))
        val rev=if(c.has("grant"))grant(c.getString("grant"),c.getString("owner"),c.getString("peer"),id).getLong("revision")+1 else 1
        val g=JSONObject().put("v",1).put("iss",c.getString("owner")).put("aud",c.getString("peer")).put("id",id)
            .put("status",status).put("revision",rev).put("expires",clock()+minOf(accessSeconds ?: 90*86400L,c.optLong("access_seconds",90*86400L),f.optJSONObject("ux")?.optLong("access_seconds",90*86400L) ?: 90*86400L))
        require(status in setOf("APPROVED","REVOKED","REJECTED","BLOCKED"))
        val token=Core.sign(g,f.getJSONObject("controller"),Core.GRANT)
        // Revocation is locally effective before any network request. A failed publication is visible.
        c.put("grant",token).put("decision_pending",true).put("status",status);if(status!="APPROVED")c.remove("outbox");commit()
        flushDecision(c)
    }
    private fun flushDecision(c:JSONObject) {
        if(!c.optBoolean("decision_pending"))return
        call(facet(c.getString("local")),c.getString("route"),q("decision").put("id",c.getString("id")).put("grant",c.getString("grant")))
        c.remove("decision_pending");commit()
    }
    private fun open(p:PurposePolicy):Boolean {
        val time=Instant.ofEpochSecond(clock()).atZone(ZoneId.of(p.timezone));val m=time.hour*60+time.minute
        return time.dayOfWeek.value in p.weekdays && m>=p.start && m<p.end
    }
    private fun allowed(c:JSONObject,intro:Boolean=false):PurposePolicy {
        val p=PurposePolicy.from(validateState(c.getString("owner_state")).getJSONObject("policy"))
        require(p.status==PurposeStatus.ACTIVE && (p.expiresAt==0L || p.expiresAt>clock()))
        if(intro)require(c.getString("local")==c.getString("peer") && c.getString("status")=="RESERVED" && p.requests==RequestMode.REQUEST_APPROVAL)
        else {
            val g=grant(c.getString("grant"),c.getString("owner"),c.getString("peer"),c.getString("id"))
            require(g.getString("status")=="APPROVED" && g.getLong("expires")>clock() && c.getString("status")=="APPROVED" && !c.optBoolean("decision_pending"))
        }
        return p
    }
    fun send(id:String,text:String,intro:Boolean=false) {
        val c=contact(id);require(!c.has("outbox")) {"A delivery is pending. Refresh to retry it."}
        val p=allowed(c,intro);require(intro || open(p) || p.outside==OutsideHours.ACCEPT_AND_QUEUE)
        val mid=fresh();val message=JSONObject().put("v",1).put("id",mid).put("facet",c.getString("owner")).put("grant",id).put("kind","text").put("text",text).put("expires",clock()+7*86400)
        val body=PurposeCipher.seal(c.getJSONObject("signal"),message).b64()
        val envelope=JSONObject().put("id",mid).put("kind","text").put("expires",message.getLong("expires")).put("body",body)
        c.put("outbox",q(if(intro)"intro" else "send").put("id",id).put("envelope",envelope))
        c.getJSONArray("messages").put(message.put("mine",true));trim(c);commit();flush(c)
    }
    private fun trim(c:JSONObject) {
        val messages=c.getJSONArray("messages");val keep=(0 until messages.length()).map(messages::getJSONObject).filter {it.getLong("expires")>clock()}.takeLast(100)
        c.put("messages",JSONArray(keep))
    }
    private fun flush(c:JSONObject) {
        if(c.has("outbox")) {
            val out=c.getJSONObject("outbox")
            if(out.getJSONObject("envelope").getLong("expires")<=clock()) {c.remove("outbox");commit();return}
            call(facet(c.getString("local")),c.getString("route"),out);c.remove("outbox");if(out.getString("op")=="intro")c.put("status","PENDING");commit()
        }
    }
    fun sync(id:String) {
        val f=facet(id);val route=payload(f).getString("route")
        values(contacts()).filter {it.getString("local")==id}.forEach {flushDecision(it)}
        val listed=f.optBoolean("published") && !f.optBoolean("needs_migration")
        val entries=if(listed)call(f,route,q("list")).getJSONArray("contacts") else JSONArray()
        for(i in 0 until entries.length()) {
            val r=entries.getJSONObject(i);val cid=r.getString("id")
            if(!contacts().has(cid)) {
                require(r.getString("owner")==id) // Only an owner's allocated slot may introduce a new contact.
                val owner=validateState(r.getString("owner_state"),id)
                require(owner.getString("epoch")==payload(f).getString("epoch"))
                contacts().put(cid,JSONObject().put("id",cid).put("local",id).put("owner",id).put("peer",r.getString("peer"))
                    .put("route",route).put("owner_state",f.getString("state")).put("messages",JSONArray()).put("seen",JSONArray()).put("status",r.getString("status")))
            }
            adopt(contact(cid),r)
        }
        values(contacts()).filter {it.getString("local")==id}.forEach { c -> syncContact(c.getString("id")) }
    }
    /** Refresh one pinned route without contacting any unrelated provider/directory. */
    fun syncContact(id:String) {
        val c=contact(id);val f=facet(c.getString("local"))
        flushDecision(c)
        adopt(c,call(f,c.getString("route"),q("contact").put("id",id)))
            val p=PurposePolicy.from(validateState(c.getString("owner_state")).getJSONObject("policy"));trim(c);commit()
            if(c.getString("status") !in setOf("PENDING","APPROVED","RESERVED") || p.status!=PurposeStatus.ACTIVE || (p.expiresAt>0 && p.expiresAt<=clock()))return
            if(c.has("outbox"))flush(c)
            if(!open(p) || !c.getJSONObject("signal").has("peer"))return
            if(c.getString("status")=="APPROVED")allowed(c)
            val messages=call(f,c.getString("route"),q("messages").put("id",c.getString("id"))).getJSONArray("messages")
            for(n in 0 until messages.length()) {
                val e=messages.getJSONObject(n);val seen=c.getJSONArray("seen");val mid=e.getString("id")
                if((0 until seen.length()).none {seen.getString(it)==mid}) {
                    require(seen.length()<10000) {"Conversation limit reached"}
                    if(c.getString("status")!="APPROVED")require(c.getString("local")==c.getString("owner") && seen.length()==0) {"Only one introduction before approval"}
                    val decoded=PurposeCipher.open(c.getJSONObject("signal"),e.getString("body").unb64())
                    require(decoded.getString("id")==mid && decoded.getLong("expires")==e.getLong("expires"))
                    if(decoded.getLong("expires")>clock())c.getJSONArray("messages").put(decoded.put("mine",false))
                    seen.put(mid);trim(c);commit() // Persist ratchet + dedup before acknowledging deletion.
                }
                call(f,c.getString("route"),q("ack").put("id",c.getString("id")).put("message",mid))
            }
    }
    fun exportIdentity(key:String):String {
        require(ready())
        val material=JSONObject().put("v",1).put("profile","pi/1").put("wallet",db.getJSONObject("wallet")).put("created",clock())
        material.put("facets",JSONArray(values(facets()).map {f -> JSONObject().put("id",f.getString("id")).put("controller",f.getJSONObject("controller")).put("state",f.getString("state")).put("consent",f.getBoolean("consent"))}))
        material.put("contacts",JSONArray(values(contacts()).filter {it.has("grant")}.map {c ->
            JSONObject().put("id",c.getString("id")).put("local",c.getString("local")).put("owner",c.getString("owner")).put("peer",c.getString("peer"))
                .put("owner_state",c.getString("owner_state")).put("peer_state",c.getString("peer_state")).put("grant",c.getString("grant"))
        }))
        return Core.exportIdentity(material,key)
    }
    fun importIdentity(encrypted:String,key:String) {
        check(!ready()) {"Import requires an empty portable wallet. Existing chats are never overwritten."}
        val m=Core.importIdentity(encrypted,key);require(m.getString("profile")=="pi/1")
        Core.id(m.getJSONObject("wallet"));val fs=m.getJSONArray("facets");require(fs.length()<=8)
        val newFacets=JSONObject();val newContacts=JSONObject()
        for(i in 0 until fs.length()) {
            val f=JSONObject(fs.getJSONObject(i).toString());val id=Core.id(f.getJSONObject("controller"));require(f.getString("id")==id && !newFacets.has(id))
            validateState(f.getString("state"),id);f.put("device",Core.key()).put("slots",JSONObject()).put("needs_migration",true).put("published",false);newFacets.put(id,f)
        }
        val cs=m.getJSONArray("contacts");require(cs.length()<=256)
        for(i in 0 until cs.length()) {
            val c=JSONObject(cs.getJSONObject(i).toString());val local=c.getString("local");require(newFacets.has(local) && local in setOf(c.getString("owner"),c.getString("peer")))
            val owner=validateState(c.getString("owner_state"),c.getString("owner"));validateState(c.getString("peer_state"),c.getString("peer"))
            val g=grant(c.getString("grant"),c.getString("owner"),c.getString("peer"),c.getString("id"))
            require(!newContacts.has(c.getString("id")))
            c.put("route",owner.getString("route")).put("status",g.getString("status")).put("messages",JSONArray()).put("seen",JSONArray()).put("needs_migration",true)
            newContacts.put(c.getString("id"),c)
        }
        db.put("v",1).put("wallet",m.getJSONObject("wallet")).put("facets",newFacets).put("contacts",newContacts);commit()
    }
    fun migrate(id:String,destination:String,consent:Boolean) {
        val f=facet(id);val old=payload(f);val p=PurposePolicy.from(old.getJSONObject("policy"))
        require(p.status==PurposeStatus.ACTIVE && (p.discovery!=DiscoveryMode.PUBLIC_SEARCHABLE || consent))
        // Only explicit user confirmation starts a new epoch. Retry the same destination idempotently.
        if(!f.optBoolean("migration_pending")) {
            require(destination!=old.getString("route")) {"Choose an independent new provider"}
            f.put("device",Core.key()).put("slots",JSONObject()).put("consent",consent)
                .put("state",signedState(f,p,destination,fresh(),old.getLong("revision")+1)).put("migration_pending",true)
            values(contacts()).filter {it.getString("local")==id && it.getString("owner")==id}.forEach {c ->
                c.put("owner_state",f.getString("state")).put("route",destination).put("messages",JSONArray()).put("seen",JSONArray())
                listOf("signal","outbox","channel","slot","slot_token").forEach(c::remove)
            };commit()
        } else require(payload(f).getString("route")==destination)
        publish(id)
        values(contacts()).filter {it.getString("local")==id && it.getString("owner")==id && it.has("grant")}.forEach {c ->
            val g=grant(c.getString("grant"),id,c.getString("peer"),c.getString("id"))
            if(g.getString("status")=="APPROVED" && g.getLong("expires")>clock()) {
                val r=call(f,destination,q("restore").put("grant",c.getString("grant")).put("peer_state",c.getString("peer_state")))
                adopt(c,r);c.remove("needs_migration")
            }
        }
        f.remove("migration_pending");f.remove("needs_migration");commit()
    }
    fun acceptRoute(id:String,card:String) {
        val c=contact(id);require(c.getString("local")==c.getString("peer"))
        val old=validateState(c.getString("owner_state"));val token=JSONObject(card).getString("state")
        val next=validateState(token,c.getString("owner"),old.getLong("revision")+1)
        require(next.getString("epoch")!=old.getString("epoch"))
        // Preserve pin/grant history; discard old ratchets and pending messages only after confirmation.
        c.put("owner_state",token).put("route",next.getString("route")).put("messages",JSONArray()).put("seen",JSONArray())
        listOf("signal","outbox","channel","slot","slot_token").forEach(c::remove);commit()
        reconnect(id)
    }
    fun reconnect(id:String) {
        val c=contact(id);val f=facet(c.getString("local"))
        adopt(c,call(f,c.getString("route"),q("contact").put("id",id)));bind(c);c.remove("needs_migration");commit()
    }
    /** Public/display-only snapshot. Never return controller/device keys or Signal state to UI. */
    fun prepareInvitation(draft:String,kind:ContactExperience.Kind,p:PurposePolicy=ContactExperience.policy(kind),origin:String=ContactExperience.DEFAULT_PROVIDER):String {
        require(draft.matches(Regex("[a-f0-9]{32}")))
        require(p.discovery==DiscoveryMode.UNLISTED && p.requests==RequestMode.REQUEST_APPROVAL && p.expiresAt==0L)
        if(!ready())createIdentity()
        val drafts=db.optJSONObject("ux_drafts") ?: JSONObject().also{db.put("ux_drafts",it)}
        val id=if(drafts.has(draft))drafts.getString(draft) else createFacet(p,origin,false).also {drafts.put(draft,it);commit()}
        val f=facet(id)
        if(!f.has("ux"))f.put("ux",JSONObject().put("kind",kind.name).put("token",Core.secret()).put("expires",clock()+ContactExperience.WEEK).put("access_seconds",ContactExperience.accessSeconds(kind)).put("ready",false)).also{commit()}
        val x=f.getJSONObject("ux");require(!x.optBoolean("canceled") && x.getLong("expires")>clock()) {"Invitation expired. Create a new contact."}
        publish(id)
        call(f,payload(f).getString("route"),q("invite").put("token",x.getString("token")).put("expires",x.getLong("expires")).put("access_seconds",x.getLong("access_seconds")))
        x.put("ready",true);commit();return id
    }
    fun invitationLink(id:String):String {
        val f=facet(id);val x=f.getJSONObject("ux");require(x.getBoolean("ready") && !x.optBoolean("canceled") && x.getLong("expires")>clock())
        return ContactExperience.link(payload(f).getString("route"),x.getString("token"))
    }
    fun cancelInvitation(id:String) {
        val f=facet(id);val x=f.getJSONObject("ux")
        x.put("canceled",true).put("cancel_pending",true);commit()
        call(f,payload(f).getString("route"),q("cancel_invite").put("token",x.getString("token")))
        x.put("cancel_pending",false);commit()
    }
    fun previewInvitation(link:String):JSONObject {
        val (route,token)=ContactExperience.parse(link)
        val result=transport(route,"/v3/invite-preview",JSONObject().put("token",token))
        val s=validateState(result.getString("state"));require(s.getString("route")==route && result.getLong("expires")>clock())
        require(result.getLong("access_seconds") in 3600..90*86400L)
        return result.put("policy",s.getJSONObject("policy"))
    }
    fun requestInvitation(link:String,text:String,draft:String):String {
        val result=previewInvitation(link);val (route,token)=ContactExperience.parse(link)
        if(!ready())createIdentity()
        val requests=db.optJSONObject("ux_requests") ?: JSONObject().also{db.put("ux_requests",it)}
        val local=if(requests.has(draft))requests.getString(draft) else createFacet(PurposePolicy("Private contact",timezone=ZoneId.systemDefault().id),route,false).also{requests.put(draft,it);commit()}
        return request(local,JSONObject().put("v",1).put("state",result.getString("state")).toString(),text,token,draft)
    }
    fun snapshot():JSONObject {
        if(!ready())return JSONObject().put("ready",false)
        values(contacts()).forEach(::trim);commit()
        return JSONObject().put("ready",true).put("wallet_id",Core.id(db.getJSONObject("wallet")))
            .put("facets",JSONArray(values(facets()).map {f -> payload(f).put("published",f.optBoolean("published")).put("needs_migration",f.optBoolean("needs_migration")).put("card",card(f.getString("id"))).apply {f.optJSONObject("ux")?.let {x -> put("invitation",JSONObject().put("expires",x.getLong("expires")).put("access_seconds",x.getLong("access_seconds")).put("ready",x.optBoolean("ready")).put("canceled",x.optBoolean("canceled")).put("cancel_pending",x.optBoolean("cancel_pending")).put("link",if(x.optBoolean("ready") && !x.optBoolean("canceled") && x.getLong("expires")>clock())invitationLink(f.getString("id")) else ""))}}}))
            .put("contacts",JSONArray(values(contacts()).map {c -> JSONObject().put("id",c.getString("id")).put("local",c.getString("local")).put("owner",c.getString("owner")).put("peer",c.getString("peer"))
                .put("status",c.getString("status")).put("access_expires",if(c.has("grant"))grant(c.getString("grant"),c.getString("owner"),c.getString("peer"),c.getString("id")).getLong("expires") else 0).put("invitation_expires",c.optLong("invitation_expires")).put("access_seconds",c.optLong("access_seconds",90*86400L)).put("route",c.getString("route")).put("policy",validateState(c.getString("owner_state")).getJSONObject("policy"))
                .put("messages",c.getJSONArray("messages")).put("access_change_pending",c.optBoolean("decision_pending")).put("pending",c.has("outbox") || c.optBoolean("decision_pending")).put("needs_migration",c.optBoolean("needs_migration"))
                .put("safety",if(c.optJSONObject("signal")?.has("peer")==true) safetyNumber(c.getJSONObject("signal").getString("publicIdentity"),c.getJSONObject("signal").getJSONObject("peer").getString("identity")) else "")
            }))
    }
}
