package dev.orb.brain

import java.io.File
import kotlin.system.exitProcess

fun main(args: Array<String>) {
    println("phone brain, host tests")
    JsonTest.run()
    ObserverTest.run()
    TranslateTest.run(File(args.firstOrNull() ?: "."))
    GraphTest.run(File(args.firstOrNull() ?: "."))
    HandlesTest.run(File(args.firstOrNull() ?: "."))
    PurityTest.run(File(args.firstOrNull() ?: "."))
    exitProcess(Harness.report())
}
