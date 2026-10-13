package com.keep.local.next

import android.Manifest
import android.content.*
import android.content.pm.PackageManager
import android.database.sqlite.SQLiteDatabase
import android.net.Uri
import android.os.Build
import android.os.SystemClock
import android.provider.DocumentsContract as DC
import android.provider.MediaStore as MS
import java.io.File
import java.util.concurrent.atomic.AtomicBoolean

/** Durable discovery checkpoints share VisualIndex's job and cancellation policy. */
object AuthorizedLibrary {
    fun db(c:Context)=MemoryDb.get(c).writableDatabase
    fun permissions(kind:String):Array<String> = if(Build.VERSION.SDK_INT<33) arrayOf(Manifest.permission.READ_EXTERNAL_STORAGE) else when(kind) {
        "image" -> arrayOf(Manifest.permission.READ_MEDIA_IMAGES) + if(Build.VERSION.SDK_INT>=34) arrayOf(Manifest.permission.READ_MEDIA_VISUAL_USER_SELECTED) else emptyArray()
        "video" -> arrayOf(Manifest.permission.READ_MEDIA_VIDEO) + if(Build.VERSION.SDK_INT>=34) arrayOf(Manifest.permission.READ_MEDIA_VISUAL_USER_SELECTED) else emptyArray()
        else -> arrayOf(Manifest.permission.READ_MEDIA_AUDIO)
    }
    fun granted(c:Context,kind:String)=permissions(kind).any { c.checkSelfPermission(it)==PackageManager.PERMISSION_GRANTED }
    fun enableMedia(c:Context,kind:String):Long {
        require(kind in listOf("image","video","audio"));require(granted(c,kind)){"Media permission denied"}
        return enable(c,"media:$kind",kind,when(kind){"image"->"Photos";"video"->"Videos";else->"Audio"})
    }
    fun enableTree(c:Context,uri:Uri):Long {
        require(DC.isTreeUri(uri));require(c.contentResolver.persistedUriPermissions.any{it.uri==uri&&it.isReadPermission}){"Folder grant was not retained"}
        return enable(c,uri.toString(),"tree",DC.getTreeDocumentId(uri).substringAfterLast(':').ifBlank{"Selected folder"})
    }
    private fun enable(c:Context,key:String,kind:String,label:String):Long = synchronized(VisualIndex) {
        val d=db(c)
        d.execSQL("INSERT OR IGNORE INTO library_sources(source_key,kind,label) VALUES(?,?,?)",arrayOf(key,kind,label.take(200)))
        val id=d.rawQuery("SELECT id FROM library_sources WHERE source_key=?",arrayOf(key)).use{it.moveToFirst();it.getLong(0)}
        d.execSQL("UPDATE library_sources SET enabled=1 WHERE id=?",arrayOf(id));rescan(c,id);id
    }
    fun rescan(c:Context,id:Long?=null) {
        val d=db(c);val where=if(id==null)"enabled=1" else "enabled=1 AND id=$id"
        d.execSQL("UPDATE library_sources SET status='queued',cursor=0,scan_epoch=scan_epoch+1,error=NULL WHERE $where")
        d.execSQL("DELETE FROM scan_folders WHERE source_id IN (SELECT id FROM library_sources WHERE $where)")
        d.execSQL("UPDATE source_items SET state='queued',error=NULL WHERE excluded=0 AND state IN ('failed','access_revoked','not_indexed') AND source_id IN (SELECT id FROM library_sources WHERE $where)")
        VisualIndex.schedule(c)
    }
    fun hasSources(c:Context)=db(c).rawQuery("SELECT 1 FROM library_sources WHERE enabled=1 LIMIT 1",null).use{it.moveToFirst()}
    fun accessible(c:Context,id:Long):Boolean {
        val row=db(c).rawQuery("SELECT ls.source_key,ls.kind,ls.enabled,si.excluded,si.state FROM source_items si JOIN library_sources ls ON ls.id=si.source_id WHERE si.memory_id=?",arrayOf(id.toString()))
        row.use {
            if(!it.moveToFirst())return false
            if(it.getInt(2)==0||it.getInt(3)!=0||it.getString(4)=="access_revoked")return false
            return if(it.getString(1)=="tree") c.contentResolver.persistedUriPermissions.any{p->p.uri.toString()==it.getString(0)&&p.isReadPermission} else granted(c,it.getString(1))
        }
    }
    /** Remove all derived excerpts/vectors immediately when authorization disappears. */
    fun invalidate(c:Context,id:Long,state:String="access_revoked") = synchronized(VisualIndex) {
        val d=db(c)
        d.execSQL("UPDATE source_items SET state=?,error=? WHERE memory_id=?",arrayOf(state,if(state=="access_revoked")"Source unavailable or permission revoked" else null,id))
        d.execSQL("UPDATE memories SET extracted='' WHERE id=?",arrayOf(id))
        d.delete("representations","memory_id=?",arrayOf(id.toString()))
        d.execSQL("UPDATE assets SET state='not_indexed',next_ms=0,sha256=NULL WHERE memory_id=?",arrayOf(id))
        File(c.cacheDir,"visual").listFiles()?.filter{it.name.startsWith("${id}_")}?.forEach{it.delete()}
        // Discovery tables are installed by the same additive migration in milestone B.
        if(d.rawQuery("SELECT name FROM sqlite_master WHERE name='discovery_evidence'",null).use{it.moveToFirst()}) {
            d.execSQL("DELETE FROM discoveries WHERE id IN (SELECT discovery_id FROM discovery_evidence WHERE memory_id=?)",arrayOf(id))
        }
    }
    fun revoke(c:Context,sourceId:Long) = synchronized(VisualIndex) {
        val d=db(c)
        val key=d.rawQuery("SELECT source_key FROM library_sources WHERE id=?",arrayOf(sourceId.toString())).use{if(it.moveToFirst())it.getString(0)else return@synchronized}
        d.execSQL("UPDATE library_sources SET enabled=0,status='access_revoked' WHERE id=?",arrayOf(sourceId))
        d.rawQuery("SELECT memory_id FROM source_items WHERE source_id=?",arrayOf(sourceId.toString())).use{while(it.moveToNext())invalidate(c,it.getLong(0))}
        if(key.startsWith("content://"))runCatching{c.contentResolver.releasePersistableUriPermission(Uri.parse(key),Intent.FLAG_GRANT_READ_URI_PERMISSION)}
    }
    fun reconcile(c:Context) {
        val d=db(c)
        d.rawQuery("SELECT id,source_key,kind FROM library_sources WHERE enabled=1",null).use{r->while(r.moveToNext()){
            val allowed=if(r.getString(2)=="tree")c.contentResolver.persistedUriPermissions.any{it.uri.toString()==r.getString(1)&&it.isReadPermission}else granted(c,r.getString(2))
            if(!allowed)revoke(c,r.getLong(0))
        }}
    }
    fun exclude(c:Context,id:Long) { db(c).execSQL("UPDATE source_items SET excluded=1 WHERE memory_id=?",arrayOf(id));invalidate(c,id,"not_indexed") }
    fun excludePrefix(c:Context,source:Long,prefix:String) {
        require(prefix.isNotBlank())
        db(c).execSQL("INSERT OR IGNORE INTO source_exclusions VALUES(?,?)",arrayOf(source,prefix))
        db(c).rawQuery("SELECT memory_id,group_path FROM source_items WHERE source_id=?",arrayOf(source.toString())).use{while(it.moveToNext())if(it.getString(1).startsWith(prefix))exclude(c,it.getLong(0))}
    }
    fun clearDerived(c:Context) = synchronized(VisualIndex) {
        VisualIndex.clear(c)
        val d=db(c)
        d.execSQL("UPDATE memories SET extracted='' WHERE id IN (SELECT memory_id FROM source_items)")
        d.execSQL("UPDATE source_items SET state='not_indexed' WHERE excluded=0 AND state!='access_revoked'")
        if(d.rawQuery("SELECT name FROM sqlite_master WHERE name='discoveries'",null).use{it.moveToFirst()})d.delete("discoveries",null,null)
    }
    /** Idempotent URI identity; content changes invalidate only derived data. */
    fun upsert(c:Context,source:Long,uri:Uri,title:String,mime:String,size:Long,modified:Long,time:Long,basis:String,group:String,epoch:Long):Long = synchronized(VisualIndex) {
        val d=db(c);val fingerprint="$size:$modified"
        val existing=d.rawQuery("SELECT memory_id,fingerprint,excluded,state FROM source_items WHERE uri=?",arrayOf(uri.toString())).use{if(it.moveToFirst())listOf(it.getLong(0).toString(),it.getString(1),it.getInt(2).toString(),it.getString(3))else null}
        if(existing!=null){
            val id=existing[0].toLong()
            if(existing[1]!=fingerprint||existing[3]=="access_revoked"){
                invalidate(c,id,"queued")
                d.execSQL("UPDATE source_items SET fingerprint=?,content_time=?,time_basis=?,group_path=? WHERE memory_id=?",arrayOf(fingerprint,time,basis,group,id))
                d.execSQL("UPDATE memories SET bytes=?,mime=? WHERE id=?",arrayOf(size,mime,id))
            }
            d.execSQL("UPDATE source_items SET seen=? WHERE memory_id=?",arrayOf(epoch,id));return@synchronized id
        }
        val excluded=d.rawQuery("SELECT prefix FROM source_exclusions WHERE source_id=?",arrayOf(source.toString())).use{r->var yes=false;while(r.moveToNext())if(group.startsWith(r.getString(0)))yes=true;yes}
        val kind=when{mime.startsWith("image/")->"image";mime.startsWith("video/")->"video";mime.startsWith("audio/")->"audio";else->"file"}
        d.beginTransaction();try{
            val id=MemoryDb.get(c).add(kind,title,source="Authorized device content",path=uri.toString(),mime=mime,bytes=size)
            d.insertOrThrow("source_items",null,ContentValues().apply{put("memory_id",id);put("source_id",source);put("uri",uri.toString());put("fingerprint",fingerprint);put("content_time",time);put("time_basis",basis);put("group_path",group);put("seen",epoch);put("excluded",if(excluded)1 else 0)})
            d.setTransactionSuccessful();id
        }finally{d.endTransaction()}
    }
    /** One discover batch, then one textual asset. Caller owns thermal/time/capture policy. */
    fun step(c:Context,stop:AtomicBoolean):Boolean {
        reconcile(c);if(stop.get())return false
        val d=db(c)
        val source=d.rawQuery("SELECT id,source_key,kind,scan_epoch,cursor FROM library_sources WHERE enabled=1 AND status IN ('queued','processing') ORDER BY id LIMIT 1",null).use{if(it.moveToFirst())arrayOf(it.getLong(0).toString(),it.getString(1),it.getString(2),it.getLong(3).toString(),it.getLong(4).toString())else null}
        if(source!=null){
            val id=source[0].toLong()
            try { if(source[2]=="tree")scanTree(c,source,stop)else scanMedia(c,source,stop) }
            catch(e:SecurityException){revoke(c,id)}
            catch(e:Exception){d.execSQL("UPDATE library_sources SET status='failed',error=? WHERE id=?",arrayOf("Scan failed; retry or reauthorize folder",id))}
            return true
        }
        val id=d.rawQuery("SELECT si.memory_id FROM source_items si JOIN memories m ON m.id=si.memory_id JOIN library_sources ls ON ls.id=si.source_id WHERE si.excluded=0 AND ls.enabled=1 AND si.state IN ('queued','processing') AND m.kind IN ('file','audio') LIMIT 1",null).use{if(it.moveToFirst())it.getLong(0)else null} ?: return false
        try {
            val item=MemoryDb.get(c).get(id)?:return true
            d.execSQL("UPDATE source_items SET state='processing' WHERE memory_id=?",arrayOf(id))
            val text=if(item.kind=="audio")null else DocumentText.extract(c,item,stop)
            if(stop.get())return true
            synchronized(VisualIndex){if(accessible(c,id)){
                if(text!=null)MemoryDb.get(c).setExtracted(id,text)
                d.execSQL("UPDATE source_items SET state=?,error=? WHERE memory_id=?",arrayOf(if(text!=null)"completed" else "unsupported",if(text==null)"Text extraction/transcription unavailable for this format" else null,id))
            }}
        }catch(e:SecurityException){invalidate(c,id)}catch(e:java.io.FileNotFoundException){invalidate(c,id)}catch(e:Exception){d.execSQL("UPDATE source_items SET state='failed',error='Extraction failed; retry available' WHERE memory_id=?",arrayOf(id))}
        return true
    }
    private fun completedScan(c:Context,id:Long,epoch:Long) {
        db(c).execSQL("UPDATE library_sources SET status='completed',error=NULL WHERE id=?",arrayOf(id))
        db(c).rawQuery("SELECT memory_id FROM source_items WHERE source_id=? AND seen<>? AND excluded=0",arrayOf(id.toString(),epoch.toString())).use{while(it.moveToNext())invalidate(c,it.getLong(0))}
    }
    private fun scanMedia(c:Context,s:Array<String>,stop:AtomicBoolean){
        val id=s[0].toLong();val epoch=s[3].toLong();val cursor=s[4].toLong()
        val collection=when(s[2]){"image"->MS.Images.Media.EXTERNAL_CONTENT_URI;"video"->MS.Video.Media.EXTERNAL_CONTENT_URI;else->MS.Audio.Media.EXTERNAL_CONTENT_URI}
        val cols=arrayOf("_id","_display_name","mime_type","_size","date_modified","date_added","relative_path") + if(s[2]!="audio")arrayOf("datetaken")else emptyArray()
        var n=0;var last=cursor
        c.contentResolver.query(collection,cols,"_id>? AND is_pending=0",arrayOf(cursor.toString()),"_id ASC")?.use{r->
            while(n<100&&!stop.get()&&r.moveToNext()){
                last=r.getLong(0);val taken=if(s[2]!="audio")r.getLong(7) else 0L;val added=if(taken>0)taken else r.getLong(5)*1000
                upsert(c,id,ContentUris.withAppendedId(collection,last),r.getString(1)?:"Untitled",r.getString(2)?:"application/octet-stream",r.getLong(3),r.getLong(4),added,if(taken>0)"capture_time" else "media_added",r.getString(6)?:"",epoch);n++
                db(c).execSQL("UPDATE library_sources SET status='processing',cursor=? WHERE id=?",arrayOf(last,id))
            }
        }?:error("Media query unavailable")
        if(n<100&&!stop.get())completedScan(c,id,epoch)
    }
    private fun scanTree(c:Context,s:Array<String>,stop:AtomicBoolean){
        val id=s[0].toLong();val tree=Uri.parse(s[1]);val epoch=s[3].toLong();val d=db(c)
        d.execSQL("INSERT OR IGNORE INTO scan_folders(source_id,document_id) VALUES(?,?)",arrayOf(id,DC.getTreeDocumentId(tree)))
        val folder=d.rawQuery("SELECT document_id,offset FROM scan_folders WHERE source_id=? AND done=0 LIMIT 1",arrayOf(id.toString())).use{if(it.moveToFirst())it.getString(0) to it.getInt(1)else null}
        if(folder==null){completedScan(c,id,epoch);return}
        val uri=DC.buildChildDocumentsUriUsingTree(tree,folder.first);var n=0;var position=0
        c.contentResolver.query(uri,arrayOf(DC.Document.COLUMN_DOCUMENT_ID,DC.Document.COLUMN_DISPLAY_NAME,DC.Document.COLUMN_MIME_TYPE,DC.Document.COLUMN_SIZE,DC.Document.COLUMN_LAST_MODIFIED),null,null,null)?.use{r->
            while(n<100&&!stop.get()&&r.moveToNext()){
                if(position++<folder.second)continue
                val doc=r.getString(0);val mime=r.getString(2)?:"application/octet-stream"
                val excluded=d.rawQuery("SELECT prefix FROM source_exclusions WHERE source_id=?",arrayOf(id.toString())).use{q->var yes=false;while(q.moveToNext())if(doc.startsWith(q.getString(0)))yes=true;yes}
                if(!excluded){if(mime==DC.Document.MIME_TYPE_DIR)d.execSQL("INSERT OR IGNORE INTO scan_folders(source_id,document_id) VALUES(?,?)",arrayOf(id,doc)) else upsert(c,id,DC.buildDocumentUriUsingTree(tree,doc),r.getString(1)?:"Untitled",mime,r.getLong(3),r.getLong(4),r.getLong(4),"file_modified",doc,epoch)}
                n++;d.execSQL("UPDATE scan_folders SET offset=? WHERE source_id=? AND document_id=?",arrayOf(position,id,folder.first))
            }
        }?:error("Folder unavailable")
        if(n<100&&!stop.get())d.execSQL("UPDATE scan_folders SET done=1 WHERE source_id=? AND document_id=?",arrayOf(id,folder.first))
    }
}
