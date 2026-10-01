package dev.orb.brain

/** The smallest check runner: no library, so a failure is the code's and not a framework's. */
object Harness {
    private var checks = 0
    private var failures = 0

    fun suite(name: String) = println("\n  $name")

    fun check(name: String, ok: Boolean) {
        checks++
        if (ok) println("    ok   $name") else { failures++; println("    FAIL $name") }
    }

    fun equal(name: String, actual: Any?, expected: Any?) {
        checks++
        if (actual == expected) {
            println("    ok   $name")
        } else {
            failures++
            println("    FAIL $name\n         expected: $expected\n         actual:   $actual")
        }
    }

    /** Passes only if [block] throws a [JsonError]. */
    fun refuses(name: String, block: () -> Unit) {
        val threw = try { block(); false } catch (e: JsonError) { true }
        check(name, threw)
    }

    fun report(): Int {
        println("\n  $checks checks, $failures failed")
        return if (failures == 0) 0 else 1
    }
}
