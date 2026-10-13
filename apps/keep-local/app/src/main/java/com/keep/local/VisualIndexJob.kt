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
        if (yes) schedule(c) else { IndexProgress.activeStop?.set(true); c.getSystemService(JobScheduler::class.java).cancel(JOB) } }
    fun schedule(c: Context, delay:Long=1000, replace:Boolean=false) {
        if (!enabled(c) || (!ModelPack.ready(c) && !AuthorizedLibrary.hasSources(c) && !MemoryDb.get(c).readableDatabase.rawQuery("SELECT 1 FROM memories WHERE kind='file' LIMIT 1",null).use{it.moveToFirst()})) return
        val scheduler=c.getSystemService(JobScheduler::class.java)
        val pending=scheduler.getPendingJob(JOB)
        if (!replace && pending!=null && !pending.extras.getBoolean("rescan",false)) return
        scheduler.schedule(JobInfo.Builder(JOB, ComponentName(c, VisualIndexJob::class.java))
            .setRequiresBatteryNotLow(true).setRequiresStorageNotLow(true).setMinimumLatency(delay.coerceAtLeast(1000))
            .setBackoffCriteria(10000, JobInfo.BACKOFF_POLICY_LINEAR).build())
    }
    fun scheduleRescan(c:Context) {
        if(!enabled(c)||!AuthorizedLibrary.hasSources(c))return
        val extras=android.os.PersistableBundle().apply{putBoolean("rescan",true)}
        c.getSystemService(JobScheduler::class.java).schedule(JobInfo.Builder(JOB,ComponentName(c,VisualIndexJob::class.java)).setExtras(extras).setRequiresBatteryNotLow(true).setRequiresStorageNotLow(true).setMinimumLatency(30*60*1000L).build())
    }
    fun status(c: Context): String {
        val rows=IndexProgress.counts(c)
        return "${rows.sumOf{it.basic}} basic searchable · ${rows.sumOf{it.fully}} fully indexed · ${rows.sumOf{it.waiting+it.partial}} awaiting deep processing"
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
        db.delete("discoveries","type='reusable'",null)
        db.execSQL("UPDATE assets SET state='not_indexed',next_ms=0,model_id=NULL,error=NULL")
        File(c.cacheDir,"visual").deleteRecursively()
    }
}

/** Constrained, finite JobScheduler batches. Successful continuation is not a failed job. */
class VisualIndexJob : JobService() {
    private val worker=Executors.newSingleThreadExecutor()
    private var stopped=AtomicBoolean(false)
    override fun onStartJob(params: JobParameters): Boolean {
        stopped=AtomicBoolean(false);val stop=stopped
        worker.execute {
            var more=false;var defer=false;var engine:VisualEncoder?=null
            IndexProgress.activeStop=stop;IndexProgress.running=true
            try { if(VisualIndex.enabled(this)) {
                AuthorizedLibrary.reconcile(this)
                if(params.extras.getBoolean("rescan",false)) AuthorizedLibrary.rescan(this,wake=false)
                // Well below JobScheduler's execution limit. Reuse one model across fair rounds.
                val deadline=SystemClock.elapsedRealtime()+120000
                while(!stop.get() && VisualIndex.enabled(this) && SystemClock.elapsedRealtime()<deadline) {
                    if(IndexPipeline.restricted(this)){defer=true;break}
                    more=IndexPipeline.round(this,stop) {
                        engine ?: ClipEncoder(this).also{engine=it}
                    }
                    if(!more)break
                }
                // Context/suggestions use already committed evidence; do not run while paused.
                if(!stop.get()&&VisualIndex.enabled(this)&&!IndexPipeline.restricted(this)) {
                    engine?.close();engine=null
                    IndexProgress.phase(this,"Connecting committed evidence")
                    DiscoveryEngine.generate(this,stop)
                }
            } } catch(e:IndexDeferred){defer=true}
            catch(e:OutOfMemoryError){defer=true;IndexProgress.problem(this,"Memory pressure; postponed")}
            catch(e:Exception){defer=true;IndexProgress.problem(this,"Worker: "+e.javaClass.simpleName)}
            finally {
                runCatching{engine?.close()}
                if(IndexProgress.activeStop===stop){IndexProgress.activeStop=null;IndexProgress.activeId=null;IndexProgress.running=false}
                if(!stop.get()) {
                    // Never request Android's growing failure backoff after useful processing.
                    jobFinished(params,false)
                    if(VisualIndex.enabled(this)) {
                        val retry=IndexProgress.retryDelay(this)
                        when{defer->VisualIndex.schedule(this,60_000,replace=true);more->VisualIndex.schedule(this,replace=true);retry!=null->VisualIndex.schedule(this,retry,replace=true);else->VisualIndex.scheduleRescan(this)}
                    }
                }
            }
        }
        return true
    }
    override fun onStopJob(params: JobParameters): Boolean { stopped.set(true); return VisualIndex.enabled(this) }
    override fun onDestroy() { stopped.set(true);worker.shutdown();super.onDestroy() }
    companion object {
        /** One bounded, durable step. Cancellation never advances its checkpoint. */
        fun indexOne(c: Context,id: Long,engine: VisualEncoder,stop: AtomicBoolean) {
            val started=SystemClock.elapsedRealtime()
            IndexProgress.phase(c,"Processing one image / video checkpoint",id)
            val generation=c.getSharedPreferences("visual",0).getLong("generation",0)
            val db=MemoryDb.get(c).writableDatabase
            val item=MemoryDb.get(c).get(id) ?: return
            val source=MediaSource.uri(c,item)
            if(MediaSource.external(item))db.execSQL("UPDATE source_items SET state='processing' WHERE memory_id=?",arrayOf(id))
            var ms=0L;var hash:String?=null
            // Optional original-capture metadata is enrichment, never inventory I/O.
            val needsCapture=MediaSource.external(item)&&item.kind=="image"&&db.rawQuery("SELECT 1 FROM source_items WHERE memory_id=? AND time_basis NOT IN ('capture_time','exif_local_time')",arrayOf(id.toString())).use{it.moveToFirst()}
            val capture=if(needsCapture)CaptureMetadata.read(c,source)else null
            db.rawQuery("SELECT next_ms,sha256 FROM assets WHERE memory_id=?",arrayOf(id.toString())).use { if(!it.moveToFirst())return;ms=it.getLong(0);hash=it.getString(1) }
            if(hash==null) {
                val digest=MessageDigest.getInstance("SHA-256")
                MediaSource.open(c,item).use { input -> val buf=ByteArray(65536);while(true){if(stop.get())return;if(VoiceService.active||ScreenService.active||c.getSystemService(PowerManager::class.java).currentThermalStatus>=PowerManager.THERMAL_STATUS_SEVERE)throw IndexDeferred();val n=input.read(buf);if(n<0)break;digest.update(buf,0,n)} }
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
                    if(capture!=null)db.execSQL("UPDATE source_items SET content_time=?,time_basis=? WHERE memory_id=?",arrayOf(capture.time,capture.basis,id))
                    IndexProgress.committed(c,id,"visual",SystemClock.elapsedRealtime()-started,item.kind=="image"||next>=duration)
                    db.setTransactionSuccessful()
                } finally {db.endTransaction()}
                }
            } finally {bitmap.recycle()}
        }
    }
}
