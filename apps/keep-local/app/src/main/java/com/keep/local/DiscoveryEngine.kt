package com.keep.local.next

import android.content.Context
import android.os.SystemClock
import java.text.DateFormat
import java.util.Date
import java.util.concurrent.atomic.AtomicBoolean

/** Small deterministic proposal batches over actual text, metadata and CLIP evidence. */
object DiscoveryEngine {
    private fun db(c:Context)=MemoryDb.get(c).readableDatabase
    fun generate(c:Context,stop:AtomicBoolean=AtomicBoolean(false)):Long {
        val started=SystemClock.elapsedRealtime()
        if(stop.get()||VoiceService.active||ScreenService.active||c.getSystemService(android.os.PowerManager::class.java).currentThermalStatus>=android.os.PowerManager.THERMAL_STATUS_SEVERE)return 0
        documents(c,stop);if(!stop.get())experiences(c);if(!stop.get())reusable(c)
        return SystemClock.elapsedRealtime()-started
    }
    private fun documents(c:Context,stop:AtomicBoolean){
        val prefs=c.getSharedPreferences("discovery",0);val after=prefs.getLong("document_cursor",0);var last=0L
        db(c).rawQuery("SELECT id FROM memories WHERE id>? AND kind IN ('file','note') AND (extracted<>'' OR (kind='note' AND body<>'')) AND ${LibrarySchema.VISIBLE} ORDER BY id LIMIT 100",arrayOf(after.toString())).use{r->while(!stop.get()&&r.moveToNext()){
            last=r.getLong(0);val item=MemoryDb.get(c).get(last)?:continue
            val hint=DiscoveryRules.document(if(item.kind=="note")item.body else item.extracted)?:continue
            val evidence=Discoveries.evidence(c,last,"document",excerpt=hint.excerpt)?:continue
            Discoveries.propose(c,"document",hint.title,hint.reason,"Possible usefulness, not a factual classification. OCR may be wrong; inspect the original.",listOf(evidence))
        }}
        prefs.edit().putLong("document_cursor",last).apply()
        if(last==0L && after>0 && !stop.get())documents(c,stop) // wrap after deletions or a completed page cycle
    }
    private data class Timed(val id:Long,val time:Long,val folder:String,val hash:String)
    private fun experiences(c:Context){
        val prefs=c.getSharedPreferences("discovery",0);val after=prefs.getLong("experience_cursor",0)
        val rows=db(c).rawQuery("SELECT si.memory_id,si.content_time,si.group_path,a.sha256 FROM source_items si JOIN assets a ON a.memory_id=si.memory_id JOIN memories ON memories.id=si.memory_id WHERE si.memory_id>? AND si.time_basis='capture_time' AND si.content_time>0 AND memories.kind IN ('image','video') AND ${LibrarySchema.VISIBLE} ORDER BY si.memory_id LIMIT 200",arrayOf(after.toString())).use{r->buildList{while(r.moveToNext())add(Timed(r.getLong(0),r.getLong(1),r.getString(2),r.getString(3).orEmpty()))}}
        prefs.edit().putLong("experience_cursor",rows.lastOrNull()?.id?:0).apply()
        if(rows.isEmpty() && after>0){experiences(c);return}
        var proposed=0
        for((folder,assets) in rows.groupBy{it.folder}){
            if(folder.isBlank())continue
            val sorted=assets.distinctBy{it.hash.ifBlank{it.id.toString()}}.sortedBy{it.time};var start=0
            while(start<sorted.size && proposed<5){
                val group=sorted.drop(start).takeWhile{it.time-sorted[start].time<=10*60*1000L}.take(12)
                start+=group.size
                if(group.size<3)continue
                val evidence=group.mapNotNull{a->Discoveries.evidence(c,a.id,"experience",excerpt="Capture time metadata: ${DateFormat.getDateTimeInstance().format(Date(a.time))}\nFolder: $folder")}
                if(evidence.size>=3){Discoveries.propose(c,"experience","These ${evidence.size} files may belong to one experience.","Capture timestamps are within 10 minutes and the files share a folder. They may be useful to review together.","A grouping hypothesis only. No trip, location, identity or activity has been inferred.",evidence);proposed++}
            }
        }
    }
    private data class Frame(val row:Long,val id:Long,val start:Long,val end:Long,val vector:FloatArray,val hash:String)
    private fun readFrames(c:Context,sql:String,args:Array<String>?=null)=db(c).rawQuery(sql,args).use{r->buildList{while(r.moveToNext())add(Frame(r.getLong(0),r.getLong(1),r.getLong(2),r.getLong(3),VisualIndex.vector(r.getBlob(4)),r.getString(5).orEmpty()))}}
    private fun reusable(c:Context){
        val prefs=c.getSharedPreferences("discovery",0);val after=prefs.getLong("visual_cursor",0)
        val base="SELECT r.id,r.memory_id,r.start_ms,r.end_ms,r.vector,a.sha256 FROM representations r JOIN assets a ON a.memory_id=r.memory_id JOIN memories ON memories.id=r.memory_id WHERE r.modality='visual' AND r.model_id='${ModelPack.ID}' AND ${LibrarySchema.VISIBLE}"
        val anchors=readFrames(c,"$base AND r.id>? ORDER BY r.id LIMIT 160",arrayOf(after.toString()))
        prefs.edit().putLong("visual_cursor",anchors.lastOrNull()?.row?:0).apply()
        if(anchors.isEmpty() && after>0){reusable(c);return}
        // Bounded candidate bank: first/last sampled frame of up to 128 recent assets.
        // Anchors page through every frame. This is approximate, not all-pairs retrieval.
        val bank=readFrames(c,"$base AND r.id IN (SELECT MIN(id) FROM representations WHERE modality='visual' GROUP BY memory_id UNION SELECT MAX(id) FROM representations WHERE modality='visual' GROUP BY memory_id) ORDER BY r.memory_id DESC LIMIT 256")
        val best=mutableMapOf<String,Triple<Frame,Frame,Float>>()
        for(a in anchors)for(b in bank){
            if(a.id==b.id || a.hash.isBlank() || a.hash==b.hash)continue // byte-identical copies are not new discoveries
            val score=ClipEncoder.cosine(a.vector,b.vector);if(score<.88f)continue
            val key="${minOf(a.id,b.id)}:${maxOf(a.id,b.id)}"
            if(score>(best[key]?.third?:-1f))best[key]=Triple(a,b,score)
        }
        for((a,b,score) in best.values.sortedByDescending{it.third}.take(5)){
            val evidence=listOf(a,b).mapNotNull{f->Discoveries.evidence(c,f.id,"reusable",f.start,f.end,"Sampled image pixels · CLIP cosine similarity ${"%.3f".format(java.util.Locale.ROOT,score)}")}
            if(evidence.size==2)Discoveries.propose(c,"reusable","Visually similar material to reuse.","These image/frame embeddings are similar. The originals may be useful together in a creation.","Sampled-frame similarity does not prove an activity, identity or complete scene. The score is not a probability.",evidence,score)
        }
    }
}
