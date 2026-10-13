package com.keep.local.next

import android.app.job.*
import android.content.*
import android.graphics.*
import android.media.MediaMetadataRetriever
import android.os.PowerManager
import android.os.SystemClock
import java.io.File
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.security.MessageDigest
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

object VisualIndex {
    const val JOB = 901
    fun enabled(c: Context) = c.getSharedPreferences("visual",0).getBoolean("enabled",false)
    fun setEnabled(c: Context, yes: Boolean) { c.getSharedPreferences("visual",0).edit().putBoolean("enabled",yes).apply()
        if (yes) schedule(c) else c.getSystemService(JobScheduler::class.java).cancel(JOB) }
    fun schedule(c: Context) {
        if (!enabled(c) || (!ModelPack.ready(c) && !AuthorizedLibrary.hasSources(c))) return
        val scheduler=c.getSystemService(JobScheduler::class.java)
        if (scheduler.getPendingJob(JOB)!=null) return
        scheduler.schedule(JobInfo.Builder(JOB, ComponentName(c, VisualIndexJob::class.java))
            .setRequiresBatteryNotLow(true).setRequiresStorageNotLow(true).setMinimumLatency(1000)
            .setBackoffCriteria(10000, JobInfo.BACKOFF_POLICY_LINEAR).build())
    }
    fun status(c: Context): String {
        val db=MemoryDb.get(c).readableDatabase
        return db.rawQuery("SELECT state,COUNT(*) FROM assets JOIN memories ON memories.id=assets.memory_id WHERE kind IN ('image','video') GROUP BY state",null).use { q ->
            buildList { while(q.moveToNext()) add("${q.getInt(1)} ${q.getString(0).replace('_',' ')}") }.joinToString(" · ")
        }
    }
    fun blob(v: FloatArray): ByteArray = ByteBuffer.allocate(v.size*4).order(ByteOrder.LITTLE_ENDIAN).apply { v.forEach { putFloat(it) } }.array()
    fun vector(v: ByteArray): FloatArray { require(v.size==2048); val b=ByteBuffer.wrap(v).order(ByteOrder.LITTLE_ENDIAN);return FloatArray(512){b.float} }
    fun thumbnail(c: Context,id: Long,ms: Long) = File(c.cacheDir,"visual/${id}_${ms}.jpg")
    @Synchronized fun clear(c: Context) {
        setEnabled(c,false)
        val prefs=c.getSharedPreferences("visual",0)
        prefs.edit().putLong("generation",prefs.getLong("generation",0)+1).commit()
        val db=MemoryDb.get(c).writableDatabase
        db.delete("representations","modality='visual'",null)
        db.execSQL("UPDATE assets SET state='not_indexed',next_ms=0,model_id=NULL,error=NULL")
        File(c.cacheDir,"visual").deleteRecursively()
    }
}

