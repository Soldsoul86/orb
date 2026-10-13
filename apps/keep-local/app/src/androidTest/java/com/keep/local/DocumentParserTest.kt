package com.keep.local.next

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File
import java.util.concurrent.atomic.AtomicBoolean

@RunWith(AndroidJUnit4::class)
class DocumentParserTest {
    private val c=InstrumentationRegistry.getInstrumentation().targetContext
    @Test fun docxAndPdfExtractActualLocalEvidenceWithoutChangingSources(){
        val word=File(AppFiles.mediaDir(c),"parser-fixture.docx")
        java.util.zip.ZipOutputStream(word.outputStream()).use{z->z.putNextEntry(java.util.zip.ZipEntry("word/document.xml"));z.write("<w:document xmlns:w=\"http://schemas.openxmlformats.org/wordprocessingml/2006/main\"><w:body><w:p><w:r><w:t>Warranty expires 2028-06-30</w:t></w:r></w:p></w:body></w:document>".toByteArray());z.closeEntry()}
        val pdf=File(AppFiles.mediaDir(c),"parser-fixture.pdf")
        android.graphics.pdf.PdfDocument().use{doc->val page=doc.startPage(android.graphics.pdf.PdfDocument.PageInfo.Builder(600,800,1).create());page.canvas.drawColor(android.graphics.Color.WHITE)
            val paint=android.graphics.Paint().apply{color=android.graphics.Color.BLACK;textSize=28f}
            page.canvas.drawText("Purchase receipt",40f,80f,paint);page.canvas.drawText("Invoice date 2026-09-17",40f,130f,paint);doc.finishPage(page);pdf.outputStream().use{doc.writeTo(it)}}
        for((file,mime,needle) in listOf(Triple(word,"application/vnd.openxmlformats-officedocument.wordprocessingml.document","2028-06-30"),Triple(pdf,"application/pdf","receipt"))){
            val before=file.readBytes();val id=MemoryDb.get(c).add("file",file.name,path=AppFiles.relativePath(c,file),mime=mime,bytes=file.length())
            try{val text=DocumentText.extract(c,MemoryDb.get(c).get(id)!!,AtomicBoolean(false))!!;assertTrue(text,text.contains(needle,true));assertArrayEquals(before,file.readBytes())}
            finally{MemoryDb.get(c).remove(id);file.delete()}
        }
    }
    @Test fun oversizedTextIsBoundedAndUnknownFormatsAreUnsupported(){
        val file=File(AppFiles.mediaDir(c),"oversized-parser.txt");file.outputStream().use{out->repeat(257){out.write(ByteArray(8192){65})}}
        val id=MemoryDb.get(c).add("file","oversized.txt",path=AppFiles.relativePath(c,file),mime="text/plain",bytes=file.length());val item=MemoryDb.get(c).get(id)!!
        try{assertThrows(IllegalArgumentException::class.java){DocumentText.extract(c,item,AtomicBoolean(false))};assertNull(DocumentText.extract(c,item.copy(title="legacy.doc",mime="application/msword"),AtomicBoolean(false)))}finally{MemoryDb.get(c).remove(id);file.delete()}
    }
}
