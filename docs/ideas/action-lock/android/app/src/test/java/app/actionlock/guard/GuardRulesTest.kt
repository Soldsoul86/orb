package app.actionlock.guard

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Test
import java.io.File

/** The Kotlin guard must decide exactly as the TypeScript one: same cases, same answers. */
class GuardRulesTest {
    private val vectors = JSONObject(File("../../test/guard-vectors.json").readText())
    private val table = GuardTable.parse(vectors.getJSONObject("table").toString())

    @Test
    fun matchesTheTypeScriptGuardOnEveryCase() {
        val cases = vectors.getJSONArray("cases")
        for (i in 0 until cases.length()) {
            val c = cases.getJSONObject(i)
            val expected = c.getJSONObject("expected")
            val name = if (c.has("name")) c.getString("name") else null
            val d = GuardRules.decide(table, name, c.getDouble("amount"), c.getInt("hour"), c.optBoolean("onCall"), c.optBoolean("fromRequest"))
            val label = c.getString("label")
            assertEquals(label, expected.getString("mode"), d.mode)
            assertEquals(label, expected.getInt("seconds"), d.seconds)
            val reasons = expected.getJSONArray("reasons")
            assertEquals(label, (0 until reasons.length()).map { reasons.getString(it) }, d.reasons)
        }
    }

    @Test
    fun learnsFromAppHistoryExactlyAsTheTypeScriptGuard() {
        val seenJson = vectors.getJSONArray("seen")
        val seen = (0 until seenJson.length()).map { i ->
            val s = seenJson.getJSONObject(i)
            val a = s.getJSONArray("amounts")
            SeenPayee(s.getString("name"), (0 until a.length()).map { a.getDouble(it) })
        }
        val merged = GuardRules.withSeen(table, seen)
        val cases = vectors.getJSONArray("seenCases")
        for (i in 0 until cases.length()) {
            val c = cases.getJSONObject(i)
            val expected = c.getJSONObject("expected")
            val d = GuardRules.decide(merged, c.getString("name"), c.getDouble("amount"), c.getInt("hour"))
            val label = c.getString("label")
            assertEquals(label, expected.getString("mode"), d.mode)
            assertEquals(label, expected.getInt("seconds"), d.seconds)
            val reasons = expected.getJSONArray("reasons")
            assertEquals(label, (0 until reasons.length()).map { reasons.getString(it) }, d.reasons)
        }
    }

    @Test
    fun rupeesUseIndianGrouping() {
        assertEquals("₹180", GuardRules.rupees(180.0))
        assertEquals("₹12,050", GuardRules.rupees(12050.0))
        assertEquals("₹1,00,000", GuardRules.rupees(100000.0))
        assertEquals("₹2,71,149", GuardRules.rupees(271149.4))
    }
}
