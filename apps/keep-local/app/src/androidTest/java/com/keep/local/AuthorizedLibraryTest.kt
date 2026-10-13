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
}
