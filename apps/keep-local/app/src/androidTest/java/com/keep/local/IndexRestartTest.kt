package com.keep.local.next

import android.content.ContentValues
import android.provider.MediaStore
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.json.JSONArray
import java.io.File
import java.util.concurrent.atomic.AtomicBoolean

/** Invoked in two separate instrumentation processes around adb force-stop/relaunch. */
@RunWith(AndroidJUnit4::class)
class IndexRestartTest {
    @Test fun checkpointAcrossActualProcessDeath(){
        val inst=InstrumentationRegistry.getInstrumentation();val c=inst.targetContext
        val phase=InstrumentationRegistry.getArguments().getString("restart_phase")?:error("Run this test through creative-emulator.sh")
        val ledger=File(c.filesDir,"restart-fixtures.json")
        if(phase=="before"){
            AuthorizedLibrary.permissions("image").filter{!it.endsWith("VISUAL_USER_SELECTED")}.forEach{inst.uiAutomation.grantRuntimePermission(c.packageName,it)}
            val uris=JSONArray()
            repeat(105){i->
                val uri=c.contentResolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI,ContentValues().apply{put("_display_name","resume-fixture-$i.jpg");put("mime_type","image/jpeg");put("relative_path","Pictures/KeepLocalRestart/");put("is_pending",1)})!!
                c.contentResolver.openOutputStream(uri)!!.use{out->inst.context.assets.open("a.jpg").use{it.copyTo(out)}}
                c.contentResolver.update(uri,ContentValues().apply{put("is_pending",0)},null,null);uris.put(uri.toString())
            }
            ledger.writeText(uris.toString())
            AuthorizedLibrary.enableMedia(c,"image");AuthorizedLibrary.step(c,AtomicBoolean(false))
            val count=AuthorizedLibrary.db(c).rawQuery("SELECT count(*) FROM memories WHERE title LIKE 'resume-fixture-%'",null).use{it.moveToFirst();it.getInt(0)}
            assertEquals(100,count)
            // Persist the user's opt-in without scheduling work until relaunch.
            c.getSharedPreferences("visual",0).edit().putBoolean("enabled",true).commit()
            println("RESTART_CHECKPOINT before: 100/105 references, durable scan cursor")
        }else{
            val activity=androidx.test.core.app.ActivityScenario.launch(MainActivity::class.java)
            val deadline=System.currentTimeMillis()+60000
            var resumed=false
            while(System.currentTimeMillis()<deadline){
                val count=AuthorizedLibrary.db(c).rawQuery("SELECT count(*) FROM memories WHERE title LIKE 'resume-fixture-%'",null).use{it.moveToFirst();it.getInt(0)}
                val vectors=AuthorizedLibrary.db(c).rawQuery("SELECT count(*) FROM representations r JOIN memories m ON m.id=r.memory_id WHERE m.title LIKE 'resume-fixture-%' AND r.modality='visual'",null).use{it.moveToFirst();it.getInt(0)}
                if(count==105&&vectors>0){resumed=true;break};Thread.sleep(250)
            }
            VisualIndex.setEnabled(c,false)
            assertTrue("App relaunch must schedule and resume discovery + visual indexing",resumed)
            val expected=inst.context.assets.open("a.jpg").use{it.readBytes()}
            val uris=JSONArray(ledger.readText())
            for(i in 0 until uris.length()){
                val uri=android.net.Uri.parse(uris.getString(i));assertArrayEquals(expected,c.contentResolver.openInputStream(uri)!!.use{it.readBytes()})
                val id=AuthorizedLibrary.db(c).rawQuery("SELECT memory_id FROM source_items WHERE uri=?",arrayOf(uri.toString())).use{if(it.moveToFirst())it.getLong(0)else null}
                if(id!=null)MemoryDb.get(c).remove(id);c.contentResolver.delete(uri,null,null)
            }
            ledger.delete();activity.close()
            println("RESTART_CHECKPOINT after: 105/105 references, visual indexing resumed, 105 originals byte-identical")
        }
    }
}
