package com.keep.local.next

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import java.security.MessageDigest

data class DiscoveryEvidence(val id:Long,val uuid:String,val source:String,val revision:String,val start:Long=0,val end:Long=0,val excerpt:String="")
data class Discovery(val id:String,val type:String,val suggestion:String,val reason:String,val uncertainty:String,val score:Float?,val created:Long,val version:String,val status:String,val correction:String,val evidence:List<DiscoveryEvidence>)

object Discoveries {
    const val VERSION="literal-and-pair-rules-0.4.0/clip-vit-b32-int8-v1"
    private fun db(c:Context)=MemoryDb.get(c).writableDatabase
    fun hash(value:String)=MessageDigest.getInstance("SHA-256").digest(value.toByteArray()).joinToString(""){"%02x".format(it)}
    fun revision(c:Context,item:MemoryItem,type:String):String {
        if(type=="document")return hash(if(item.kind=="note")item.body else item.extracted)
        return db(c).rawQuery("SELECT a.sha256,si.content_time,si.group_path,si.time_basis FROM assets a LEFT JOIN source_items si ON si.memory_id=a.memory_id WHERE a.memory_id=?",arrayOf(item.id.toString())).use{r->
            if(!r.moveToFirst())return@use "missing"
            if(type=="experience")hash("${r.getLong(1)}:${r.getString(2)}:${r.getString(3)}")else r.getString(0)?:"not-indexed"
        }
    }
    fun evidence(c:Context,id:Long,type:String,start:Long=0,end:Long=0,excerpt:String=""):DiscoveryEvidence? {
        val item=MemoryDb.get(c).get(id)?:return null
        if(!CreativeSearch.available(c,item))return null
        if(item.path!=null && runCatching{MediaSource.check(c,item)}.isFailure)return null
        val uuid=db(c).rawQuery("SELECT asset_uuid FROM assets WHERE memory_id=?",arrayOf(id.toString())).use{if(it.moveToFirst())it.getString(0)else null}?:return null
        return DiscoveryEvidence(id,uuid,if(MediaSource.external(item))item.path!! else AppFiles.itemUri(id).toString(),revision(c,item,type),start,end,excerpt)
    }
    /** Exact-key and evidence-subset suppression survive index removal and rescans. */
    fun propose(c:Context,type:String,suggestion:String,reason:String,uncertainty:String,evidence:List<DiscoveryEvidence>,score:Float?=null):String? = synchronized(VisualIndex) {
        if(evidence.isEmpty() || evidence.any{MemoryDb.get(c).get(it.id)==null})return@synchronized null
        val d=db(c)
        val key=hash(type+":"+if(type=="document")evidence.first().revision else if(type=="reusable")evidence.map{it.revision}.sorted().joinToString("|") else evidence.sortedBy{it.uuid}.joinToString("|"){it.uuid+":"+it.revision})
        if(d.rawQuery("SELECT 1 FROM discoveries WHERE id=?",arrayOf(key)).use{it.moveToFirst()})return@synchronized key
        val suppressed=evidence.all{e->d.rawQuery("SELECT 1 FROM dismissed_evidence WHERE type=? AND asset_uuid=? AND revision=?",arrayOf(type,e.uuid,e.revision)).use{it.moveToFirst()}}
        val dismissed=d.rawQuery("SELECT 1 FROM review_state WHERE discovery_id=? AND status='dismissed'",arrayOf(key)).use{it.moveToFirst()}
        if(suppressed||dismissed)return@synchronized null
        val queue=d.rawQuery("SELECT COUNT(*) FROM discoveries d LEFT JOIN review_state r ON r.discovery_id=d.id WHERE r.status IS NULL",null).use{it.moveToFirst();it.getInt(0)}
        if(queue>=20)return@synchronized null
        d.beginTransaction();try {
            // Check again inside the same lock used by revocation/deletion handling.
            if(evidence.any{e->val current=Discoveries.evidence(c,e.id,type,e.start,e.end,e.excerpt);current==null||current.uuid!=e.uuid||current.source!=e.source||current.revision!=e.revision||(type=="document"&&e.excerpt.lineSequence().filter{it.isNotBlank()}.any{line->val item=MemoryDb.get(c).get(e.id)!!;line !in (if(item.kind=="note")item.body else item.extracted)})})return@synchronized null
            d.insertOrThrow("discoveries",null,ContentValues().apply{put("id",key);put("type",type);put("suggestion",suggestion);put("reason",reason);put("uncertainty",uncertainty);if(score!=null)put("score",score);put("created_at",System.currentTimeMillis());put("version",when(type){"document"->"literal-document-rules-0.4.0";"experience"->"capture-metadata-rules-0.4.0";else->VERSION})})
            evidence.forEach{e->d.insertOrThrow("discovery_evidence",null,ContentValues().apply{put("discovery_id",key);put("memory_id",e.id);put("asset_uuid",e.uuid);put("source_ref",e.source);put("revision",e.revision);put("start_ms",e.start);put("end_ms",e.end);put("excerpt",e.excerpt)})}
            d.setTransactionSuccessful();key
        }finally{d.endTransaction()}
    }
    fun get(c:Context,id:String):Discovery? {
        val d=db(c)
        val e=d.rawQuery("SELECT memory_id,asset_uuid,source_ref,revision,start_ms,end_ms,excerpt FROM discovery_evidence WHERE discovery_id=? ORDER BY memory_id,start_ms",arrayOf(id)).use{r->buildList{while(r.moveToNext())add(DiscoveryEvidence(r.getLong(0),r.getString(1),r.getString(2),r.getString(3),r.getLong(4),r.getLong(5),r.getString(6)))}}
        return d.rawQuery("SELECT d.*,COALESCE(r.status,'suggested') AS review_status,COALESCE(r.correction,'') AS user_correction FROM discoveries d LEFT JOIN review_state r ON r.discovery_id=d.id WHERE d.id=?",arrayOf(id)).use{r->if(!r.moveToFirst())null else Discovery(id,r.getString(1),r.getString(2),r.getString(3),r.getString(4),if(r.isNull(5))null else r.getFloat(5),r.getLong(6),r.getString(7),r.getString(8),r.getString(9),e)}
    }
    fun valid(c:Context,d:Discovery):Boolean {
        val minimum=if(d.type=="document")1 else 2
        return d.evidence.size>=minimum && d.evidence.all{e->val item=MemoryDb.get(c).get(e.id);item!=null&&CreativeSearch.available(c,item)&&(item.path==null||runCatching{MediaSource.check(c,item)}.isSuccess)&&revision(c,item,d.type)==e.revision&&e.source==(if(MediaSource.external(item))item.path else AppFiles.itemUri(item.id).toString())&&db(c).rawQuery("SELECT 1 FROM assets WHERE memory_id=? AND asset_uuid=?",arrayOf(e.id.toString(),e.uuid)).use{it.moveToFirst()}&&(d.type!="reusable"||db(c).rawQuery("SELECT 1 FROM representations WHERE memory_id=? AND modality='visual' AND start_ms=? AND end_ms=? AND model_id=?",arrayOf(e.id.toString(),e.start.toString(),e.end.toString(),ModelPack.ID)).use{it.moveToFirst()})}
    }
    fun list(c:Context,history:Boolean=false):List<Discovery> {
        AuthorizedLibrary.reconcile(c)
        val ids=db(c).rawQuery("SELECT d.id FROM discoveries d LEFT JOIN review_state r ON r.discovery_id=d.id WHERE "+(if(history)"r.status IS NOT NULL" else "r.status IS NULL")+" ORDER BY CASE d.type WHEN 'document' THEN 0 WHEN 'experience' THEN 1 ELSE 2 END,d.created_at DESC LIMIT 40",null).use{r->buildList{while(r.moveToNext())add(r.getString(0))}}
        return ids.mapNotNull{get(c,it)}.filter{d->if(valid(c,d))true else {db(c).delete("discoveries","id=?",arrayOf(d.id));false}}.take(if(history)40 else 12)
    }
    fun review(c:Context,id:String,status:String,feedback:String,correction:String="")=synchronized(VisualIndex){
        require(status in listOf("kept","corrected","dismissed","share_requested"))
        require(feedback in listOf("relevant","incorrect_relationship","duplicate","uninteresting","useful_content","corrected_information"))
        require(status!="corrected"||correction.isNotBlank())
        val record=get(c,id)?:error("Suggestion unavailable");check(valid(c,record)){"Sources changed or access was revoked"}
        val d=db(c);val now=System.currentTimeMillis();d.beginTransaction();try {
            if(status!="share_requested")d.insertWithOnConflict("review_state",null,ContentValues().apply{put("discovery_id",id);put("status",status);put("feedback",feedback);put("correction",correction.take(4000));put("reviewed_at",now)},SQLiteDatabase.CONFLICT_REPLACE)
            d.insertOrThrow("review_events",null,ContentValues().apply{put("discovery_id",id);put("action",status);put("feedback",feedback);put("correction",correction.take(4000));put("created_at",now)})
            if(status in listOf("kept","corrected"))record.evidence.forEach{e->d.delete("dismissed_evidence","type=? AND asset_uuid=? AND revision=?",arrayOf(record.type,e.uuid,e.revision))}
            if(status=="dismissed")record.evidence.forEach{e->d.execSQL("INSERT OR IGNORE INTO dismissed_evidence VALUES(?,?,?)",arrayOf(record.type,e.uuid,e.revision))}
            d.setTransactionSuccessful()
        }finally{d.endTransaction()}
    }
    fun metrics(c:Context):Pair<Int,Int> {
        val indexed=db(c).rawQuery("SELECT COUNT(*) FROM assets JOIN memories ON memories.id=assets.memory_id WHERE (assets.state='ready' OR (memories.kind='note' AND memories.body<>'')) AND ${LibrarySchema.VISIBLE}",null).use{it.moveToFirst();it.getInt(0)}
        val accepted=db(c).rawQuery("SELECT COUNT(DISTINCT e.discovery_id) FROM review_events e JOIN discoveries d ON d.id=e.discovery_id LEFT JOIN review_state r ON r.discovery_id=d.id WHERE e.action IN ('kept','corrected','share_requested') AND COALESCE(r.status,'suggested')<>'dismissed' AND NOT EXISTS(SELECT 1 FROM discovery_evidence de JOIN assets a ON a.memory_id=de.memory_id JOIN memories m ON m.id=a.memory_id WHERE de.discovery_id=d.id AND a.state<>'ready' AND m.kind<>'note')",null).use{it.moveToFirst();it.getInt(0)}
        return accepted to indexed
    }
}
