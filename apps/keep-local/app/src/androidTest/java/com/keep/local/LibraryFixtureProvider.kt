package com.keep.local.next

import android.database.Cursor
import android.database.MatrixCursor
import android.os.CancellationSignal
import android.os.ParcelFileDescriptor
import android.provider.DocumentsContract as DC
import android.provider.DocumentsProvider
import java.io.File

/** Separate test UID, exposed only through Android's real document picker. */
class LibraryFixtureProvider:DocumentsProvider(){
    companion object { const val AUTH="com.keep.local.next.test.documents" }
    private fun folder()=File(requireNotNull(context).filesDir,"library-fixtures").apply{mkdirs()}
    override fun onCreate():Boolean {
        File(folder(),"warranty.txt").writeText("Manufacturer warranty\nWarranty expires 2028-06-30\nKeep this document for your records.\n")
        File(folder(),"receipt.txt").writeText("Purchase receipt\nInvoice date 2026-09-17\nTotal INR 1250.00\n")
        File(folder(),"negative.txt").writeText("A quiet afternoon with blue skies. No special plans.")
        return true
    }
    override fun queryRoots(projection:Array<out String>?):Cursor {
        val cols=projection?:arrayOf(DC.Root.COLUMN_ROOT_ID,DC.Root.COLUMN_DOCUMENT_ID,DC.Root.COLUMN_TITLE,DC.Root.COLUMN_FLAGS,DC.Root.COLUMN_MIME_TYPES,DC.Root.COLUMN_ICON,DC.Root.COLUMN_SUMMARY,DC.Root.COLUMN_AVAILABLE_BYTES)
        return MatrixCursor(cols).apply{addRow(cols.map{when(it){DC.Root.COLUMN_ROOT_ID->"fixtures";DC.Root.COLUMN_DOCUMENT_ID->"root";DC.Root.COLUMN_TITLE->"Keep Local fixtures";DC.Root.COLUMN_FLAGS->DC.Root.FLAG_SUPPORTS_IS_CHILD or DC.Root.FLAG_LOCAL_ONLY;DC.Root.COLUMN_MIME_TYPES->"*/*";DC.Root.COLUMN_ICON->android.R.drawable.ic_menu_agenda;DC.Root.COLUMN_SUMMARY->"Local read-only fixtures";DC.Root.COLUMN_AVAILABLE_BYTES->folder().usableSpace;else->null}})}
    }
    private fun row(out:MatrixCursor,id:String){out.addRow(out.columnNames.map{when(it){DC.Document.COLUMN_DOCUMENT_ID->id;DC.Document.COLUMN_DISPLAY_NAME->if(id=="root")"Keep Local fixtures" else id;DC.Document.COLUMN_MIME_TYPE->if(id=="root")DC.Document.MIME_TYPE_DIR else "text/plain";DC.Document.COLUMN_FLAGS->if(id=="root")DC.Document.FLAG_DIR_PREFERS_LAST_MODIFIED else 0;DC.Document.COLUMN_SIZE->if(id=="root")0 else File(folder(),id).length();DC.Document.COLUMN_LAST_MODIFIED->1700000000000L;else->null}})}
    private fun cols(projection:Array<out String>?)=projection?:arrayOf(DC.Document.COLUMN_DOCUMENT_ID,DC.Document.COLUMN_DISPLAY_NAME,DC.Document.COLUMN_MIME_TYPE,DC.Document.COLUMN_FLAGS,DC.Document.COLUMN_SIZE,DC.Document.COLUMN_LAST_MODIFIED)
    override fun queryDocument(documentId:String,projection:Array<out String>?)=MatrixCursor(cols(projection)).apply{row(this,documentId)}
    override fun queryChildDocuments(parentDocumentId:String,projection:Array<out String>?,sortOrder:String?)=MatrixCursor(cols(projection)).apply{if(parentDocumentId=="root")listOf("warranty.txt","receipt.txt","negative.txt").forEach{row(this,it)}}
    override fun isChildDocument(parentDocumentId:String,documentId:String)=parentDocumentId=="root"&&documentId in listOf("warranty.txt","receipt.txt","negative.txt")
    override fun openDocument(documentId:String,mode:String,signal:CancellationSignal?):ParcelFileDescriptor{
        require(mode=="r");require(documentId in listOf("warranty.txt","receipt.txt","negative.txt"));return ParcelFileDescriptor.open(File(folder(),documentId),ParcelFileDescriptor.MODE_READ_ONLY)
    }
}
