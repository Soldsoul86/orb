package dev.orb.brain

object ObserverTest {
    private const val DEVICE = "orb-test"
    private val ID = "sha256:" + "ab".repeat(32)

    private fun line(id: String, type: String, payload: String, causes: String = "[]", device: String = DEVICE) =
        """{"causes":$causes,"device":"$device","id":"$id","payload":$payload,"type":"$type"}"""

    private fun captured(id: String) = line(id, "orb.assist.captured", """{"because":"remember","package":"com.example.chat","textChars":10,"attachment":"$ID"}""")
    private fun shared(id: String) = line(id, "orb.shared", """{"because":"share","references":"hello: world"}""")

    fun run() {
        Harness.suite("a device event with no Observation gets one, citing it")
        val plan = Observer.plan(listOf(captured("A1")))
        Harness.equal("one draft", plan.drafts.size, 1)
        val d = plan.drafts[0]
        Harness.equal("an Observation", d.type, "orb.observation")
        Harness.equal("citing the event", d.causes, listOf("A1"))
        Harness.equal("attributed to the sensor at this install", d.payload["source"], "orb.sensor.assist@$DEVICE")
        Harness.equal("with confidence in the occurrence", d.payload["confidencePercent"], 100L)
        Harness.equal("the attachment by identity", d.payload["attachments"], listOf(ID))
        Harness.equal("nothing unreadable", plan.unreadable, 0)

        Harness.suite("it is idempotent by citation, with nothing stored")
        val observed = listOf(captured("A1"), line("O1", "orb.observation", """{"source":"s","confidencePercent":100,"data":{}}""", """["A1"]"""))
        Harness.equal("an event an Observation already cites is not observed again", Observer.plan(observed).drafts.size, 0)
        val mixed = observed + shared("S1")
        val second = Observer.plan(mixed)
        Harness.equal("a new event beside an observed one gets exactly one", second.drafts.map { it.causes[0] }, listOf("S1"))
        Harness.equal("running on the result of running is a no-op",
            Observer.plan(mixed + line("O2", "orb.observation", "{}", """["S1"]""")).drafts.size, 0)
        Harness.equal("the order is the lane's order", Observer.plan(listOf(shared("S2"), captured("A2"), shared("S3"))).drafts.map { it.causes[0] },
            listOf("S2", "A2", "S3"))
        Harness.equal("the same lines give the same plan", Observer.plan(mixed).drafts.map { it.payload }, Observer.plan(mixed).drafts.map { it.payload })

        Harness.suite("only what Orb translates here")
        val others = listOf(
            line("G1", "grants.packages", """{"installedPackageReadable":true}"""),
            line("X1", "orb.export", """{"because":"operator export"}"""),
            line("D1", "orb.assist.declined", """{"reason":"notAllowed"}"""),
            line("P1", "orb.process.start", """{"versionCode":1}"""))
        Harness.equal("package scans, exports, declines and starts stay events", Observer.plan(others).drafts.size, 0)
        Harness.equal("a payload that is not an object is not observed", Observer.plan(listOf(line("A9", "orb.assist.captured", "[1,2]"))).drafts.size, 0)

        Harness.suite("an unreadable line means nothing is written")
        val damaged = listOf(captured("A1"), "{not json", shared("S1"))
        val refused = Observer.plan(damaged)
        Harness.equal("no drafts", refused.drafts.size, 0)
        Harness.equal("and it says why", refused.unreadable, 1)
        Harness.equal("a line missing its id is unreadable", Observer.plan(listOf("""{"device":"d","type":"orb.shared","causes":[],"payload":{}}""")).unreadable, 1)
        Harness.equal("a line whose causes are not strings is unreadable",
            Observer.plan(listOf("""{"id":"a","device":"d","type":"orb.shared","causes":[1],"payload":{}}""")).unreadable, 1)
        Harness.equal("a line with a fractional number is unreadable, whole",
            Observer.plan(listOf(captured("A1"), line("A2", "orb.assist.captured", """{"textChars":1.5}"""))).drafts.size, 0)
        Harness.equal("blank lines are not damage", Observer.plan(listOf("", captured("A1"), "")).drafts.size, 1)

        Harness.suite("the coarse (v2) envelope is read too")
        val v2 = """{"v":2,"device":"$DEVICE","id":"V1","type":"orb.content","payload":{"causes":[],"data":{"because":"remember","package":"a.b"},"nonce":"00","schema":{"id":"orb.assist.captured","version":1},"type":"orb.assist.captured"}}"""
        Harness.equal("a v2 device event is observed", Observer.plan(listOf(v2)).drafts.size, 1)
        val v2obs = """{"v":2,"device":"$DEVICE","id":"V2","type":"orb.content","payload":{"causes":["V1"],"data":{},"nonce":"00","schema":{"id":"orb.observation","version":1},"type":"orb.observation"}}"""
        Harness.equal("and a v2 Observation counts as citing it", Observer.plan(listOf(v2, v2obs)).drafts.size, 0)

        Harness.suite("a hostile payload cannot become content")
        val hostile = line("A5", "orb.assist.captured",
            """{"because":"remember","package":"a.b","text":"the secret words","nested":{"text":"more"},"attachment":"../../etc/passwd"}""")
        val h = Observer.plan(listOf(hostile)).drafts[0]
        Harness.check("unknown fields are not carried", !h.payload.toString().contains("secret") && !h.payload.toString().contains("more"))
        Harness.check("a path is not an attachment", h.payload["attachments"] == null)
    }
}
