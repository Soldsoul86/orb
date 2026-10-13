package com.keep.local.next

import android.app.*
import android.content.Intent
import android.os.*
import android.widget.*
import java.util.concurrent.Executors

class ModelsActivity:Activity() {
    private val io=Executors.newSingleThreadExecutor()
    private val cancel=CancellationSignal()
    private lateinit var status:TextView
    private val handler=Handler(Looper.getMainLooper())
    private val refresh=object:Runnable {override fun run(){showStatus();handler.postDelayed(this,1500)}}
    override fun onCreate(state:Bundle?) {
        super.onCreate(state)
        val root=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;setPadding(24,24,24,24)}
        val scroll=ScrollView(this).apply{addView(root)};setContentView(scroll);WindowInsetsHelper.applyTo(scroll)
        root.addView(TextView(this).apply{text="Your creative memory";textSize=25f})
        root.addView(TextView(this).apply{text="Find the right material for your next creation, wherever you choose to make it.\n\nVisual search uses a local CLIP model. It suggests similar images and sampled video frames, not confirmed actions or identities. Text search and existing capture/export work without it.\n\nChoose the provided visual-model-pack.zip from Files. About ${CoreLogic.prettyBytes(ModelPack.size(this@ModelsActivity))} on device. No content is uploaded. English queries work best."})
        status=TextView(this);root.addView(status)
        fun button(label:String, action:()->Unit){root.addView(Button(this).apply{text=label;isAllCaps=false;setOnClickListener{action()}})}
        button("Install local model pack") {startActivityForResult(Intent(Intent.ACTION_OPEN_DOCUMENT).setType("application/zip").addCategory(Intent.CATEGORY_OPENABLE).putExtra(Intent.EXTRA_LOCAL_ONLY,true),40)}
        button("Index / resume my library") {if(!ModelPack.ready(this))toast("Install the model pack first") else {VisualIndex.setEnabled(this,true);showStatus()}}
        button("Pause indexing") {VisualIndex.setEnabled(this,false);showStatus()}
        button("Retry failed items") {MemoryDb.get(this).writableDatabase.execSQL("UPDATE assets SET state='not_indexed',error=NULL WHERE state='error'");VisualIndex.setEnabled(this,true)}
        button("Remove visual model and index") {AlertDialog.Builder(this).setMessage("Originals, notes and OCR remain. Remove only the visual model and its derived index?").setNegativeButton("Cancel",null).setPositiveButton("Remove"){_,_->VisualIndex.clear(this);ModelPack.directory(this).deleteRecursively();showStatus()}.show()}
        root.addView(TextView(this).apply{text="Indexing waits when battery or storage is low, and pauses during severe thermal pressure. Frame checkpoints resume when the app is reopened after a restart. Search works with the portion already indexed.\n\nKeep Local does not recognize who you are. Use your own notes for confirmed identity context. Offline saved-audio transcription and action recognition are not included in this milestone."})
    }
    private fun showStatus(){if(!isDestroyed)status.text="\nModel: ${if(ModelPack.ready(this))"installed" else "not installed"}\nIndexing: ${if(VisualIndex.enabled(this))"enabled" else "paused"}\n${VisualIndex.status(this)}\n"}
    override fun onResume(){super.onResume();handler.post(refresh)}
    override fun onPause(){handler.removeCallbacks(refresh);super.onPause()}
    override fun onActivityResult(request:Int,result:Int,data:Intent?){super.onActivityResult(request,result,data);val uri=data?.data?:return
        if(request==40 && result==RESULT_OK){status.text="Installing model…";val app=applicationContext
            io.execute {try{ModelPack.install(app,uri,cancel);runOnUiThread{if(!isDestroyed){toast("Model installed. Tap Index / resume to process your library.");showStatus()}}}catch(e:Exception){runOnUiThread{if(!isDestroyed)toast("Model not installed: ${e.message}")}}}
        }
    }
    private fun toast(s:String)=Toast.makeText(this,s,Toast.LENGTH_LONG).show()
    override fun onDestroy(){cancel.cancel();handler.removeCallbacks(refresh);io.shutdownNow();super.onDestroy()}
}
