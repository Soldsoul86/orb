package com.keep.local.next

import android.content.ContentValues
import android.content.Intent
import android.net.Uri
import android.os.Debug
import android.os.SystemClock
import android.provider.MediaStore
import androidx.test.core.app.ActivityScenario
import androidx.test.espresso.Espresso.onView
import androidx.test.espresso.action.ViewActions.*
import androidx.test.espresso.matcher.ViewMatchers.*
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.uiautomator.*
import org.junit.Assert.*
import org.junit.Test
import org.json.JSONObject
import org.json.JSONArray
import java.io.File
import java.util.concurrent.atomic.AtomicBoolean

/** Actual MediaStore + SAF files, real CLIP, UI decisions, then a separate process. */
class DiscoveryFlowTest {
    private val inst=InstrumentationRegistry.getInstrumentation()
    private val c=inst.targetContext
    private val device=UiDevice.getInstance(inst)
    private val ledger get()=File(c.filesDir,"discovery-flow.json")
    private fun hash(uri:Uri)=c.contentResolver.openInputStream(uri)!!.use{input->val d=java.security.MessageDigest.getInstance("SHA-256");val b=ByteArray(65536);while(true){val n=input.read(b);if(n<0)break;d.update(b,0,n)};d.digest().joinToString(""){"%02x".format(it)}}
    private fun databaseBytes()=listOf("", "-wal", "-shm").sumOf{File(c.getDatabasePath("memories.db").path+it).length()}
    private fun choose(id:String,action:String,reason:String?=null){
        ActivityScenario.launch<ReviewActivity>(Intent(c,ReviewActivity::class.java).putExtra("discovery_id",id)).use {
            assertTrue(device.wait(Until.hasObject(By.text("Worth Reviewing")),5000))
            val source=MemoryDb.get(c).get(Discoveries.get(c,id)!!.evidence.first().id)!!
            onView(withText("Open source: ${source.title}")).perform(scrollTo(),click())
            assertTrue(device.wait(Until.hasObject(By.text("Memory details")),5000))
            onView(withId(R.id.memory_title)).check(androidx.test.espresso.assertion.ViewAssertions.matches(withText(source.title)))
            androidx.test.espresso.Espresso.pressBack()
            assertTrue(device.wait(Until.hasObject(By.text("Worth Reviewing")),5000))
            // Use real accessibility scroll gestures: native focus restoration can undo
            // Espresso requestRectangleOnScreen after returning from another Activity.
            androidx.test.espresso.Espresso.closeSoftKeyboard()
            val visible=device.findObject(By.text(action))
            if(visible==null || visible.visibleBounds.height()<30){
                val scroller=UiScrollable(UiSelector().className("android.widget.ScrollView")).setAsVerticalList()
                assertTrue("Review action reachable by scrolling: $action",scroller.scrollIntoView(UiSelector().text(action)))
            }
            val actionView=device.wait(Until.findObject(By.text(action)),3000)
            assertNotNull(actionView);actionView!!.click()
            if(action=="Correct"){
                onView(withClassName(org.hamcrest.Matchers.equalTo("android.widget.EditText"))).perform(replaceText("Useful for my next creation"),closeSoftKeyboard())
                onView(withText("Save correction")).perform(click())
            }
            if(reason!=null)onView(withText(reason)).perform(click())
            val expected=when(action){"Keep"->"kept";"Correct"->"corrected";else->"dismissed"}
            val end=SystemClock.elapsedRealtime()+5000
            while(Discoveries.get(c,id)?.status!=expected&&SystemClock.elapsedRealtime()<end)Thread.sleep(50)
            assertEquals(expected,Discoveries.get(c,id)!!.status)
        };device.pressBack();device.pressHome()
    }
    @Test fun authorizedEvidenceReviewAndRestart(){
        val phase=InstrumentationRegistry.getArguments().getString("review_phase")?:error("Use creative-emulator.sh")
        assertEquals("1",device.executeShellCommand("settings get global airplane_mode_on").trim())
        if(phase=="after"){
            val state=JSONObject(ledger.readText());val decisions=state.getJSONObject("decisions")
            for(id in decisions.keys())assertEquals(decisions.getString(id),Discoveries.get(c,id)!!.status)
            val corrected=decisions.keys().asSequence().first{decisions.getString(it)=="corrected"}
            assertEquals("Useful for my next creation",Discoveries.get(c,corrected)!!.correction)
            repeat(3){DiscoveryEngine.generate(c)}
            val dismissed=decisions.keys().asSequence().first{decisions.getString(it)=="dismissed"}
            assertTrue(Discoveries.list(c).none{it.id==dismissed})
            val files=state.getJSONArray("files")
            for(i in 0 until files.length()){val f=files.getJSONObject(i);assertEquals(f.getString("sha256"),hash(Uri.parse(f.getString("uri"))))}
            val folder=Uri.parse(state.getString("folder"));c.contentResolver.releasePersistableUriPermission(folder,Intent.FLAG_GRANT_READ_URI_PERMISSION);AuthorizedLibrary.reconcile(c)
            assertTrue(MemoryDb.get(c).search("Manufacturer warranty",null).none{it.path?.contains("KeepLocalFixtures")==true})
            assertTrue(Discoveries.list(c,true).none{d->d.evidence.any{it.source.contains("KeepLocalFixtures")}})
            ActivityScenario.launch(ReviewActivity::class.java).use{assertTrue(device.wait(Until.hasObject(By.text("Worth Reviewing")),5000))}
            AuthorizedLibrary.clearDerived(c)
            assertFalse(VisualIndex.enabled(c));assertTrue(ModelPack.ready(c))
            for(i in 0 until files.length()){val f=files.getJSONObject(i);assertEquals(f.getString("sha256"),hash(Uri.parse(f.getString("uri"))))}
            for(id in decisions.keys())AuthorizedLibrary.db(c).rawQuery("SELECT status FROM review_state WHERE discovery_id=?",arrayOf(id)).use{assertTrue(it.moveToFirst());assertEquals(decisions.getString(id),it.getString(0))}
            assertEquals(0,AuthorizedLibrary.db(c).rawQuery("SELECT count(*) FROM representations",null).use{it.moveToFirst();it.getInt(0)})
            val report=JSONObject(File(c.filesDir,"discovery-benchmark.json").readText()).put("index_removal_preserved_originals_models_and_review_decisions",true).put("review_survived_process_death",true).put("folder_revocation_hid_evidence",true).put("original_media_hashes_unchanged",true)
            File(c.filesDir,"discovery-benchmark.json").writeText(report.toString(2));return
        }
        val start=SystemClock.elapsedRealtime();val beforeBytes=databaseBytes()
        val folder=TestFolder.authorize(c)
        val files=JSONArray();val labels=mutableMapOf<Long,String>()
        for(kind in listOf("image","video"))AuthorizedLibrary.permissions(kind).filter{!it.endsWith("VISUAL_USER_SELECTED")}.forEach{inst.uiAutomation.grantRuntimePermission(c.packageName,it)}
        for((i,name) in listOf("a.jpg","b.jpg","c.jpg","d.jpg","m0.mp4").withIndex()){
            val video=i==4;val collection=if(video)MediaStore.Video.Media.EXTERNAL_CONTENT_URI else MediaStore.Images.Media.EXTERNAL_CONTENT_URI
            val time=1700000000000L + if(i==3)3*86400000L else i*60000L
            val uri=c.contentResolver.insert(collection,ContentValues().apply{put("_display_name","opaque-discovery-$i.${if(video)"mp4" else "jpg"}");put("mime_type",if(video)"video/mp4" else "image/jpeg");put("relative_path",if(video)"Movies/DiscoveryFixtures/" else "Pictures/DiscoveryFixtures/");put("is_pending",1)})!!
            if(video)c.contentResolver.openOutputStream(uri)!!.use{out->inst.context.assets.open(name).use{it.copyTo(out)}}
            else {
                // Real capture metadata survives MediaStore's asynchronous metadata scan.
                val photo=File(c.cacheDir,"dated-$i.jpg")
                inst.context.assets.open(name).use{input->photo.outputStream().use{input.copyTo(it)}}
                val stamp=java.text.SimpleDateFormat("yyyy:MM:dd HH:mm:ss",java.util.Locale.ROOT).apply{timeZone=java.util.TimeZone.getTimeZone("UTC")}.format(java.util.Date(time))
                android.media.ExifInterface(photo.path).apply{setAttribute(android.media.ExifInterface.TAG_DATETIME_ORIGINAL,stamp);setAttribute(android.media.ExifInterface.TAG_DATETIME,stamp);saveAttributes()}
                c.contentResolver.openOutputStream(uri)!!.use{out->photo.inputStream().use{it.copyTo(out)}};photo.delete()
            }
            c.contentResolver.update(uri,ContentValues().apply{put("is_pending",0)},null,null)
            val scanned=java.util.concurrent.CountDownLatch(1)
            val path=File(android.os.Environment.getExternalStorageDirectory(),"${if(video)"Movies" else "Pictures"}/DiscoveryFixtures/opaque-discovery-$i.${if(video)"mp4" else "jpg"}")
            android.media.MediaScannerConnection.scanFile(c,arrayOf(path.path),arrayOf(if(video)"video/mp4" else "image/jpeg")){_,_->scanned.countDown()}
            assertTrue("Android metadata scan completed",scanned.await(15,java.util.concurrent.TimeUnit.SECONDS))
            if(!video){val captured=CaptureMetadata.read(c,uri);assertNotNull("Fixture has embedded original-capture EXIF",captured);assertEquals(time/1000,captured!!.time/1000)}
            files.put(JSONObject().put("uri",uri.toString()).put("sha256",hash(uri)).put("label",listOf("cat","coffee","astronaut","rocket","montage")[i]))
        }
        AuthorizedLibrary.enableMedia(c,"image");AuthorizedLibrary.enableMedia(c,"video");AuthorizedLibrary.enableTree(c,folder)
        repeat(40){if(!AuthorizedLibrary.step(c,AtomicBoolean(false)))return@repeat}
        for(i in 0 until files.length()){
            val f=files.getJSONObject(i);val id=AuthorizedLibrary.db(c).rawQuery("SELECT memory_id FROM source_items WHERE uri=?",arrayOf(f.getString("uri"))).use{assertTrue(it.moveToFirst());it.getLong(0)}
            f.put("id",id);labels[id]=f.getString("label")
        }
        val indexing=SystemClock.elapsedRealtime()
        ClipEncoder(c,2).use{model->for((id,label) in labels)repeat(if(label=="montage")6 else 1){VisualIndexJob.indexOne(c,id,model,AtomicBoolean(false))}}
        val indexMs=SystemClock.elapsedRealtime()-indexing
        // A previous batch can have higher row IDs than the current corpus after deletions.
        c.getSharedPreferences("discovery",0).edit().putLong("document_cursor",Long.MAX_VALUE).putLong("experience_cursor",Long.MAX_VALUE).putLong("visual_cursor",Long.MAX_VALUE).commit()
        val generation=DiscoveryEngine.generate(c)
        val firstDiscoveryMs=SystemClock.elapsedRealtime()-start
        val records=Discoveries.list(c);val doc=records.filter{it.type=="document"&&it.evidence.any{e->e.source.contains("KeepLocalFixtures")}}
        val experience=records.filter{it.type=="experience"&&it.evidence.any{e->e.id in labels}}
        val reuse=records.filter{it.type=="reusable"&&it.evidence.any{e->e.id in labels}}
        assertEquals("Warranty and receipt; plain negative text yields no suggestion",2,doc.size)
        val capturedRows=AuthorizedLibrary.db(c).rawQuery("SELECT memory_id,content_time,time_basis,group_path FROM source_items WHERE memory_id IN ("+labels.keys.joinToString(",")+")",null).use{r->buildList{while(r.moveToNext())add("${r.getLong(0)}:${r.getLong(1)}:${r.getString(2)}:${r.getString(3)}")}}
        println("DISCOVERY_CAPTURE_METADATA $capturedRows")
        assertTrue("Captured-photo group: $capturedRows",experience.isNotEmpty());assertTrue("Real CLIP reuse evidence",reuse.isNotEmpty())
        assertTrue(experience.all{d->d.evidence.none{labels[it.id]=="rocket"}})
        var unsupported=0;var evaluated=0;var unlabeled=0;var strictMismatch=0
        val pairEvidence=JSONArray()
        for(d in reuse){
            val concepts=d.evidence.map{e->when(labels[e.id]){"montage"->when{e.start<4000->"cat";e.start<8000->"coffee";else->"astronaut"};null->if(e.id==987654L)"rocket" else "unlabeled";else->labels[e.id]}}
            // Android's closest-frame decoder can select the neighboring frame at a cut.
            // Report strict mismatch separately; allow 100 ms (just over one 12 fps frame).
            val possibilities=d.evidence.mapIndexed{index,e->
                if(labels[e.id]=="montage" && kotlin.math.abs(e.start-4000)<=100)setOf("cat","coffee")
                else if(labels[e.id]=="montage" && kotlin.math.abs(e.start-8000)<=100)setOf("coffee","astronaut")
                else setOf(concepts[index])
            }
            val row=JSONObject().put("similarity",d.score).put("sources",JSONArray(d.evidence.mapIndexed{index,e->JSONObject().put("id",e.id).put("start_ms",e.start).put("strict_label",concepts[index])}))
            if("unlabeled" in concepts)unlabeled++ else {
                evaluated++;if(concepts.distinct().size!=1)strictMismatch++
                val supported=possibilities.reduce{a,b->a.intersect(b)}.isNotEmpty()
                if(!supported)unsupported++
                row.put("supported_with_100ms_boundary_tolerance",supported)
            }
            pairEvidence.put(row)
        }
        println("DISCOVERY_PAIR_EVIDENCE $pairEvidence")
        assertTrue("At least one visual pair must match labeled source evidence",evaluated>unsupported)
        val count=AuthorizedLibrary.db(c).rawQuery("SELECT count(*) FROM discoveries",null).use{it.moveToFirst();it.getInt(0)}
        repeat(3){DiscoveryEngine.generate(c)}
        val after=AuthorizedLibrary.db(c).rawQuery("SELECT count(*) FROM discoveries",null).use{it.moveToFirst();it.getInt(0)}
        assertEquals("Rescan produces no duplicate records",count,after)
        ActivityScenario.launch(ReviewActivity::class.java).use{
            assertTrue(device.wait(Until.hasObject(By.text("Worth Reviewing")),5000))
            val bitmap=inst.uiAutomation.takeScreenshot();File(c.filesDir,"discovery-review.png").outputStream().use{bitmap.compress(android.graphics.Bitmap.CompressFormat.PNG,100,it)};bitmap.recycle()
        }
        val keep=doc.first();val correct=experience.first();val dismiss=reuse.first()
        val originals=(keep.evidence+correct.evidence+dismiss.evidence).associate{it.id to MemoryDb.get(c).get(it.id)}
        val evidence=correct.evidence
        choose(keep.id,"Keep");choose(correct.id,"Correct");choose(dismiss.id,"Dismiss","Uninteresting to me")
        assertEquals(evidence,Discoveries.get(c,correct.id)!!.evidence)
        originals.forEach{(id,item)->assertEquals(item,MemoryDb.get(c).get(id))}
        assertTrue(MemoryDb.get(c).search("warranty",null).isNotEmpty())
        val decisions=JSONObject().put(keep.id,"kept").put(correct.id,"corrected").put(dismiss.id,"dismissed")
        ledger.writeText(JSONObject().put("folder",folder.toString()).put("files",files).put("decisions",decisions).toString())
        val memory=Debug.MemoryInfo();Debug.getMemoryInfo(memory)
        val report=JSONObject().put("environment","Android emulator; fixture documents and real photos / constructed video; no physical device")
            .put("airplane_mode",true).put("authorized_visual_assets",5).put("authorized_documents",3)
            .put("literal_document_suggestions",doc.size).put("experience_groups",experience.size).put("reusable_pairs",reuse.size).put("unsupported_visual_pairs",unsupported).put("evaluated_labeled_pairs",evaluated).put("unlabeled_pairs_not_scored",unlabeled).put("strict_scene_label_mismatches",strictMismatch).put("timestamp_boundary_tolerance_ms",100).put("visual_pair_evidence",pairEvidence)
            .put("duplicate_suggestions_on_repeat",after-count).put("index_visual_ms",indexMs).put("discovery_generation_ms",generation)
            .put("time_to_first_discovery_ms",firstDiscoveryMs).put("sampled_pss_kb",memory.totalPss)
            .put("database_and_wal_growth_bytes",databaseBytes()-beforeBytes)
            .put("peak_process_rss",File("/proc/self/status").readLines().firstOrNull{it.startsWith("VmHWM:")})
            .put("review_actions","Automated fixture decisions, NOT evidence of real user usefulness")
        File(c.filesDir,"discovery-benchmark.json").writeText(report.toString(2))
    }
}
