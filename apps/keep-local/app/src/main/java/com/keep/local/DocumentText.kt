package com.keep.local.next

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.pdf.PdfRenderer
import android.util.Xml
import com.google.android.gms.tasks.Tasks
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import java.io.ByteArrayInputStream
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import java.util.zip.ZipInputStream
import org.xmlpull.v1.XmlPullParser

/** Local bounded parsers. Limits are disclosed; no inferred dates or amounts. */
object DocumentText {
    private const val LIMIT=2*1024*1024
    fun extract(c:Context,item:MemoryItem,stop:AtomicBoolean):String? {
        val mime=item.mime.orEmpty()
        if(mime=="application/pdf")return pdf(c,item,stop)
        if(mime.startsWith("text/") || item.title.substringAfterLast('.').lowercase() in listOf("txt","md","csv")) {
            return MediaSource.open(c,item).use{val data=bounded(it);require(data.size<=LIMIT){"Text exceeds 2 MiB limit"};String(data,Charsets.UTF_8).take(250000)}
        }
        if(mime=="application/vnd.openxmlformats-officedocument.wordprocessingml.document" || item.title.endsWith(".docx",true)) {
            ZipInputStream(MediaSource.open(c,item)).use{zip->
                var count=0
                while(!stop.get() && count++<500){val entry=zip.nextEntry?:break
                    if(entry.name=="word/document.xml") {
                        val data=bounded(zip);require(data.size<=LIMIT){"Document XML exceeds 2 MiB"}
                        val parser=Xml.newPullParser();parser.setFeature(XmlPullParser.FEATURE_PROCESS_NAMESPACES,true);parser.setInput(ByteArrayInputStream(data),"UTF-8")
                        val out=StringBuilder();var inText=false
                        while(parser.eventType!=XmlPullParser.END_DOCUMENT && out.length<250000 && !stop.get()){
                            when(parser.eventType){XmlPullParser.START_TAG->if(parser.name=="t")inText=true
                                XmlPullParser.TEXT->if(inText)out.append(parser.text)
                                XmlPullParser.END_TAG->{if(parser.name=="t")inText=false;if(parser.name=="p")out.append('\n')}}
                            parser.next()
                        };return out.toString()
                    }
                }
            };return null
        }
        return null
    }
    private fun bounded(input:java.io.InputStream):ByteArray {
        val out=java.io.ByteArrayOutputStream();val b=ByteArray(8192)
        while(out.size()<=LIMIT){val n=input.read(b,0,minOf(b.size,LIMIT+1-out.size()));if(n<0)break;out.write(b,0,n)}
        return out.toByteArray()
    }
    private fun pdf(c:Context,item:MemoryItem,stop:AtomicBoolean):String {
        val out=StringBuilder();val recognizer=TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
        try { MediaSource.descriptor(c,item).use{fd->PdfRenderer(fd).use{pdf->
            for(p in 0 until minOf(pdf.pageCount,20)){
                if(stop.get()||VoiceService.active||ScreenService.active) {stop.set(true);break}
                pdf.openPage(p).use{page->
                    val scale=1280f/maxOf(page.width,page.height)
                    val bitmap=Bitmap.createBitmap((page.width*scale).toInt().coerceAtLeast(1),(page.height*scale).toInt().coerceAtLeast(1),Bitmap.Config.ARGB_8888)
                    try{bitmap.eraseColor(Color.WHITE);page.render(bitmap,null,null,PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
                        val result=Tasks.await(recognizer.process(InputImage.fromBitmap(bitmap,0)),30,TimeUnit.SECONDS)
                        out.append("[Page ${p+1}; OCR, verify original]\n").append(result.text).append('\n')
                    }finally{bitmap.recycle()}
                };if(out.length>=250000)break
            }
            if(pdf.pageCount>20)out.append("\n[Only first 20 pages indexed]")
        }}} finally{recognizer.close()}
        return out.take(250000).toString()
    }
}
