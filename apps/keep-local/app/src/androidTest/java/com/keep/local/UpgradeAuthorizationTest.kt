package com.keep.local.next

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.json.JSONObject
import java.io.File
import java.util.concurrent.atomic.AtomicBoolean

/** The before phase runs inside the actual delivered 0.4.0 APK, not the new app. */
@RunWith(AndroidJUnit4::class)
class UpgradeAuthorizationTest {
    @Test fun persistedFolderAndIndexSurviveActualApkUpgrade(){
        val inst=InstrumentationRegistry.getInstrumentation();val c=inst.targetContext
        val phase=InstrumentationRegistry.getArguments().getString("upgrade_phase")?:error("Run using creative-emulator.sh")
        val ledger=File(c.filesDir,"upgrade-authorized-source.json")
        if(phase=="before"){
            val folder=TestFolder.authorize(c)
            AuthorizedLibrary.enableTree(c,folder)
            repeat(20){AuthorizedLibrary.step(c,AtomicBoolean(false))}
            val item=MemoryDb.get(c).search("Manufacturer warranty",null).first{it.path?.contains("KeepLocalFixtures")==true}
            val uuid=MemoryDb.get(c).readableDatabase.rawQuery("SELECT asset_uuid FROM assets WHERE memory_id=?",arrayOf(item.id.toString())).use{it.moveToFirst();it.getString(0)}
            ledger.writeText(JSONObject().put("folder",folder.toString()).put("id",item.id).put("uuid",uuid).put("path",item.path).put("text",MemoryDb.get(c).get(item.id)!!.extracted).toString())
            c.getSharedPreferences("visual",0).edit().putBoolean("enabled",false).commit()
            assertEquals(3,MemoryDb.get(c).readableDatabase.version)
        }else{
            val old=JSONObject(ledger.readText());val id=old.getLong("id")
            assertFalse(VisualIndex.enabled(c))
            assertTrue(c.contentResolver.persistedUriPermissions.any{it.uri.toString()==old.getString("folder")&&it.isReadPermission})
            val item=MemoryDb.get(c).get(id)!!
            assertEquals(old.getString("path"),item.path);assertEquals(old.getString("text"),item.extracted)
            assertEquals(old.getString("uuid"),MemoryDb.get(c).readableDatabase.rawQuery("SELECT asset_uuid FROM assets WHERE memory_id=?",arrayOf(id.toString())).use{it.moveToFirst();it.getString(0)})
            assertTrue(MediaSource.open(c,item).use{it.bufferedReader().readText()}.contains("2028-06-30"))
            assertTrue(MemoryDb.get(c).search("Manufacturer warranty",null).any{it.id==id})
            assertTrue(ModelPack.ready(c));assertEquals(4,MemoryDb.get(c).readableDatabase.version)
        }
        println("UPGRADE_AUTHORIZATION $phase: persisted SAF grant, text, stable ID/reference, paused preference")
    }
}
