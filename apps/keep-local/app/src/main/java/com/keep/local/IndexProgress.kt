package com.keep.local.next

import android.content.Context
import android.content.ContentValues
import android.app.job.JobScheduler
import android.os.SystemClock
import java.util.concurrent.atomic.AtomicBoolean

/** State claims come from committed assets. A partial video checkpoint is not completion. */
object IndexProgress {
    @Volatile var activeStop:AtomicBoolean?=null
    @Volatile var activeId:Long?=null
    @Volatile var running=false
    fun prefs(c:Context)=c.getSharedPreferences("index_runtime",0)
    fun phase(c:Context,label:String,id:Long?=null) {
        activeId=id
        prefs(c).edit().putString("phase",label).putLong("heartbeat",System.currentTimeMillis()).apply()
    }
    fun problem(c:Context,message:String){prefs(c).edit().putString("last_error",message.take(120)).apply()}
    fun next(c:Context,kinds:String):Long? {
        val now=System.currentTimeMillis()
        return AuthorizedLibrary.db(c).rawQuery("""SELECT a.memory_id FROM assets a
            JOIN memories ON memories.id=a.memory_id LEFT JOIN index_retry ir ON ir.memory_id=a.memory_id
            WHERE memories.kind IN ($kinds) AND a.state IN ('not_indexed','indexing','error')
            AND (ir.memory_id IS NULL AND a.state!='error' OR ir.attempts<3 AND ir.retry_at<=?)
            AND ${LibrarySchema.VISIBLE} ORDER BY a.updated_at,a.memory_id LIMIT 1""",arrayOf(now.toString())).use{if(it.moveToFirst())it.getLong(0)else null}
    }
    fun failed(c:Context,id:Long,error:Throwable) {
        val d=AuthorizedLibrary.db(c);val now=System.currentTimeMillis()
        synchronized(VisualIndex){
            d.beginTransaction();try{
                d.execSQL("INSERT OR IGNORE INTO index_retry(memory_id) SELECT id FROM memories WHERE id=?",arrayOf(id))
                val attempts=d.rawQuery("SELECT attempts FROM index_retry WHERE memory_id=?",arrayOf(id.toString())).use{if(it.moveToFirst())it.getInt(0)+1 else return}
                val delay=if(attempts==1)30_000L else 120_000L
                val reason=error.javaClass.simpleName.take(80) // Never log provider paths or private excerpts.
                d.execSQL("UPDATE index_retry SET attempts=?,retry_at=?,error=? WHERE memory_id=?",arrayOf(attempts,now+delay,reason,id))
                d.execSQL("UPDATE assets SET state='error',error=?,updated_at=? WHERE memory_id=?",arrayOf(reason,now,id))
                d.execSQL("UPDATE source_items SET state='failed',error=? WHERE memory_id=?",arrayOf(reason,id))
                d.setTransactionSuccessful();problem(c,reason)
            }finally{d.endTransaction()}
        }
    }
    /** Must be invoked inside the transaction committing the representation / document. */
    fun committed(c:Context,id:Long,stage:String,elapsed:Long,complete:Boolean) {
        val d=AuthorizedLibrary.db(c)
        d.delete("index_retry","memory_id=?",arrayOf(id.toString()))
        d.execSQL("UPDATE assets SET updated_at=? WHERE memory_id=?",arrayOf(System.currentTimeMillis(),id))
        d.insertOrThrow("index_events",null,ContentValues().apply {
            put("committed_at",System.currentTimeMillis());put("stage",stage)
            put("kind",MemoryDb.get(c).get(id)?.kind?:"unknown")
            put("elapsed_ms",elapsed.coerceAtLeast(1));put("completed",if(complete)1 else 0)
        })
        d.execSQL("DELETE FROM index_events WHERE id <= (SELECT max(id)-256 FROM index_events)")
    }
    fun retryFailed(c:Context) = synchronized(VisualIndex) {
        val d=AuthorizedLibrary.db(c)
        d.beginTransaction();try{
            d.delete("index_retry",null,null)
            d.execSQL("UPDATE assets SET state='not_indexed',error=NULL WHERE state='error'")
            d.execSQL("UPDATE source_items SET state='queued',error=NULL WHERE state='failed'")
            d.setTransactionSuccessful()
        }finally{d.endTransaction()}
        VisualIndex.schedule(c)
    }
    fun retryDelay(c:Context):Long?=AuthorizedLibrary.db(c).rawQuery("SELECT min(retry_at) FROM index_retry ir JOIN assets a ON a.memory_id=ir.memory_id JOIN memories ON memories.id=a.memory_id WHERE attempts<3 AND a.state='error' AND ${LibrarySchema.VISIBLE}",null).use{
        if(it.moveToFirst()&&!it.isNull(0))(it.getLong(0)-System.currentTimeMillis()).coerceAtLeast(1000)else null
    }
    data class Counts(val kind:String,val discovered:Int,val basic:Int,val waiting:Int,val partial:Int,val fully:Int,val failed:Int,val unsupported:Int,val revoked:Int,val excluded:Int)
    fun counts(c:Context):List<Counts> = AuthorizedLibrary.db(c).rawQuery("""SELECT memories.kind,count(*),
        sum(CASE WHEN ${LibrarySchema.VISIBLE} THEN 1 ELSE 0 END),
        sum(CASE WHEN ${LibrarySchema.VISIBLE} AND a.state='not_indexed' AND memories.kind NOT IN ('note','link') THEN 1 ELSE 0 END),
        sum(CASE WHEN ${LibrarySchema.VISIBLE} AND a.state='indexing' THEN 1 ELSE 0 END),
        sum(CASE WHEN ${LibrarySchema.VISIBLE} AND (a.state='ready' OR memories.kind IN ('note','link')) THEN 1 ELSE 0 END),
        sum(CASE WHEN ${LibrarySchema.VISIBLE} AND a.state='error' THEN 1 ELSE 0 END),
        sum(CASE WHEN ${LibrarySchema.VISIBLE} AND a.state='unsupported' THEN 1 ELSE 0 END),
        sum(CASE WHEN si.state='access_revoked' OR ls.enabled=0 THEN 1 ELSE 0 END),
        sum(CASE WHEN si.excluded=1 THEN 1 ELSE 0 END)
        FROM memories JOIN assets a ON a.memory_id=memories.id
        LEFT JOIN source_items si ON si.memory_id=memories.id LEFT JOIN library_sources ls ON ls.id=si.source_id
        GROUP BY memories.kind""",null).use{r->buildList{while(r.moveToNext())add(Counts(r.getString(0),r.getInt(1),r.getInt(2),r.getInt(3),r.getInt(4),r.getInt(5),r.getInt(6),r.getInt(7),r.getInt(8),r.getInt(9)))}}
    fun report(c:Context):String {
        val rows=counts(c);val d=AuthorizedLibrary.db(c);val prefs=prefs(c)
        val pending=c.getSystemService(JobScheduler::class.java).getPendingJob(VisualIndex.JOB)
        val state=when{!VisualIndex.enabled(c)->"Paused";running->"Working";pending!=null->"Scheduled — Android controls start time (battery, storage and background limits)";else->"Idle — tap Resume to schedule"}
        fun row(x:Counts)="${x.kind}: ${x.discovered} discovered · ${x.basic} basic searchable · ${x.waiting+x.partial} awaiting deep (${x.partial} with checkpoint) · ${x.fully} fully indexed · ${x.failed} failed · ${x.unsupported} unsupported · ${x.revoked} access unavailable · ${x.excluded} excluded"
        val total=Counts("Total",rows.sumOf{it.discovered},rows.sumOf{it.basic},rows.sumOf{it.waiting},rows.sumOf{it.partial},rows.sumOf{it.fully},rows.sumOf{it.failed},rows.sumOf{it.unsupported},rows.sumOf{it.revoked},rows.sumOf{it.excluded})
        val roots=d.rawQuery("SELECT kind,status,count(*) FROM library_sources GROUP BY kind,status",null).use{r->buildList{while(r.moveToNext())add("${r.getString(0)}: ${r.getInt(2)} source(s) ${if(r.getString(1)=="processing")"enumerating files" else r.getString(1)}")}.joinToString("\n")}
        val throughput=d.rawQuery("SELECT count(*),coalesce(sum(completed),0),coalesce(sum(elapsed_ms),0),coalesce(max(committed_at),0),coalesce(min(committed_at),0) FROM index_events",null).use{r->r.moveToFirst();val span=r.getLong(3)-r.getLong(4);val rate=if(span>=60_000&&r.getInt(0)>=10)" · %.1f completed/min over this journal window".format(r.getInt(1)*60000.0/span)else " · waiting for a representative throughput window";"Recent committed units: ${r.getInt(0)}; completed assets: ${r.getInt(1)}; processing time: ${r.getLong(2)} ms$rate\nLast commit: ${if(r.getLong(3)>0)java.util.Date(r.getLong(3)).toString() else "none recorded in this version"}"}
        val bytes=listOf("","-wal","-shm").sumOf{java.io.File(c.getDatabasePath("memories.db").path+it).length()}
        val current=if(running)"${prefs.getString("phase","Starting")} · ${if(activeId==null)0 else 1} currently processing" else "0 currently processing"
        return "Keep Local 0.4.1 · Android ${android.os.Build.VERSION.SDK_INT}\n$state\n$current\n$roots\n\n${row(total)}\n${rows.joinToString("\n"){row(it)}}\n\nAwaiting metadata commit: 0 (inventory + filename/type/date search commit together). Inventory growth is not deep completion. Video checkpoints remain pending until all configured samples commit. Audio transcription is unsupported.\nModel: ${if(ModelPack.ready(c))"installed" else "not installed — visual processing waits"}\n$throughput\nLast worker status: ${prefs.getString("phase","Not started")}\nLast error class: ${prefs.getString("last_error","none")}\nDatabase + WAL: ${CoreLogic.prettyBytes(bytes)}\nNo completion estimate until representative throughput is available."
    }
}
