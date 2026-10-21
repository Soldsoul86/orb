package org.portableidentity.core

import org.json.JSONObject
import org.json.JSONArray
import com.nimbusds.jose.*
import com.nimbusds.jose.crypto.ECDSASigner
import com.nimbusds.jose.jwk.ECKey
import java.net.URI
import java.text.Normalizer

/** Optional pi/1 publication format; the same ES256 keys/JOSE suite, no message crypto. */
object DiscoveryPublication {
    const val TYPE="pi-discovery+jws"
    val tags=linkedMapOf(
        "BUILD & AUTOMATE" to setOf("website","web-app","android","ios","automation","api","ai-integration","dashboard"),
        "DESIGN & CREATE" to setOf("ui","ux","branding","logo","graphic-design","presentation","video","motion"),
        "MARKET & GROW" to setOf("seo","content","social","copywriting","ads","analytics","positioning"),
        "LEARN & IMPROVE" to setOf("python","coding","sql","spanish","english","software-skills","coaching"))
    private fun keys(j:JSONObject)=j.keys().asSequence().toSet()
    private fun text(v:Any,max:Int):String {
        require(v is String && v.isNotBlank() && v==v.trim() && v.length<=max && Normalizer.isNormalized(v,Normalizer.Form.NFC))
        require(v.none {Character.getType(it) in setOf(Character.CONTROL.toInt(),Character.FORMAT.toInt(),Character.SURROGATE.toInt())})
        return v
    }
    private fun number(v:Any,min:Long,max:Long):Long {require(v is Int || v is Long);val n=(v as Number).toLong();require(n in min..max);return n}
    private fun list(a:JSONArray,max:Int,validate:(Any)->Unit) {require(a.length()<=max);val xs=(0 until a.length()).map(a::get);require(xs.map(::canonical).distinct().size==xs.size);xs.forEach(validate)}
    fun request(raw:String):JSONObject {
        require(raw.length<=12000)
        val r=JSONObject(raw);require(keys(r)==setOf("v","visibility","profile") || keys(r)==setOf("v","visibility","profile","pause"))
        require(r.get("v")==1 && r.getString("visibility") in setOf("PRIVATE","LINK_ONLY","PUBLIC","DELETED"))
        if(r.has("pause"))require(r.get("pause")==true && r.getString("visibility")=="PUBLIC")
        val p=r.getJSONObject("profile")
        if(r.getString("visibility") in setOf("PRIVATE","DELETED")){require(p.length()==0);return r}
        val required=setOf("alias","purpose","category","tags")
        require(keys(p).containsAll(required) && (keys(p)-required-setOf("languages","locations","remote","evidence","accepting","budget","lead_days")).isEmpty())
        text(p.get("alias"),60);text(p.get("purpose"),240)
        val category=p.getString("category");require(category in tags)
        val ts=p.getJSONArray("tags");require(ts.length()>0);list(ts,8){require(it in tags.getValue(category))}
        if(p.has("languages"))list(p.getJSONArray("languages"),7){require(it in setOf("english","spanish","french","german","hindi","arabic","portuguese"))}
        if(p.has("locations"))list(p.getJSONArray("locations"),5){text(it,60)}
        listOf("remote","accepting").forEach {if(p.has(it))require(p.get(it) is Boolean)}
        if(p.has("lead_days"))number(p.get("lead_days"),0,365)
        if(p.has("evidence"))list(p.getJSONArray("evidence"),3){v ->
            require(v is JSONObject && keys(v)==setOf("title","url"));text(v.get("title"),100)
            val u=URI(text(v.get("url"),1000));require(u.scheme=="https" && u.host?.contains('.')==true && u.userInfo==null)
        }
        if(p.has("budget")){val b=p.getJSONObject("budget");require(keys(b)==setOf("min","max","currency","unit"));require(b.getString("currency") in setOf("USD","EUR","GBP","INR") && b.getString("unit") in setOf("project","hour"));number(b.get("max"),number(b.get("min"),0,10000000),10000000)}
        if(r.optBoolean("pause"))require(p.opt("accepting")==false)
        return r
    }
    private fun quote(s:String):String = buildString {
        append('"');s.forEach {c -> when(c){'"'->append("\\\"");'\\'->append("\\\\");'\b'->append("\\b");'\u000c'->append("\\f");'\n'->append("\\n");'\r'->append("\\r");'\t'->append("\\t");else->if(c<' ')append("\\u%04x".format(c.code)) else append(c)}};append('"')
    }
    fun canonical(v:Any?):String = when(v){
        null,JSONObject.NULL->"null"
        is JSONObject->keys(v).sorted().joinToString(",","{","}"){quote(it)+":"+canonical(v.get(it))}
        is JSONArray->(0 until v.length()).joinToString(",","[","]"){canonical(v.get(it))}
        is String->quote(v)
        is Boolean,is Int,is Long->v.toString()
        else->error("Only integer JSON values are supported")
    }
    fun sign(body:JSONObject,privateKey:JSONObject):String {
        require(body.getString("controller")==IdentityCore.id(privateKey))
        val bytes=canonical(body);require(bytes.toByteArray().size<=24000)
        val key=ECKey.parse(privateKey.toString())
        return JWSObject(JWSHeader.Builder(JWSAlgorithm.ES256).type(JOSEObjectType(TYPE)).jwk(key.toPublicJWK()).build(),Payload(bytes)).also {it.sign(ECDSASigner(key))}.serialize()
    }
}
