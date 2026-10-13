package com.keep.local.next

import android.app.Activity
import android.app.AlertDialog
import android.content.ClipData
import android.content.Intent
import android.graphics.BitmapFactory
import android.os.Bundle
import android.widget.*
import java.util.concurrent.Executors

/** Human review changes decisions and corrections, never source evidence. */
class ReviewActivity:Activity(){
    private val io=Executors.newSingleThreadExecutor()
    private lateinit var root:LinearLayout
    private var history=false
    private var selected:String?=null
    override fun onCreate(state:Bundle?){super.onCreate(state);history=state?.getBoolean("history")?:false;selected=state?.getString("selected")?:intent.getStringExtra("discovery_id")}
    override fun onSaveInstanceState(out:Bundle){out.putBoolean("history",history);out.putString("selected",selected);super.onSaveInstanceState(out)}
    override fun onResume(){super.onResume();load()}
    override fun onDestroy(){io.shutdown();super.onDestroy()}
    private fun load(generate:Boolean=false){
        if(isFinishing || isDestroyed)return
        shell();label(if(generate)"Finding suggestions…" else "Loading review…")
        io.execute{try{
            if(generate)DiscoveryEngine.generate(this)
            val detail=selected?.let{Discoveries.get(this,it)}?.takeIf{Discoveries.valid(this,it)}
            val records=if(detail==null)Discoveries.list(this,history)else emptyList()
            val metrics=Discoveries.metrics(this)
            runOnUiThread{if(!isDestroyed){shell();if(selected!=null&&detail!=null)showDetail(detail)else{selected=null;showQueue(records,metrics)}}}
        }catch(e:Exception){runOnUiThread{if(!isDestroyed){shell();label("Review unavailable. Your originals are unchanged.");button("Try again"){load()}}}}}
    }
    private fun shell(){root=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;setPadding(24,24,24,24)};val scroll=ScrollView(this);scroll.addView(root);setContentView(scroll);WindowInsetsHelper.applyTo(scroll)}
    private fun showQueue(records:List<Discovery>,metrics:Pair<Int,Int>){
        label("Worth Reviewing",26f)
        label("Suggestions are optional. Inspect the evidence and decide what is useful.")
        button(if(history)"Suggested" else "Review history"){history=!history;load()}
        button("Find suggestions in indexed content"){load(true)}
        if(records.isEmpty())label(if(history)"No review decisions yet." else "Nothing to review yet. Choose sources in Settings and index supported content. Existing notes can also provide suggestions.")
        records.forEach{d->
            label(if(d.correction.isBlank())d.suggestion else d.correction,19f)
            label("${d.type.replace('_',' ')} · ${d.status} · ${d.evidence.size} sources")
            label(d.reason)
            button("Review sources and decide"){selected=d.id;load()}
        }
        label("${metrics.first} discoveries kept, corrected or requested for sharing; ${metrics.second} indexed assets. " + (if(metrics.second>0) "${"%.1f".format(java.util.Locale.ROOT,100.0*metrics.first/metrics.second)} per 100 currently indexed assets. " else "") + "Sharing requests do not confirm receipt by another app.",12f)
        button("Settings"){startActivity(Intent(this,LibrarySettingsActivity::class.java))}
    }
    private fun showDetail(d:Discovery){
        label("Worth Reviewing",24f)
        label(d.suggestion,21f)
        if(d.correction.isNotBlank())label("Your correction: ${d.correction}",18f)
        label("Why it may matter\n${d.reason}")
        label("${d.uncertainty}\n${d.score?.let{"Similarity: ${"%.3f".format(java.util.Locale.ROOT,it)}\n"}.orEmpty()}Status: ${d.status}")
        label("Evidence",20f)
        d.evidence.forEach{e->
            val item=MemoryDb.get(this).get(e.id)?:return@forEach
            label("${item.title} · ${item.kind}${if(item.kind=="video")" · near ${e.start/1000}s" else ""}",17f)
            label("Asset ${e.uuid}",11f)
            val thumb=VisualIndex.thumbnail(this,e.id,e.start)
            if(thumb.isFile)root.addView(ImageView(this).apply{setImageBitmap(BitmapFactory.decodeFile(thumb.path));adjustViewBounds=true;maxHeight=200})
            if(e.excerpt.isNotBlank())label(e.excerpt)
            button("Open source: ${item.title}"){startActivity(Intent(this,EditorActivity::class.java).putExtra("id",e.id).putExtra("visual_start_ms",if(d.type=="reusable")e.start else -1L))}
        }
        button("Keep"){decide(d,"kept","relevant")}
        button("Correct"){
            val input=EditText(this).apply{setText(d.correction.ifBlank{d.suggestion});minLines=3}
            AlertDialog.Builder(this).setTitle("Your correction").setMessage("Saved separately. Original evidence and machine wording remain unchanged.").setView(input).setNegativeButton("Cancel",null).setPositiveButton("Save correction"){_,_->if(input.text.isNotBlank())decide(d,"corrected","corrected_information",input.text.toString())}.show()
        }
        button("Dismiss"){
            val reasons=arrayOf("Incorrect relationship or information","Duplicate suggestion","Uninteresting to me")
            AlertDialog.Builder(this).setTitle("Dismiss — optional feedback").setItems(reasons){_,i->decide(d,"dismissed",listOf("incorrect_relationship","duplicate","uninteresting")[i])}.setNegativeButton("Cancel",null).show()
        }
        button("Use / Share originals"){share(d)}
        label("Created ${java.text.DateFormat.getDateTimeInstance().format(java.util.Date(d.created))}\nProcessing: ${d.version}",11f)
        button("Back to queue"){selected=null;load()}
    }
    private fun decide(d:Discovery,status:String,feedback:String,correction:String=""){
        io.execute{try{Discoveries.review(this,d.id,status,feedback,correction);runOnUiThread{selected=null;load()}}catch(e:Exception){runOnUiThread{Toast.makeText(this,"Sources changed or are unavailable. Refresh to review current evidence.",Toast.LENGTH_LONG).show();load()}}}
    }
    private fun share(d:Discovery){
        io.execute{try{
            check(Discoveries.valid(this,d))
            val items=d.evidence.mapNotNull{MemoryDb.get(this).get(it.id)}
            val files=items.filter{it.path!=null};files.forEach{MediaSource.check(this,it)}
            val intent=if(files.isEmpty())Intent(Intent.ACTION_SEND).apply{type="text/plain";putExtra(Intent.EXTRA_TEXT,items.joinToString("\n\n"){it.title+"\n"+it.body})}
            else if(files.size==1)MediaExport.sendIntent(this,files.first())
            else Intent(Intent.ACTION_SEND_MULTIPLE).apply{
                type=files.map{MediaExport.mime(it)}.distinct().singleOrNull()?:"*/*"
                val uris=ArrayList(files.map{AppFiles.itemUri(it.id)});putParcelableArrayListExtra(Intent.EXTRA_STREAM,uris)
                clipData=ClipData.newUri(contentResolver,"Keep Local originals",uris.first()).apply{uris.drop(1).forEach{addItem(ClipData.Item(it))}}
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
            Discoveries.review(this,d.id,"share_requested","useful_content")
            runOnUiThread{if(!isDestroyed)try{startActivity(Intent.createChooser(intent,"Share originals"))}catch(e:Exception){Toast.makeText(this,"No compatible app. Open a source and Save to Files.",Toast.LENGTH_LONG).show()}}
        }catch(e:Exception){runOnUiThread{Toast.makeText(this,"Source unavailable. Originals were not changed.",Toast.LENGTH_LONG).show()}}}
    }
    private fun label(text:String,size:Float=14f){root.addView(TextView(this).apply{this.text=text;textSize=size;setPadding(0,12,0,12)})}
    private fun button(text:String,action:()->Unit){root.addView(Button(this).apply{this.text=text;isAllCaps=false;setOnClickListener{action()}})}
}
