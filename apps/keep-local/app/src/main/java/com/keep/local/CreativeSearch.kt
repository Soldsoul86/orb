package com.keep.local.next

import android.content.Context

data class VisualHit(val id: Long,val startMs: Long,val endMs: Long,val similarity: Float)
data class CreativeResults(val items: List<MemoryItem>,val visual: Map<Long,VisualHit>,val textIds: Set<Long>,val message: String)
object CreativeSearch {
    fun search(c:Context,query:String,kind:String?):CreativeResults {
        AuthorizedLibrary.reconcile(c)
        val db=MemoryDb.get(c)
        val text=db.search(query,kind)
        if(query.isBlank() || !ModelPack.ready(c) || kind !in listOf(null,"image","video")) return CreativeResults(text, emptyMap(),text.map{it.id}.toSet(),if(!ModelPack.ready(c))"Visual model not installed · text search available" else "")
        val started=android.os.SystemClock.elapsedRealtime()
        val visual=try { ClipEncoder(c).use { rank(c,it.text(query),kind) } } catch(e:Exception) { return CreativeResults(text,emptyMap(),text.map{it.id}.toSet(),"Visual search unavailable: ${e.message}") }
        val ids=(visual.map{it.id}+text.map{it.id}).distinct().take(150)
        val byId=text.associateBy{it.id}
        val results=ids.mapNotNull{byId[it]?:db.get(it)}
        return CreativeResults(results,visual.associateBy{it.id},text.map{it.id}.toSet(),"Visual suggestions · ${android.os.SystemClock.elapsedRealtime()-started} ms · similarity is not certainty")
    }
    fun rank(c:Context,query:FloatArray,kind:String?=null):List<VisualHit> {
        val best=mutableMapOf<Long,VisualHit>()
        val args=mutableListOf(ModelPack.ID);if(kind!=null)args.add(kind)
        MemoryDb.get(c).readableDatabase.rawQuery("SELECT r.memory_id,r.start_ms,r.end_ms,r.vector FROM representations r JOIN memories m ON m.id=r.memory_id WHERE NOT EXISTS(SELECT 1 FROM source_items si JOIN library_sources ls ON ls.id=si.source_id WHERE si.memory_id=m.id AND (si.excluded=1 OR si.state='access_revoked' OR ls.enabled=0)) AND r.modality='visual' AND r.model_id=?"+(if(kind!=null)" AND m.kind=?" else ""),args.toTypedArray()).use { rows ->
            while(rows.moveToNext()) {
                val score=ClipEncoder.cosine(query,VisualIndex.vector(rows.getBlob(3)))
                val hit=VisualHit(rows.getLong(0),rows.getLong(1),rows.getLong(2),score)
                if(score>=.18f && score>(best[hit.id]?.similarity ?: -1f))best[hit.id]=hit
                if(best.size>300) { val keep=best.values.sortedByDescending{it.similarity}.take(150);best.clear();keep.forEach{best[it.id]=it} }
            }
        }
        return best.values.sortedByDescending{it.similarity}.take(30)
    }
}
