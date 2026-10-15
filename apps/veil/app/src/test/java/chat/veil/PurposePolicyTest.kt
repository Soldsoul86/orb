package chat.veil
import org.junit.Assert.*
import org.junit.Test
class PurposePolicyTest {
    @Test fun templatesRoundTripAndAreNotPublishedAutomatically() {
        listOf("Professional","Personal","Temporary sale").forEach {
            val p=PurposePolicy.template(it,1000)
            assertEquals(p,PurposePolicy.from(p.json()))
            assertNotEquals(DiscoveryMode.PUBLIC_SEARCHABLE,p.discovery)
        }
    }
    @Test fun unsupportedEnglishCannotSilentlyWidenPermissions() {
        val example="Weekdays, 9-6 India time; intro allowed, further messages require approval; text only."
        assertEquals(540,PurposePolicy.interpret(example).start)
        listOf(example.replace("text only","text and files only"),example+" Except at night.","Never allow weekdays","").forEach {
            assertTrue(runCatching { PurposePolicy.interpret(it) }.isFailure)
        }
    }
    @Test fun globalGrammarUsesDeviceZoneAndRejectsUnsupportedDocuments() {
        val sentence="Weekdays, 9-6 local time; intro allowed, further messages require approval; text only."
        assertEquals(java.time.ZoneId.systemDefault().id,PurposePolicy.interpretGlobal(sentence).timezone)
        assertTrue(runCatching {PurposePolicy.interpretGlobal(sentence.replace("text only","text and documents only"))}.isFailure)
        assertTrue(runCatching {PurposePolicy.interpretGlobal(sentence+" Except holidays.")}.isFailure)
    }
    @Test fun invalidScheduleAndContentFailClosed() {
        val p=PurposePolicy.template("Professional")
        listOf(p.copy(timezone="India"),p.copy(start=1080,end=540),p.copy(weekdays=emptyList()),p.copy(inactivityDays=0)).forEach {
            assertTrue(runCatching { it.validate() }.isFailure)
        }
        assertTrue(runCatching { PurposePolicy.from(p.json().put("allowed_content_types",org.json.JSONArray(listOf("text","video")))) }.isFailure)
    }
}
