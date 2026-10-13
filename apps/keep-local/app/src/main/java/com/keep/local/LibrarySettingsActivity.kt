package com.keep.local.next

import android.app.Activity
import android.app.AlertDialog
import android.content.Intent
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.widget.*
import java.util.concurrent.Executors

/** Category consent is separate even on Android 10's shared media permission. */
class LibrarySettingsActivity:Activity(){
    private val io=Executors.newSingleThreadExecutor()
    private var pendingKind:String?=null
    private lateinit var root:LinearLayout
    private lateinit var progress:TextView
    private val handler=Handler(Looper.getMainLooper())
    private val refresh=object:Runnable{override fun run(){if(!isDestroyed){renderStatus();handler.postDelayed(this,2000)}}}
    override fun onCreate(state:Bundle?){super.onCreate(state);pendingKind=state?.getString("kind");draw()}
    override fun onSaveInstanceState(out:Bundle){out.putString("kind",pendingKind);super.onSaveInstanceState(out)}
    private fun draw(){
        root=LinearLayout(this).apply{orientation=1;setPadding(24,24,24,24)}
        val scroll=ScrollView(this);scroll.addView(root);setContentView(scroll);WindowInsetsHelper.applyTo(scroll)
        label("Choose what Keep Local can remember.",24f)
        label("Only sources you authorize are read. Originals stay where they are. Everything is processed on this device; no location or identity is inferred.")
        listOf("image" to "Photos","video" to "Videos","audio" to "Audio recordings").forEach{(kind,name)->button("Allow $name"){
            pendingKind=kind;requestPermissions(AuthorizedLibrary.permissions(kind),70)
        }}
        button("Choose document folder"){
            startActivityForResult(Intent(Intent.ACTION_OPEN_DOCUMENT_TREE).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION or Intent.FLAG_GRANT_PREFIX_URI_PERMISSION).putExtra(Intent.EXTRA_LOCAL_ONLY,true),71)
        }
        label("Text/Markdown/CSV and DOCX text: up to 2 MiB. PDF: OCR of the first 20 pages, Latin text. Other files retain metadata; saved-audio transcription is unavailable. Visual search uses your existing optional model pack.")
        button("Models and visual index"){startActivity(Intent(this,ModelsActivity::class.java))}
        button("Start / resume indexing"){VisualIndex.setEnabled(this,true);AuthorizedLibrary.rescan(this);renderStatus()}
        button("Pause indexing"){VisualIndex.setEnabled(this,false);renderStatus()}
        button("Rescan / retry"){AuthorizedLibrary.rescan(this);MemoryDb.get(this).writableDatabase.execSQL("UPDATE assets SET state='not_indexed' WHERE state='error'");renderStatus()}
        progress=label("Checking sources…")
        button("Manage authorized sources"){manageSources()}
        button("Remove derived index (keep originals)"){
            AlertDialog.Builder(this).setMessage("Remove derived text, visual vectors and suggestions? Originals, your notes and installed models remain. Indexing will pause.").setNegativeButton("Cancel",null).setPositiveButton("Remove"){_,_->io.execute{AuthorizedLibrary.clearDerived(this);runOnUiThread{renderStatus()}}}.show()
        }
        button("Android app permission settings"){startActivity(Intent(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS,android.net.Uri.parse("package:$packageName")))}
    }
    private fun manageSources(){
        val sources=mutableListOf<Pair<Long,String>>()
        AuthorizedLibrary.db(this).rawQuery("SELECT id,label,status FROM library_sources",null).use{while(it.moveToNext())sources.add(it.getLong(0) to "${it.getString(1)} · ${it.getString(2)}")}
        if(sources.isEmpty()){Toast.makeText(this,"No authorized sources",0).show();return}
        AlertDialog.Builder(this).setTitle("Authorized sources").setItems(sources.map{it.second}.toTypedArray()){_,i->
            val id=sources[i].first
            AlertDialog.Builder(this).setItems(arrayOf("Revoke access and remove derived content","Exclude a folder path / document ID prefix","Reset file/folder exclusions")){_,choice->when(choice){
                0->io.execute{AuthorizedLibrary.revoke(this,id);runOnUiThread{renderStatus()}}
                1->{val input=EditText(this).apply{hint="Example: Pictures/Private/"};AlertDialog.Builder(this).setTitle("Exclude a folder").setMessage("Enter the exact relative folder path for media, or a document ID prefix for a selected tree. Source details show these values.").setView(input).setNegativeButton("Cancel",null).setPositiveButton("Exclude"){_,_->if(input.text.isNotBlank())io.execute{AuthorizedLibrary.excludePrefix(this,id,input.text.toString());runOnUiThread{renderStatus()}}}.show()}
                2->{AuthorizedLibrary.db(this).delete("source_exclusions","source_id=?",arrayOf(id.toString()));AuthorizedLibrary.db(this).execSQL("UPDATE source_items SET excluded=0,state='queued' WHERE source_id=?",arrayOf(id));AuthorizedLibrary.rescan(this,id)}
            }}.show()
        }.show()
    }
    private fun renderStatus(){
        if(!::progress.isInitialized)return
        val d=AuthorizedLibrary.db(this)
        val summary=d.rawQuery("SELECT state,COUNT(*) FROM source_items GROUP BY state",null).use{r->buildList{while(r.moveToNext())add("${r.getInt(1)} ${r.getString(0).replace('_',' ')}")}.joinToString(" · ")}
        val roots=d.rawQuery("SELECT label,status FROM library_sources",null).use{r->buildList{while(r.moveToNext())add("${r.getString(0)}: ${r.getString(1)}")}.joinToString("\n")}
        val dbBytes=listOf("","-wal","-shm").sumOf{java.io.File(getDatabasePath("memories.db").path+it).length()}
        progress.text="${if(VisualIndex.enabled(this))"Indexing enabled" else "Paused"}\n$roots\n$summary\nDatabase: ${CoreLogic.prettyBytes(dbBytes)}\n${VisualIndex.status(this)}"
    }
    override fun onRequestPermissionsResult(code:Int,permissions:Array<out String>,results:IntArray){super.onRequestPermissionsResult(code,permissions,results)
        if(code==70){val kind=pendingKind?:return;pendingKind=null
            if(AuthorizedLibrary.granted(this,kind)){AuthorizedLibrary.enableMedia(this,kind);renderStatus()}else Toast.makeText(this,"Permission denied; this category stays off",1).show()
        }
    }
    @Deprecated("Platform callback") override fun onActivityResult(code:Int,result:Int,data:Intent?){super.onActivityResult(code,result,data)
        if(code==71&&result==RESULT_OK){val uri=data?.data?:return
            try{contentResolver.takePersistableUriPermission(uri,Intent.FLAG_GRANT_READ_URI_PERMISSION);AuthorizedLibrary.enableTree(this,uri);renderStatus()}catch(e:Exception){Toast.makeText(this,"Folder access could not be retained",1).show()}
        }
    }
    override fun onResume(){super.onResume();AuthorizedLibrary.reconcile(this);handler.post(refresh)}
    override fun onPause(){handler.removeCallbacks(refresh);super.onPause()}
    override fun onDestroy(){io.shutdown();super.onDestroy()}
    private fun label(s:String,size:Float=14f)=TextView(this).apply{text=s;textSize=size;setPadding(0,12,0,12);root.addView(this)}
    private fun button(s:String,action:()->Unit){root.addView(Button(this).apply{text=s;isAllCaps=false;setOnClickListener{action()}})}
}
