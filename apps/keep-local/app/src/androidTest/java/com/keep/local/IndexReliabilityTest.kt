package com.keep.local.next

import android.content.ContentValues
import android.graphics.Bitmap
import android.provider.MediaStore
import android.os.SystemClock
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.json.JSONObject
import java.io.File
import java.util.concurrent.atomic.AtomicBoolean

@RunWith(AndroidJUnit4::class)
class IndexReliabilityTest {
    private val inst=InstrumentationRegistry.getInstrumentation()
    private val c=inst.targetContext
    private val d get()=MemoryDb.get(c).writableDatabase
    private fun value(sql:String)=d.rawQuery(sql,null).use{it.moveToFirst();it.getLong(0)}
    @Test fun tenThousandRecordsDoNotStarveRealImageOrDocumentProcessing(){
        VisualIndex.setEnabled(c,false)
        AuthorizedLibrary.permissions("image").filter{!it.endsWith("VISUAL_USER_SELECTED")}.forEach{inst.uiAutomation.grantRuntimePermission(c.packageName,it)}
        val image=File(c.filesDir,"media/scale-original.jpg").apply{parentFile!!.mkdirs();inst.context.assets.open("a.jpg").use{input->outputStream().use{input.copyTo(it)}}}
        val document=File(c.filesDir,"media/scale-original.txt").apply{writeText("Scale regression receipt 2031-07-08")}
        val originals=mutableListOf<android.net.Uri>()
        val bytesBefore=c.getDatabasePath("memories.db").length()+File(c.getDatabasePath("memories.db").path+"-wal").length()
        val seeded=SystemClock.elapsedRealtime()
        try {
            d.beginTransaction();try{
                repeat(10000){i->val id=MemoryDb.get(c).add("image","scale-synthetic-$i",path="media/scale-original.jpg",mime="image/jpeg");d.execSQL("UPDATE assets SET updated_at=-100 WHERE memory_id=?",arrayOf(id))}
                val doc=MemoryDb.get(c).add("file","scale-document",path="media/scale-original.txt",mime="text/plain");d.execSQL("UPDATE assets SET updated_at=-100 WHERE memory_id=?",arrayOf(doc))
                d.setTransactionSuccessful()
            }finally{d.endTransaction()}
            val seedMs=SystemClock.elapsedRealtime()-seeded
            repeat(205){i->
                val uri=c.contentResolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI,ContentValues().apply{put("_display_name","scale-inventory-$i.jpg");put("mime_type","image/jpeg");put("relative_path","Pictures/KeepLocalScale/");put("is_pending",1)})!!
                originals.add(uri)
                c.contentResolver.openOutputStream(uri)!!.use{out->image.inputStream().use{it.copyTo(out)}}
                c.contentResolver.update(uri,ContentValues().apply{put("is_pending",0)},null,null)
            }
            val source=AuthorizedLibrary.enableMedia(c,"image")
            // Replay the old scan-first policy: its next work unit only inventories files.
            val eventsBefore=value("SELECT count(*) FROM index_events")
            AuthorizedLibrary.step(c,AtomicBoolean(false))
            assertEquals(eventsBefore,value("SELECT count(*) FROM index_events"))
            assertEquals(0L,value("SELECT count(*) FROM assets a JOIN memories m ON m.id=a.memory_id WHERE m.title LIKE 'scale-%' AND a.state='ready'"))
            val cursor=value("SELECT cursor FROM library_sources WHERE id=$source")
            val epoch=value("SELECT scan_epoch FROM library_sources WHERE id=$source")
            VisualIndex.setEnabled(c,true);VisualIndex.setEnabled(c,false)
            assertEquals("Resume must not restart enumeration",cursor,value("SELECT cursor FROM library_sources WHERE id=$source"))
            AuthorizedLibrary.rescan(c,source,wake=false)
            assertEquals("Rescan cannot discard an unfinished scan",epoch,value("SELECT scan_epoch FROM library_sources WHERE id=$source"))
            val start=SystemClock.elapsedRealtime()
            ClipEncoder(c).use{engine->assertTrue(IndexPipeline.round(c,AtomicBoolean(false)){engine})}
            val roundMs=SystemClock.elapsedRealtime()-start
            assertTrue(value("SELECT count(*) FROM source_items WHERE source_id=$source")>=200)
            assertEquals(1L,value("SELECT count(*) FROM library_sources WHERE id=$source AND status='processing'"))
            assertTrue("Visual completion must happen before inventory drains",value("SELECT count(*) FROM assets a JOIN memories m ON m.id=a.memory_id WHERE m.title LIKE 'scale-synthetic-%' AND a.state='ready'")>0)
            assertTrue(MemoryDb.get(c).search("Scale regression receipt",null).any{it.title=="scale-document"})
            assertTrue(MemoryDb.get(c).search("scale-synthetic-9999",null).isNotEmpty())
            val queryStart=SystemClock.elapsedRealtime()
            repeat(30){IndexProgress.counts(c);IndexProgress.next(c,"'image','video'")}
            val queryMs=SystemClock.elapsedRealtime()-queryStart
            val report=IndexProgress.report(c)
            assertTrue(report.contains("basic searchable"));assertFalse(report.contains("scale-original"))
            // Check real inventory references deduplicate on subsequent scan without reopening bytes.
            while(AuthorizedLibrary.discoverStep(c,AtomicBoolean(false))){}
            val idsBefore=value("SELECT count(*) FROM source_items WHERE source_id=$source")
            AuthorizedLibrary.rescan(c,source,wake=false)
            while(AuthorizedLibrary.discoverStep(c,AtomicBoolean(false))){}
            assertEquals(idsBefore,value("SELECT count(*) FROM source_items WHERE source_id=$source"))
            assertArrayEquals(inst.context.assets.open("a.jpg").use{it.readBytes()},image.readBytes())
            val proc=File("/proc/self/status").readText();val rss=Regex("VmHWM:\\s+(\\d+)").find(proc)?.groupValues?.get(1)?.toLong()?:0
            val result=JSONObject().put("synthetic_media_records",10000).put("real_inventory_files",205).put("seed_ms",seedMs).put("first_fair_round_ms",roundMs).put("count_and_queue_30_iterations_ms",queryMs).put("process_peak_rss_kib",rss).put("db_wal_growth_bytes",c.getDatabasePath("memories.db").length()+File(c.getDatabasePath("memories.db").path+"-wal").length()-bytesBefore).put("visual_complete_before_inventory_drained",true)
            File(c.filesDir,"indexing-benchmark.json").writeText(result.toString(2));println("INDEXING_SCALE $result")
        }finally{
            VisualIndex.setEnabled(c,false)
            d.rawQuery("SELECT id FROM memories WHERE title LIKE 'scale-%'",null).use{q->while(q.moveToNext())MemoryDb.get(c).remove(q.getLong(0))}
            originals.forEach{c.contentResolver.delete(it,null,null)};image.delete();document.delete()
        }
    }
    @Test fun pauseDuringInferenceDoesNotCommitAndRetryIsBounded(){
        VisualIndex.setEnabled(c,false)
        val file=File(c.filesDir,"media/pause-original.jpg").apply{parentFile!!.mkdirs();inst.context.assets.open("a.jpg").use{input->outputStream().use{input.copyTo(it)}}}
        val id=MemoryDb.get(c).add("image","pause checkpoint",path="media/pause-original.jpg",mime="image/jpeg")
        val stop=AtomicBoolean(false);IndexProgress.activeStop=stop
        val fake=object:VisualEncoder{
            override val modelId="test-cancellation-only"
            override fun image(bitmap:Bitmap):FloatArray{VisualIndex.setEnabled(c,false);return FloatArray(512){1f}}
            override fun text(query:String)=FloatArray(512)
            override fun close(){}
        }
        try{
            VisualIndexJob.indexOne(c,id,fake,stop)
            assertTrue(stop.get());assertEquals(0L,value("SELECT count(*) FROM representations WHERE memory_id=$id"))
            assertEquals(0L,value("SELECT next_ms FROM assets WHERE memory_id=$id"))
            repeat(3){IndexProgress.failed(c,id,IllegalArgumentException("secret file path must not appear"))}
            assertEquals(3L,value("SELECT attempts FROM index_retry WHERE memory_id=$id"))
            assertFalse(IndexProgress.report(c).contains("secret file path"))
            d.execSQL("UPDATE index_retry SET retry_at=0 WHERE memory_id=?",arrayOf(id))
            assertNotEquals(id,IndexProgress.next(c,"'image','video'"))
            assertTrue(file.exists())
        }finally{IndexProgress.activeStop=null;MemoryDb.get(c).remove(id);file.delete()}
    }
    @Test fun v04ReviewAndSourceStateSurvivesMigration(){
        assertEquals(4L,value("PRAGMA user_version"))
        assertEquals(1L,value("SELECT count(*) FROM review_state WHERE discovery_id='upgrade-kept' AND status='kept'"))
        assertEquals(1L,value("SELECT count(*) FROM review_state WHERE discovery_id='upgrade-corrected' AND correction='Original user correction'"))
        assertEquals(1L,value("SELECT count(*) FROM review_state WHERE discovery_id='upgrade-dismissed' AND status='dismissed'"))
        assertEquals(1L,value("SELECT count(*) FROM library_sources WHERE source_key='upgrade-fixture-disabled' AND enabled=0 AND cursor=42 AND scan_epoch=7"))
    }
}
