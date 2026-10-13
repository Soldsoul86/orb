package com.keep.local.next

import android.content.ContentValues
import android.provider.MediaStore
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import java.util.concurrent.atomic.AtomicBoolean

@RunWith(AndroidJUnit4::class)
class AuthorizedLibraryTest {
    private val c=InstrumentationRegistry.getInstrumentation().targetContext
    @org.junit.After fun leaveSystemPicker(){ val d=androidx.test.uiautomator.UiDevice.getInstance(InstrumentationRegistry.getInstrumentation());d.pressBack();d.pressHome() }
    @Test fun mediaReferenceIdentityChangesRevocationAndExclusion(){
        val inst=InstrumentationRegistry.getInstrumentation()
        AuthorizedLibrary.permissions("image").filter{!it.endsWith("VISUAL_USER_SELECTED")}.forEach{inst.uiAutomation.grantRuntimePermission(c.packageName,it)}
        val uri=c.contentResolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI,ContentValues().apply{put("_display_name","opaque-library.jpg");put("mime_type","image/jpeg");put("relative_path","Pictures/KeepLocalTest/");put("is_pending",1)})!!
        try{
            c.contentResolver.openOutputStream(uri)!!.use{out->inst.context.assets.open("a.jpg").use{it.copyTo(out)}}
            c.contentResolver.update(uri,ContentValues().apply{put("is_pending",0)},null,null)
            val source=AuthorizedLibrary.enableMedia(c,"image")
            while(AuthorizedLibrary.step(c,AtomicBoolean(false))){}
            val d=AuthorizedLibrary.db(c)
            fun id()=d.rawQuery("SELECT memory_id FROM source_items WHERE uri=?",arrayOf(uri.toString())).use{assertTrue(it.moveToFirst());it.getLong(0)}
            val first=id();val item=MemoryDb.get(c).get(first)!!
            assertEquals(uri.toString(),item.path);assertNull(AppFiles.safeFile(c,item.path));MediaSource.check(c,item)
            val uuid=d.rawQuery("SELECT asset_uuid FROM assets WHERE memory_id=?",arrayOf(first.toString())).use{it.moveToFirst();it.getString(0)}
            AuthorizedLibrary.rescan(c,source);while(AuthorizedLibrary.step(c,AtomicBoolean(false))){}
            assertEquals(first,id());assertEquals(uuid,d.rawQuery("SELECT asset_uuid FROM assets WHERE memory_id=?",arrayOf(first.toString())).use{it.moveToFirst();it.getString(0)})
            MemoryDb.get(c).setExtracted(first,"private warranty receipt")
            AuthorizedLibrary.exclude(c,first);assertFalse(AuthorizedLibrary.accessible(c,first));assertTrue(MemoryDb.get(c).search("private warranty",null).none{it.id==first})
            assertEquals("",MemoryDb.get(c).get(first)!!.extracted)
            c.contentResolver.openInputStream(uri)!!.use{assertTrue(it.read()>=0)}
            AuthorizedLibrary.revoke(c,source);assertFalse(AuthorizedLibrary.accessible(c,first))
            try{MediaExport.sendIntent(c,item);fail("Revoked item shared")}catch(_:SecurityException){}
        }finally{c.contentResolver.delete(uri,null,null)}
    }
    @Test fun interruptedScanAndAdditiveMigration(){
        val db=android.database.sqlite.SQLiteDatabase.create(null)
        try{db.execSQL("CREATE TABLE memories(id INTEGER PRIMARY KEY,path TEXT)");db.execSQL("INSERT INTO memories VALUES(7,'media/old.mp4')");CreativeSchema.create(db);LibrarySchema.create(db);LibrarySchema.create(db)
            db.rawQuery("SELECT path FROM memories WHERE id=7",null).use{assertTrue(it.moveToFirst());assertEquals("media/old.mp4",it.getString(0))}
        }finally{db.close()}
        val stop=AtomicBoolean(true);assertFalse(AuthorizedLibrary.step(c,stop))
    }
    @Test fun realFolderPickerPersistsReadGrantAndRevocationErasesExtractedText(){
        val device=androidx.test.uiautomator.UiDevice.getInstance(InstrumentationRegistry.getInstrumentation())
        androidx.test.core.app.ActivityScenario.launch(LibrarySettingsActivity::class.java).use {
            androidx.test.espresso.Espresso.onView(androidx.test.espresso.matcher.ViewMatchers.withText("Choose document folder")).perform(androidx.test.espresso.action.ViewActions.scrollTo(),androidx.test.espresso.action.ViewActions.click())
            val roots=androidx.test.uiautomator.By.text("Keep Local fixtures")
            device.waitForIdle()
            if(!device.hasObject(roots)) device.wait(androidx.test.uiautomator.Until.findObject(androidx.test.uiautomator.By.desc("Show roots")),5000)?.click()
            val fixture=device.wait(androidx.test.uiautomator.Until.findObject(roots),5000)
            assertNotNull("Fixture folder must appear in Android document picker",fixture);fixture!!.click()
            val select=device.wait(androidx.test.uiautomator.Until.findObject(androidx.test.uiautomator.By.text(java.util.regex.Pattern.compile("(?i)(use this folder|select)"))),5000)
            assertNotNull("Folder consent action",select);select!!.click()
            device.wait(androidx.test.uiautomator.Until.findObject(androidx.test.uiautomator.By.text(java.util.regex.Pattern.compile("(?i)allow"))),2000)?.click()
            assertTrue(device.wait(androidx.test.uiautomator.Until.hasObject(androidx.test.uiautomator.By.text("Choose what Keep Local can remember.")),5000))
        }
        val grant=c.contentResolver.persistedUriPermissions.firstOrNull{it.uri.authority==LibraryFixtureProvider.AUTH}
        assertNotNull("Persisted read grant",grant)
        val source=AuthorizedLibrary.enableTree(c,grant!!.uri)
        // One scan batch, then a fresh caller resumes durable processing.
        AuthorizedLibrary.step(c,AtomicBoolean(false))
        assertFalse(AuthorizedLibrary.step(c,AtomicBoolean(true)))
        repeat(20){AuthorizedLibrary.step(c,AtomicBoolean(false))}
        val matches=MemoryDb.get(c).search("Manufacturer warranty",null)
        val item=matches.first{it.path?.contains(LibraryFixtureProvider.AUTH)==true}
        assertTrue(MemoryDb.get(c).get(item.id)!!.extracted.contains("2028-06-30"))
        val original=MediaSource.open(c,item).use{it.readBytes()}
        // Revoke at the OS boundary, not merely through our source table.
        c.contentResolver.releasePersistableUriPermission(grant.uri,android.content.Intent.FLAG_GRANT_READ_URI_PERMISSION)
        AuthorizedLibrary.reconcile(c)
        assertFalse(AuthorizedLibrary.accessible(c,item.id))
        assertTrue(MemoryDb.get(c).search("Manufacturer warranty",null).none{it.id==item.id})
        assertEquals("",MemoryDb.get(c).get(item.id)!!.extracted)
        assertTrue(original.isNotEmpty())
    }

}
