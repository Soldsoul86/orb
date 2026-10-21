package chat.veil

import java.io.File
import java.net.URI
import java.util.UUID
import java.util.concurrent.TimeUnit
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request as HttpRequest
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import org.matrix.rustcomponents.sdk.crypto.*
import org.portableidentity.core.IdentityCore as Core
import uniffi.matrix_sdk_crypto.CollectStrategy
import uniffi.matrix_sdk_crypto.DecryptionSettings
import uniffi.matrix_sdk_crypto.LocalTrust
import uniffi.matrix_sdk_crypto.TrustRequirement

/** Called only under MainActivity's process mutex. No Signal state or remote private keys. */
internal class GuestOwner(private val session:PortableSession, private val files:File) {
    private var data=session.guestLoad()
    private val http=OkHttpClient.Builder().callTimeout(25,TimeUnit.SECONDS).followRedirects(false).build()
    private lateinit var machine:OlmMachine
    private fun now()=System.currentTimeMillis()/1000
    private fun random()=UUID.randomUUID().toString().replace("-","")
    private fun obj(vararg p:Pair<String,Any>)=JSONObject().also{v->p.forEach{v.put(it.first,it.second)}}
    private fun save()=session.guestSave(data)
    private fun sign(value:JSONObject,type:String)=session.guestSign(data.getString("owner"),value,type)
    private fun request(path:String,method:String="GET",body:JSONObject?=null):JSONObject {
        val b=HttpRequest.Builder().url(data.getString("origin")+path)
        data.optJSONObject("login")?.let{b.header("Authorization","Bearer "+it.getString("access_token"))}
        b.method(method,body?.toString()?.toRequestBody("application/json".toMediaType()))
        http.newCall(b.build()).execute().use{r->check(r.isSuccessful){"Guest service unavailable (${r.code}). Retry keeps the saved operation."};return JSONObject(r.body!!.string())}
    }
    private fun same(a:Any?,b:Any?):Boolean=when {
        a is JSONObject && b is JSONObject -> a.keys().asSequence().toSet()==b.keys().asSequence().toSet() && a.keys().asSequence().all{same(a.get(it),b.get(it))}
        a is JSONArray && b is JSONArray -> a.length()==b.length() && (0 until a.length()).all{same(a.get(it),b.get(it))}
        else -> a==b
    }
    fun configure(owner:String,origin:String,web:String,user:String,password:String) {
        require(!data.has("owner")){"A guest identity is already configured. It was not reset."}
        for(url in listOf(origin,web)) {
            val u=URI(url);require(u.rawUserInfo==null && u.rawQuery==null && u.rawFragment==null && u.path.isNullOrEmpty())
            require(u.scheme=="https" || u.scheme=="http" && u.host in setOf("10.0.2.2","127.0.0.1","localhost"))
        }
        session.guestState(owner)
        data=obj("owner" to owner,"origin" to origin,"web" to web,"passphrase" to Core.secret(),"conversations" to JSONObject(),"since" to "")
        val login=request("/_matrix/client/v3/login","POST",obj("type" to "m.login.password","identifier" to obj("type" to "m.id.user","user" to user),"password" to password,"device_id" to "OWNER"))
        data.put("login",login);save()
        crypto {};enroll()
    }
    private fun transmit(r:Request) {
        val id:String;val kind:RequestType;val response:JSONObject
        when(r) {
            is Request.KeysUpload->{id=r.requestId;kind=RequestType.KEYS_UPLOAD;val b=JSONObject(r.body);b.keys().asSequence().toList().filter{b.isNull(it)}.forEach(b::remove);response=request("/_matrix/client/v3/keys/upload","POST",b)}
            is Request.KeysQuery->{id=r.requestId;kind=RequestType.KEYS_QUERY;val users=JSONObject();r.users.forEach{users.put(it,JSONArray())};response=request("/_matrix/client/v3/keys/query","POST",obj("device_keys" to users))}
            is Request.KeysClaim->{id=r.requestId;kind=RequestType.KEYS_CLAIM;response=request("/_matrix/client/v3/keys/claim","POST",obj("one_time_keys" to JSONObject(r.oneTimeKeys)))}
            else->error("Unexpected Matrix request; no fallback")
        }
        machine.markRequestAsSent(id,kind,response.toString())
    }
    private fun drain()=machine.outgoingRequests().forEach(::transmit)
    /** Commit SDK store generation and app inbox together in the encrypted vault.
     * Each operation works on a copy of the previous CLOSED SDK store. Process death
     * before vault commit leaves the prior ratchet + sync token + inbox intact.
     */
    private fun crypto(operation:()->Unit) {
        val root=File(files,"guest-crypto").apply{mkdirs()};val generation=random();val work=File(root,generation)
        val prior=data.optString("store")
        if(prior.isNotEmpty()){val old=File(root,prior);check(old.isDirectory){"Encryption storage lost. Nothing was reset."};check(old.copyRecursively(work))}else work.mkdirs()
        val before=JSONObject(data.toString());var closed=false
        val login=data.getJSONObject("login")
        machine=OlmMachine(login.getString("user_id"),login.getString("device_id"),work.absolutePath,data.getString("passphrase"))
        try {
            val keys=JSONObject(machine.identityKeys())
            if(data.has("keys"))check(same(keys,data.getJSONObject("keys"))){"Encryption identity changed; refusing recovery"}else data.put("keys",keys)
            drain();operation();machine.close();closed=true
            data.put("store",generation);save() // Atomic encrypted vault write selects this CLOSED SDK checkpoint.
            root.listFiles()?.filter{it.name!=generation}?.forEach{it.deleteRecursively()}
        }catch(t:Throwable){data=before;throw t}
        finally{if(!closed)machine.close()}
    }
    private fun ownCard():JSONObject {
        val id=data.getString("owner");val state=session.guestState(id);val login=data.getJSONObject("login")
        val endpoint=JSONObject(data.getJSONObject("keys").toString()).put("user_id",login.getString("user_id")).put("device_id",login.getString("device_id"))
        return obj("id" to id,"state" to state,"binding" to sign(obj("v" to 1,"iss" to id,"state_hash" to Core.hash(state.toByteArray()),"endpoint" to endpoint),"pi-matrix-binding+jws"))
    }
    private fun enroll() {
        val own=ownCard();val id=data.getString("owner")
        if(!data.has("enrollment")) {
            val issued=now();data.put("enrollment",sign(obj("v" to 1,"iss" to id,"invite" to (random()+random()),"revision" to 1,"issued" to issued,"expires" to issued+3600,"owner" to own),"pi-matrix-enrollment+jws"))
        }else {
            val old=Core.verify(data.getString("enrollment"),id,"pi-matrix-enrollment+jws")
            if(old.getJSONObject("owner").getString("state")!=own.getString("state"))data.put("enrollment",sign(old.put("revision",old.getLong("revision")+1).put("owner",own),"pi-matrix-enrollment+jws"))
        }
        save() // Enrollment intent and SDK checkpoint are durable before admission.
        request("/pilot/enroll","POST",obj("owner" to id,"token" to data.getString("enrollment")))
    }
    private fun endpoint(card:JSONObject):JSONObject {
        val id=card.getString("id");Core.verifyState(card.getString("state"),id)
        val b=Core.verify(card.getString("binding"),id,"pi-matrix-binding+jws")
        check(b.getString("iss")==id && b.getString("state_hash")==Core.hash(card.getString("state").toByteArray()))
        return b.getJSONObject("endpoint")
    }
    private fun pin(e:JSONObject) {
        val user=e.getString("user_id");val device=e.getString("device_id")
        machine.updateTrackedUsers(listOf(user));drain()
        // A direct query is also checked on every boundary, even if SDK cache is warm.
        val keys=request("/_matrix/client/v3/keys/query","POST",obj("device_keys" to obj(user to JSONArray(listOf(device))))).getJSONObject("device_keys").getJSONObject(user).getJSONObject(device).getJSONObject("keys")
        val d=checkNotNull(machine.getDevice(user,device,0u))
        for(k in listOf("ed25519","curve25519"))check(keys.getString("$k:$device")==e.getString(k) && (d.keys["$k:$device"] ?: d.keys[k])==e.getString(k))
        machine.setLocalTrust(user,device,LocalTrust.VERIFIED)
    }
    private fun allowed(p:JSONObject) {
        val current=Core.verifyState(session.guestState(data.getString("owner")),data.getString("owner"))
        val policy=PurposePolicy.from(current.getJSONObject("policy"));val time=java.time.Instant.ofEpochSecond(now()).atZone(java.time.ZoneId.of(policy.timezone));val minute=time.hour*60+time.minute
        check(policy.status==PurposeStatus.ACTIVE && policy.requests==RequestMode.REQUEST_APPROVAL && (policy.expiresAt==0L || policy.expiresAt>now()))
        check(time.dayOfWeek.value in policy.weekdays && minute>=policy.start && minute<policy.end)
        check(p.getLong("expires")>now() && p.getString("status") in setOf("pending","approved"))
    }
    private fun conversations()=data.getJSONObject("conversations")
    private fun entries()=conversations().keys().asSequence().toList().map(conversations()::getJSONObject)
    private fun pending(c:JSONObject) {
        if(c.has("decision_pending")) {
            request("/veil/policy","POST",obj("owner" to data.getString("owner"),"token" to c.getString("decision_pending")))
            c.remove("decision_pending")
        }
        if(c.has("outbox")) {
            val p=c.getJSONObject("policy");allowed(p);check(p.getString("status")=="approved")
            val o=c.getJSONObject("outbox");check(o.getLong("expires")>now())
            request("/_matrix/client/v3/sendToDevice/m.room.encrypted/"+o.getString("id"),"PUT",o.getJSONObject("body"))
            c.remove("outbox");c.put("receipt","Received by service")
        }
    }
    fun refresh() {
      enroll()
      crypto {
        entries().forEach(::pending)
        val items=request("/pilot/inbox").getJSONArray("conversations")
        val enrolled=Core.verify(data.getString("enrollment"),data.getString("owner"),"pi-matrix-enrollment+jws")
        for(i in 0 until items.length()) {
            val item=items.getJSONObject(i);val id=item.getString("id");val p=item.getJSONObject("policy");val guest=p.getJSONObject("guest")
            check(p.getString("iss")==data.getString("owner") && p.getString("invitation")==id && item.getString("invite")==enrolled.getString("invite"))
            val claim=Core.verify(item.getString("claim"),guest.getString("id"),"pi-matrix-claim+jws")
            check(claim.getString("iss")==guest.getString("id") && claim.getString("invite")==enrolled.getString("invite") && same(claim.getJSONObject("guest"),guest))
            check(id==java.security.MessageDigest.getInstance("SHA-256").digest((claim.getString("invite")+guest.getString("id")).toByteArray()).joinToString(""){"%02x".format(it)})
            check(p.getLong("issued")==enrolled.getLong("issued") && p.getLong("expires")==enrolled.getLong("expires"))
            check(p.getJSONObject("owner").getString("id")==data.getString("owner") && same(endpoint(p.getJSONObject("owner")),endpoint(enrolled.getJSONObject("owner"))))
            if(item.getString("decision").isNotEmpty())check(same(p,Core.verify(item.getString("decision"),data.getString("owner"),"pi-matrix-policy+jws")))
            else check(p.getString("status")=="pending" && p.getLong("revision")==1L)
            val c=conversations().optJSONObject(id)
            if(c==null)conversations().put(id,obj("id" to id,"policy" to p,"messages" to JSONArray(),"seen" to JSONArray()))
            else {check(p.getLong("revision")>=c.getJSONObject("policy").getLong("revision"));if(p.getLong("revision")==c.getJSONObject("policy").getLong("revision"))check(same(p,c.getJSONObject("policy")));c.put("policy",p)}
            pin(endpoint(guest))
        }
        val sync=request("/_matrix/client/v3/sync?timeout=0"+(if(data.optString("since").isBlank())"" else "&since="+java.net.URLEncoder.encode(data.getString("since"),"UTF-8")))
        val events=sync.optJSONObject("to_device") ?: obj("events" to JSONArray())
        val raw=events.getJSONArray("events");val safe=JSONArray()
        // Never hand unencrypted events to the application. Exact outer device pin,
        // SDK Olm decryption and inner controller JWS must all agree.
        for(i in 0 until raw.length()) {
            val e=raw.getJSONObject(i)
            if(e.optString("type")=="m.room.encrypted" && entries().any{c->val ep=endpoint(c.getJSONObject("policy").getJSONObject("guest"));e.optString("sender")==ep.getString("user_id") && e.optJSONObject("content")?.optString("sender_key")==ep.getString("curve25519")})safe.put(e)
        }
        fun strings(a:JSONArray?)=if(a==null)emptyList() else (0 until a.length()).map(a::getString)
        val lists=sync.optJSONObject("device_lists") ?: JSONObject();val counts=sync.optJSONObject("device_one_time_keys_count") ?: JSONObject()
        val result=machine.receiveSyncChanges(obj("events" to safe).toString(),DeviceLists(strings(lists.optJSONArray("changed")),strings(lists.optJSONArray("left"))),counts.keys().asSequence().associateWith{counts.getInt(it)},strings(sync.optJSONArray("device_unused_fallback_key_types")),sync.getString("next_batch"),DecryptionSettings(TrustRequirement.UNTRUSTED))
        for(encoded in result.toDeviceEvents)runCatching {
            val event=JSONObject(encoded);check(event.getString("type")=="chat.veil.pilot")
            val c=entries().single{endpoint(it.getJSONObject("policy").getJSONObject("guest")).getString("user_id")==event.getString("sender")}
            val p=c.getJSONObject("policy");allowed(p);val guest=p.getJSONObject("guest");pin(endpoint(guest))
            val m=Core.verify(event.getJSONObject("content").getString("jws"),guest.getString("id"),"pi-matrix-message+jws")
            check(m.getString("iss")==guest.getString("id") && m.getString("recipient")==data.getString("owner") && m.getString("invitation")==c.getString("id"))
            check(m.getLong("expires")>now() && m.getLong("expires")<=p.getLong("expires") && m.getString("text").length in 1..4000)
            val seen=c.getJSONArray("seen");if((0 until seen.length()).any{seen.getString(it)==m.getString("id")})return@runCatching
            check(seen.length()<200 && (p.getString("status")=="approved" || seen.length()==0))
            seen.put(m.getString("id"));c.getJSONArray("messages").put(obj("id" to m.getString("id"),"text" to m.getString("text"),"mine" to false))
        }
        drain();data.put("since",sync.getString("next_batch"))
      }
    }
    fun decide(id:String,status:String) {
        require(status in setOf("approved","declined","blocked","revoked"));val c=conversations().getJSONObject(id);check(!c.has("decision_pending"))
        val p=JSONObject(c.getJSONObject("policy").toString());check(p.getString("status") in setOf("pending","approved"));check(p.getString("status")!="approved" || status!="approved")
        p.put("status",status).put("revision",p.getLong("revision")+1)
        c.put("policy",p).put("decision_pending",sign(p,"pi-matrix-policy+jws"));if(status!="approved")c.remove("outbox");save() // Locally effective before network, exact retry survives process death.
        pending(c);save()
    }
    fun reply(id:String,text:String) {
        require(text.isNotBlank() && text.length<=4000);val c=conversations().getJSONObject(id);check(!c.has("outbox") && !c.has("decision_pending"))
        enroll()
        crypto {
            val p=c.getJSONObject("policy");allowed(p);check(p.getString("status")=="approved");val guest=p.getJSONObject("guest");val e=endpoint(guest);pin(e)
            machine.getMissingSessions(listOf(e.getString("user_id")))?.let(::transmit)
            val expires=minOf(now()+3600,p.getLong("expires"));val mid=random()
            val token=sign(obj("v" to 1,"iss" to data.getString("owner"),"recipient" to guest.getString("id"),"invitation" to id,"id" to mid,"expires" to expires,"text" to text),"pi-matrix-message+jws")
            val r=checkNotNull(machine.createEncryptedToDeviceRequest(e.getString("user_id"),e.getString("device_id"),"chat.veil.pilot",obj("jws" to token).toString(),CollectStrategy.ONLY_TRUSTED_DEVICES))
            check(r is Request.ToDevice)
            c.put("outbox",obj("id" to r.requestId,"expires" to expires,"body" to obj("messages" to JSONObject(r.body))))
            c.getJSONArray("messages").put(obj("id" to mid,"text" to text,"mine" to true));c.put("receipt","Sending")
            // The SDK outgoing request is represented by our exact persisted outbox.
            machine.markRequestAsSent(r.requestId,RequestType.TO_DEVICE,"{}")
        }
        // Send only AFTER both ciphertext and ratchet checkpoint are durably committed.
        val out=c.getJSONObject("outbox");request("/_matrix/client/v3/sendToDevice/m.room.encrypted/"+out.getString("id"),"PUT",out.getJSONObject("body"));c.remove("outbox");c.put("receipt","Received by service");save()
    }
    fun snapshot():JSONObject {
        if(!data.has("owner"))return obj("configured" to false)
        val e=data.optString("enrollment");val link=if(e.isEmpty())"" else Core.verify(e,data.getString("owner"),"pi-matrix-enrollment+jws").let{data.getString("web")+"/contact#owner="+java.net.URLEncoder.encode(data.getString("owner"),"UTF-8")+"&invite="+it.getString("invite")}
        return obj("configured" to true,"link" to link,"conversations" to JSONArray(entries().map{c->obj("id" to c.getString("id"),"status" to (if(c.getJSONObject("policy").getLong("expires")<=now())"expired" else c.getJSONObject("policy").getString("status")),"pending" to (c.has("outbox") || c.has("decision_pending")),"receipt" to c.optString("receipt"),"messages" to c.getJSONArray("messages"))}))
    }
}
