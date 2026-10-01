package dev.orb.brain

import java.io.File

/** The brain returns data and does nothing else: no Android, no files, no network, no clock, no output. */
object PurityTest {
    private val FORBIDDEN = listOf(
        "import android", "android.", "java.io", "java.nio", "java.net", "javax.", "kotlin.io",
        "System.", "println", "print(", "Thread", "Random", "java.time", "Instant", "Attachments", "File(")

    fun run(root: File) {
        Harness.suite("the brain is pure")
        val sources = File(root, "runtime/brain/src").walkTopDown().filter { it.isFile && it.name.endsWith(".kt") }.toList()
        Harness.check("sources found", sources.size >= 3)
        for (f in sources) {
            val code = f.readLines().filter { !it.trimStart().startsWith("*") && !it.trimStart().startsWith("/*") && !it.trimStart().startsWith("//") }
                .joinToString("\n")
            val hit = FORBIDDEN.firstOrNull { code.contains(it) }
            Harness.check("${f.name} touches nothing outside its inputs${if (hit != null) " (found '$hit')" else ""}", hit == null)
        }
    }
}
