package chat.veil
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
class PurposeCipherTest {
    private fun pair(): Pair<JSONObject,JSONObject> {
        val a=JSONObject();val b=JSONObject();SignalSession.initialize(a);SignalSession.initialize(b)
        a.put("peer",PurposeCipher.bundle(b));b.put("peer",PurposeCipher.bundle(a))
        listOf(a,b).forEach { it.put("id","a".repeat(32)).put("facet","b".repeat(32)) }
        return a to b
    }
    private fun message()=JSONObject().put("v",1).put("grant","a".repeat(32)).put("facet","b".repeat(32))
        .put("id","c".repeat(32)).put("kind","text").put("text","Private consulting introduction").put("expires",2000000000L)
    @Test fun realIntroductionAndReplyWithExistingSignalAdapter() {
        val(a,b)=pair();val cipher=PurposeCipher.seal(a,message())
        assertFalse(cipher.toString(Charsets.ISO_8859_1).contains("consulting"))
        assertEquals("Private consulting introduction",PurposeCipher.open(b,cipher).getString("text"))
        val reply=PurposeCipher.seal(b,message().put("text","Approved reply"))
        assertEquals("Approved reply",PurposeCipher.open(a,reply).getString("text"))
    }
    @Test fun authenticatedFacetAndGrantCannotBeRerouted() {
        val(a,b)=pair();val cipher=PurposeCipher.seal(a,message())
        val wrong=JSONObject(b.toString()).put("facet","d".repeat(32))
        assertTrue(runCatching { PurposeCipher.open(wrong,cipher) }.isFailure)
        val wrongGrant=JSONObject(b.toString()).put("id","e".repeat(32))
        assertTrue(runCatching { PurposeCipher.open(wrongGrant,cipher) }.isFailure)
        assertEquals("text",PurposeCipher.open(b,cipher).getString("kind"))
    }
}
