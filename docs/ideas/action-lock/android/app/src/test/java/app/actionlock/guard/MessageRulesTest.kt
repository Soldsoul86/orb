package app.actionlock.guard

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Test
import java.io.File

/** The Kotlin message guard must decide exactly as the TypeScript one. */
class MessageRulesTest {
    @Test
    fun matchesTheTypeScriptGuardOnEveryDraft() {
        val cases = JSONObject(File("../../test/message-vectors.json").readText()).getJSONArray("cases")
        for (i in 0 until cases.length()) {
            val c = cases.getJSONObject(i)
            val ctx = c.getJSONObject("ctx")
            val e = c.getJSONObject("expected")
            val r = MessageRules.check(c.getString("draft"), ctx.getBoolean("unknownSender"), ctx.getBoolean("onCall"))
            val label = c.getString("label")
            assertEquals(label, e.getString("mode"), r.decision.mode)
            assertEquals(label, e.getInt("seconds"), r.decision.seconds)
            val reasons = e.getJSONArray("reasons")
            assertEquals(label, (0 until reasons.length()).map { reasons.getString(it) }, r.decision.reasons)
            val f = e.getJSONArray("findings")
            assertEquals(label, (0 until f.length()).map { f.getString(it) }, r.findings)
        }
    }
}
