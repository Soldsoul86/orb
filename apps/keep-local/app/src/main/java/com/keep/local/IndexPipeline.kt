package com.keep.local.next

import android.content.Context
import android.os.PowerManager
import java.util.concurrent.atomic.AtomicBoolean

/** Each round gives inventory, documents/audio and visual work a turn. No stage drains first. */
object IndexPipeline {
    fun restricted(c:Context)=VoiceService.active||ScreenService.active||c.getSystemService(PowerManager::class.java).currentThermalStatus>=PowerManager.THERMAL_STATUS_SEVERE
    fun round(c:Context,stop:AtomicBoolean,encoder:()->VisualEncoder):Boolean {
        if(stop.get())return false
        var worked=AuthorizedLibrary.discoverStep(c,stop)
        if(stop.get())return worked
        if(restricted(c))throw IndexDeferred()
        worked=AuthorizedLibrary.textStep(c,stop)||worked
        if(stop.get())return worked
        if(restricted(c))throw IndexDeferred()
        if(ModelPack.ready(c)) {
            val id=IndexProgress.next(c,"'image','video'")
            if(id!=null) {
                try{VisualIndexJob.indexOne(c,id,encoder(),stop)}
                catch(e:IndexDeferred){throw e}
                catch(e:SecurityException){AuthorizedLibrary.invalidate(c,id)}
                catch(e:java.io.FileNotFoundException){if(MemoryDb.get(c).get(id)?.let{MediaSource.external(it)}==true)AuthorizedLibrary.invalidate(c,id)else IndexProgress.failed(c,id,e)}
                catch(e:Exception){if(!stop.get())IndexProgress.failed(c,id,e)}
                worked=true
            }
        }
        return worked
    }
}
