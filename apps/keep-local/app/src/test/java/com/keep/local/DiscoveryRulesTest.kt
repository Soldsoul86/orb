package com.keep.local.next
import org.junit.Assert.*
import org.junit.Test
class DiscoveryRulesTest {
    @Test fun factsStayLiteralAndUnsupportedClaimsAreNotGenerated(){
        val source="Manufacturer warranty\nWarranty expires 2028-06-30"
        val result=DiscoveryRules.document(source)!!
        assertTrue(result.title.startsWith("Possible"));result.excerpt.lines().forEach{assertTrue(source.contains(it))}
        assertFalse(result.excerpt.contains("2029"))
        assertNull(DiscoveryRules.document("A recipe for noodle soup, with no date."))
        assertNull(DiscoveryRules.document("We discussed the word warranty in class."))
        assertNull(DiscoveryRules.document("The receipt is an interesting word."))
        assertEquals("Possible purchase receipt",DiscoveryRules.document("Purchase receipt\nTotal INR 1250.00")!!.title)
        assertEquals("Date-like text to review",DiscoveryRules.document("Meeting 2027-01-03")!!.title)
    }
}