class VisualIndexJob : JobService() {
    private val worker=Executors.newSingleThreadExecutor()
    private var stopped=AtomicBoolean(false)
    override fun onStartJob(params: JobParameters): Boolean {
        stopped=AtomicBoolean(false);val stop=stopped
        worker.execute {
            var again=false
            try { if(VisualIndex.enabled(this)) {
                val deadline=SystemClock.elapsedRealtime()+25000
                while(!stop.get() && VisualIndex.enabled(this) && SystemClock.elapsedRealtime()<deadline) {
                    if(VoiceService.active || ScreenService.active || getSystemService(PowerManager::class.java).currentThermalStatus>=PowerManager.THERMAL_STATUS_SEVERE) {again=true;break}
                    if(!AuthorizedLibrary.step(this,stop))break
                    again=true
                }
                if(ModelPack.ready(this) && !stop.get() && !VoiceService.active && !ScreenService.active && SystemClock.elapsedRealtime()<deadline) ClipEncoder(this).use { engine ->
                    while(!stop.get() && VisualIndex.enabled(this) && SystemClock.elapsedRealtime()<deadline) {
                        if(VoiceService.active || ScreenService.active || getSystemService(PowerManager::class.java).currentThermalStatus>=PowerManager.THERMAL_STATUS_SEVERE) { again=true;break }
                        val db=MemoryDb.get(this).writableDatabase
                        val id=db.rawQuery("SELECT a.memory_id FROM assets a JOIN memories m ON m.id=a.memory_id WHERE m.kind IN ('image','video') AND a.state IN ('not_indexed','indexing') AND NOT EXISTS(SELECT 1 FROM source_items si JOIN library_sources ls ON ls.id=si.source_id WHERE si.memory_id=m.id AND (si.excluded=1 OR si.state='access_revoked' OR ls.enabled=0)) ORDER BY m.created_at LIMIT 1",null).use { if(it.moveToFirst())it.getLong(0) else null } ?: break
                        try { indexOne(this,id,engine,stop) } catch(e: SecurityException) {AuthorizedLibrary.invalidate(this,id)} catch(e: java.io.FileNotFoundException) {AuthorizedLibrary.invalidate(this,id)} catch(e: Exception) { if(!stop.get()) {db.execSQL("UPDATE assets SET state='error',error=? WHERE memory_id=?",arrayOf("Visual indexing failed",id));db.execSQL("UPDATE source_items SET state='failed',error='Visual indexing failed' WHERE memory_id=?",arrayOf(id))} }
                        again=true
                    }
                }
            } } catch(e: OutOfMemoryError) { again=false } catch(e: Exception) { again=false }
            finally { if(!stop.get()) jobFinished(params,again && VisualIndex.enabled(this)) }
        }
        return true
    }
    override fun onStopJob(params: JobParameters): Boolean { stopped.set(true); return VisualIndex.enabled(this) }
    override fun onDestroy() { stopped.set(true);worker.shutdownNow();super.onDestroy() }
    companion object {
        /** One bounded, durable step. Cancellation never advances its checkpoint. */
        fun indexOne(c: Context,id: Long,engine: VisualEncoder,stop: AtomicBoolean) {
            val generation=c.getSharedPreferences("visual",0).getLong("generation",0)
            val db=MemoryDb.get(c).writableDatabase
            val item=MemoryDb.get(c).get(id) ?: return
            val source=MediaSource.uri(c,item)
            if(MediaSource.external(item))db.execSQL("UPDATE source_items SET state='processing' WHERE memory_id=?",arrayOf(id))
            var ms=0L;var hash:String?=null
            db.rawQuery("SELECT next_ms,sha256 FROM assets WHERE memory_id=?",arrayOf(id.toString())).use { if(!it.moveToFirst())return;ms=it.getLong(0);hash=it.getString(1) }
            if(hash==null) {
                val digest=MessageDigest.getInstance("SHA-256")
                MediaSource.open(c,item).use { input -> val buf=ByteArray(65536);while(true){if(stop.get())return;val n=input.read(buf);if(n<0)break;digest.update(buf,0,n)} }
                hash=digest.digest().joinToString(""){"%02x".format(it)}
            }
            var duration=0L
            val bitmap=if(item.kind=="image") ImageDecoder.decodeBitmap(ImageDecoder.createSource(c.contentResolver,source)) { decoder,info,_ ->
                val scale=448f/maxOf(info.size.width,info.size.height);decoder.setTargetSize((info.size.width*scale).toInt().coerceAtLeast(1),(info.size.height*scale).toInt().coerceAtLeast(1));decoder.allocator=ImageDecoder.ALLOCATOR_SOFTWARE
            } else MediaMetadataRetriever().use { retriever ->
                retriever.setDataSource(c,source)
                duration=retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)?.toLongOrNull() ?: error("Duration unavailable")
                val w=retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_WIDTH)?.toIntOrNull() ?: 448
                val h=retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_HEIGHT)?.toIntOrNull() ?: 448
                val scale=448f/maxOf(w,h)
                retriever.getScaledFrameAtTime(ms.coerceAtMost((duration-1).coerceAtLeast(0))*1000,MediaMetadataRetriever.OPTION_CLOSEST,(w*scale).toInt().coerceAtLeast(1),(h*scale).toInt().coerceAtLeast(1)) ?: error("Frame unavailable")
            }
            try {
                if(stop.get()) return
                val embedding=engine.image(bitmap)
                if(stop.get()) return
                val next=if(item.kind=="image")1 else ms+2000
                val end=if(item.kind=="image")0 else minOf(ms+2000,duration)
                val thumb=VisualIndex.thumbnail(c,id,ms);thumb.parentFile!!.mkdirs()
                val small=Bitmap.createScaledBitmap(bitmap,160,(bitmap.height*160/bitmap.width).coerceAtLeast(1),true)
                try { thumb.outputStream().use { small.compress(Bitmap.CompressFormat.JPEG,75,it) } } finally { if(small!==bitmap)small.recycle() }
                synchronized(VisualIndex) {
                if(stop.get() || generation!=c.getSharedPreferences("visual",0).getLong("generation",0)) { thumb.delete(); return }
                db.beginTransaction()
                try {
                    if(MemoryDb.get(c).get(id)==null || (MediaSource.external(item)&&!AuthorizedLibrary.accessible(c,id))) { thumb.delete(); return }
                    db.insertWithOnConflict("representations",null,ContentValues().apply {
                        put("memory_id",id);put("modality","visual");put("model_id",engine.modelId);put("start_ms",ms);put("end_ms",end)
                        put("vector",VisualIndex.blob(embedding));put("created_at",System.currentTimeMillis())
                    },android.database.sqlite.SQLiteDatabase.CONFLICT_REPLACE)
                    db.execSQL("UPDATE assets SET sha256=?,state=?,next_ms=?,total_ms=?,model_id=?,error=NULL,updated_at=? WHERE memory_id=?",arrayOf(hash,if(item.kind=="image"||next>=duration)"ready" else "indexing",next,duration,engine.modelId,System.currentTimeMillis(),id))
                    db.execSQL("UPDATE source_items SET state=?,error=NULL WHERE memory_id=?",arrayOf(if(item.kind=="image"||next>=duration)"completed" else "processing",id))
                    db.setTransactionSuccessful()
                } finally {db.endTransaction()}
                }
            } finally {bitmap.recycle()}
        }
    }
}
