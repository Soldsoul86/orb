package app.actionlock.guard

import org.json.JSONObject

/**
 * Kotlin copy of decideGuard in src/orb/guard.ts: how the lock treats a
 * payment seen on a pay screen. Pure. Kept identical to the TypeScript one by
 * GuardRulesTest, which runs the shared cases in test/guard-vectors.json.
 */
data class GuardPayee(val key: String, val name: String, val usual: Double, val max: Double, val passUpTo: Double, val relation: String?)

data class GuardTable(val largeAmount: Double, val usual: Double, val quietFrom: Int?, val quietTo: Int?, val payees: List<GuardPayee>) {
    companion object {
        fun parse(json: String): GuardTable {
            val o = JSONObject(json)
            val q = o.optJSONObject("quiet")
            val ps = o.getJSONArray("payees")
            val payees = (0 until ps.length()).map { i ->
                val p = ps.getJSONObject(i)
                GuardPayee(
                    key = p.getString("key"),
                    name = p.getString("name"),
                    usual = p.getDouble("usual"),
                    max = p.getDouble("max"),
                    passUpTo = p.getDouble("passUpTo"),
                    relation = if (p.has("relation")) p.getString("relation") else null,
                )
            }
            return GuardTable(o.getDouble("largeAmount"), o.getDouble("usual"), q?.getInt("from"), q?.getInt("to"), payees)
        }
    }
}

data class GuardDecision(val mode: String, val seconds: Int, val reasons: List<String>)

object GuardRules {
    private val trusted = setOf("family", "you", "own account")

    fun letters(s: String): String = s.lowercase().filter { it in 'a'..'z' }

    /** ₹ with Indian digit grouping: 1,00,000. */
    fun rupees(n: Double): String {
        val digits = Math.round(n).toString()
        if (digits.length <= 3) return "₹$digits"
        val head = digits.dropLast(3)
        val grouped = head.reversed().chunked(2).joinToString(",").reversed()
        return "₹$grouped,${digits.takeLast(3)}"
    }

    private fun hh(h: Int) = "%02d:00".format(h)

    fun find(table: GuardTable, name: String?): GuardPayee? {
        if (name == null) return null
        val n = letters(name)
        if (n.length < 3) return null
        val exact = table.payees.firstOrNull { it.key == n }
        if (exact != null || n.length < 8) return exact
        return table.payees.firstOrNull { it.key.length >= 8 && (it.key.startsWith(n) || n.startsWith(it.key)) }
    }

    fun decide(table: GuardTable, name: String?, amount: Double, hour: Int): GuardDecision {
        val reasons = mutableListOf<String>()
        var seconds = 0
        var confirm = false
        val p = find(table, name)
        val large = amount >= table.largeAmount

        if (p == null) {
            reasons += if (name == null) "Orb couldn't read who this payment is to." else "You've never paid $name before."
            seconds = 10
            if (large) {
                confirm = true
                seconds = 30
                reasons += "${rupees(amount)} is a large amount; your usual payment is ${rupees(table.usual)}."
            }
        } else if (amount > p.passUpTo) {
            seconds = if (large) 30 else 10
            confirm = large && !(p.relation != null && p.relation in trusted)
            reasons += "${rupees(amount)} is more than you've paid ${p.name} before (most: ${rupees(p.max)}, usually ${rupees(p.usual)})."
        }

        val from = table.quietFrom
        val to = table.quietTo
        if (from != null && to != null) {
            val inQuiet = if (from <= to) hour >= from && hour < to else hour >= from || hour < to
            if (inQuiet && (seconds > 0 || amount >= table.usual * 3)) {
                seconds += 10
                reasons += "It's ${hh(hour)}: you rarely pay between ${hh(from)} and ${hh(to)}."
            }
        }
        return GuardDecision(if (seconds == 0) "pass" else if (confirm) "confirm" else "wait", seconds, reasons)
    }
}
