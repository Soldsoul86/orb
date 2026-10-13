package com.keep.local.next

import android.content.Context
import android.graphics.BitmapFactory
import android.net.Uri
import android.os.Debug
import android.os.SystemClock
import androidx.test.core.app.ApplicationProvider
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Test
import org.junit.Assert.*
import org.junit.runner.RunWith
import org.json.JSONObject
import org.json.JSONArray
import java.io.File
import java.util.concurrent.atomic.AtomicBoolean

@RunWith(AndroidJUnit4::class)
class CreativeMemoryTest {
    private val c=ApplicationProvider.getApplicationContext<Context>()
    private val test=InstrumentationRegistry.getInstrumentation().context
    @Test fun existingAssetsAndNewRelationshipsSurviveAdditiveMigration() {
        val db=MemoryDb.get(c)
        assertEquals("CAD Test",db.get(987654)!!.title)
        assertTrue(AppFiles.safeFile(c,db.get(987654)!!.path)!!.length()>0)
        db.readableDatabase.rawQuery("PRAGMA user_version",null).use { it.moveToFirst();assertEquals(2,it.getInt(0)) }
        val uuid=db.readableDatabase.rawQuery("SELECT asset_uuid FROM assets WHERE memory_id=987654",null).use {it.moveToFirst();it.getString(0)}
        CreativeSchema.create(db.writableDatabase)
        db.readableDatabase.rawQuery("SELECT asset_uuid FROM assets WHERE memory_id=987654",null).use {it.moveToFirst();assertEquals(uuid,it.getString(0))}
        val id=db.add("note","nondescript","my explicit identity note")
        db.readableDatabase.rawQuery("SELECT COUNT(*) FROM assets WHERE memory_id=?",arrayOf(id.toString())).use {it.moveToFirst();assertEquals(1,it.getInt(0))}
        db.remove(id)
        db.readableDatabase.rawQuery("SELECT COUNT(*) FROM assets WHERE memory_id=?",arrayOf(id.toString())).use {it.moveToFirst();assertEquals(0,it.getInt(0))}
    }
    @Test fun offlineRealPhotoVisualSearchAndTimestampBenchmark() {
        assertEquals("1",androidx.test.uiautomator.UiDevice.getInstance(InstrumentationRegistry.getInstrumentation()).executeShellCommand("settings get global airplane_mode_on").trim())
        val started=SystemClock.elapsedRealtime()
        ModelPack.install(c,Uri.fromFile(File(c.cacheDir,"model.zip")),android.os.CancellationSignal())
        assertTrue(ModelPack.ready(c))
        val tokens=ClipTokenizer(ModelPack.directory(c))
        val golden=JSONObject(test.assets.open("tokenizer-golden.json").bufferedReader().use{it.readText()})
        for(q in golden.keys()) { val expected=golden.getJSONArray(q);assertArrayEquals(q,LongArray(expected.length()){expected.getLong(it)},tokens.encode(q)) }
        val ids=mutableListOf<Long>();val files=mutableListOf<File>()
        val report=JSONObject().put("environment","Android emulator; not physical flagship performance")
            .put("model_id",ModelPack.ID).put("model_bytes",ModelPack.size(c)).put("airplane_mode",true)
            .put("action_recognition_tested",false).put("video_corpus","synthetic montage of real photos, not an action video")
        try {
            val indexStart=SystemClock.elapsedRealtime()
            ClipEncoder(c,2).use { model ->
                for((i,name) in listOf("a.jpg","b.jpg","c.jpg","d.jpg","m0.mp4").withIndex()) {
                    val target=File(AppFiles.mediaDir(c),"vfixture_$i.${name.substringAfterLast('.')}")
                    test.assets.open(name).use{input->target.outputStream().use{input.copyTo(it)}};files.add(target)
                    val id=MemoryDb.get(c).add(if(i==4)"video" else "image","opaque_$i",path=AppFiles.relativePath(c,target),mime=if(i==4)"video/mp4" else "image/jpeg",bytes=target.length())
                    ids.add(id)
                    // An interrupted step must not create any representation.
                    VisualIndexJob.indexOne(c,id,model,AtomicBoolean(true))
                    MemoryDb.get(c).readableDatabase.rawQuery("SELECT COUNT(*) FROM representations WHERE memory_id=?",arrayOf(id.toString())).use{it.moveToFirst();assertEquals(0,it.getInt(0))}
                    repeat(if(i==4)6 else 1){VisualIndexJob.indexOne(c,id,model,AtomicBoolean(false))}
                }
                report.put("index_ms",SystemClock.elapsedRealtime()-indexStart)
                val queries=listOf("a photograph of a cat","a cup of coffee","an astronaut in a spacesuit","a rocket launch")
                val rows=JSONArray();var hits=0
                val searchStart=SystemClock.elapsedRealtime()
                for((i,q) in queries.withIndex()) {
                    val hit=CreativeSearch.rank(c,model.text(q),"image").firstOrNull()
                    val success=hit?.id==ids[i];if(success)hits++
                    rows.put(JSONObject().put("query",q).put("expected_id",ids[i]).put("actual_id",hit?.id).put("score",hit?.similarity).put("correct",success))
                }
                report.put("queries",rows).put("precision_at_1",hits/4.0).put("recall_at_1",hits/4.0).put("search_4_queries_ms",SystemClock.elapsedRealtime()-searchStart)
                assertEquals("Visual-only real photograph hit rate",4,hits)
                val moment=CreativeSearch.rank(c,model.text("a cup of coffee"),"video").first{it.id==ids[4]}
                report.put("coffee_moment_ms",moment.startMs).put("coffee_ground_truth_ms",JSONArray(listOf(4000,8000)))
                assertTrue("Coffee frame must fall inside 4–8 second montage scene",moment.startMs in 4000..7999)
                assertTrue("Titles and OCR must not supply visual query",MemoryDb.get(c).search("coffee",null).isEmpty())
            }
            val image=BitmapFactory.decodeFile(files[0].absolutePath)
            val timings=JSONObject();var baseline:FloatArray?=null
            for(threads in listOf(1,2)) ClipEncoder(c,threads).use{engine->
                val t=SystemClock.elapsedRealtime();val result=engine.image(image);timings.put("cpu_${threads}_threads_load_and_infer_ms",SystemClock.elapsedRealtime()-t)
                if(baseline!=null)assertTrue(ClipEncoder.cosine(baseline!!,result)>.999f);baseline=result
            }
            image.recycle();report.put("cpu_microbenchmark",timings)
            val info=Debug.MemoryInfo();Debug.getMemoryInfo(info)
            report.put("process_pss_kb_sample",info.totalPss).put("elapsed_ms",SystemClock.elapsedRealtime()-started)
            // Report peak RSS separately from a sampled PSS value.
            val rss=File("/proc/self/status").readLines().filter{it.startsWith("VmHWM:")||it.startsWith("VmRSS:")}.joinToString("; ")
            report.put("rss",rss)
            File(c.filesDir,"visual-benchmark.json").writeText(report.toString(2))
            println("VISUAL_BENCHMARK "+report.toString())
        } finally {
            File(c.filesDir,"visual-benchmark.json").writeText(report.toString(2))
            ids.forEach{MemoryDb.get(c).remove(it)};files.forEach{it.delete()}
            VisualIndex.setEnabled(c,false)
        }
    }
}
