package com.keep.local.next
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.*
import org.junit.Test

class DiscoveryRecordTest {
    private val c=InstrumentationRegistry.getInstrumentation().targetContext
    @Test fun immutableEvidenceCorrectionsDeduplicationAndDeletion(){
        val db=MemoryDb.get(c);val id=db.add("note","Untitled","Manufacturer warranty\nWarranty expires 2031-02-03")
        try{
            val e=Discoveries.evidence(c,id,"document",excerpt="Warranty expires 2031-02-03")!!
            val key=Discoveries.propose(c,"document","Possible warranty","Exact words","Unverified usefulness",listOf(e))!!
            val original=db.get(id);val evidence=Discoveries.get(c,key)!!.evidence
            assertEquals(key,Discoveries.propose(c,"document","Different machine phrasing","Exact words","Unverified",listOf(e)))
            Discoveries.review(c,key,"corrected","corrected_information","This is the spare camera warranty")
            assertEquals(original,db.get(id));assertEquals(evidence,Discoveries.get(c,key)!!.evidence)
            assertEquals("This is the spare camera warranty",Discoveries.get(c,key)!!.correction)
            Discoveries.review(c,key,"dismissed","duplicate")
            // An explicit later Keep overrides prior dismissal for this evidence.
            Discoveries.review(c,key,"kept","relevant")
            assertEquals(0,db.readableDatabase.rawQuery("SELECT count(*) FROM dismissed_evidence WHERE asset_uuid=?",arrayOf(e.uuid)).use{it.moveToFirst();it.getInt(0)})
            Discoveries.review(c,key,"dismissed","duplicate")
            db.writableDatabase.delete("discoveries","id=?",arrayOf(key))
            assertNull(Discoveries.propose(c,"document","New phrasing","Exact words","Unverified",listOf(e)))
            val fake=e.copy(uuid="wrong-identity",revision="not-a-real-revision")
            assertNull(Discoveries.propose(c,"document","Bad reference","","",listOf(fake)))
            db.update(id,"Untitled","Manufacturer warranty\nWarranty expires 2032-04-05",false)
            val changed=Discoveries.evidence(c,id,"document",excerpt="Warranty expires 2032-04-05")!!
            val next=Discoveries.propose(c,"document","New evidence","Literal changed date","Unverified",listOf(changed))!!
            assertNotEquals(key,next);db.remove(id);assertNull(Discoveries.get(c,next))
        }finally{db.remove(id)}
    }
    @Test fun missingSourcesNeverCreateSuggestions(){
        assertNull(Discoveries.evidence(c,Long.MAX_VALUE,"document"))
        assertNull(Discoveries.propose(c,"document","Missing evidence","","",emptyList()))
    }
}
