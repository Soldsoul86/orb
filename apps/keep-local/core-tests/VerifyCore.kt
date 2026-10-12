package com.keep.local.next

fun main() {
    fun check(label: String, actual: Any?, expected: Any?) {
        require(actual == expected) { "$label expected=$expected actual=$actual" }
        println("PASS: $label")
    }
    check("Empty query", CoreLogic.ftsQuery(""), "")
    check("Quote injection tokenized", CoreLogic.ftsQuery("hello\" OR *"), "\"hello*\" \"or*\"")
    check("Unicode query", CoreLogic.ftsQuery("தமிழ் 12"), "\"தமிழ்*\" \"12*\"")
    check("Punctuation", CoreLogic.ftsQuery("video:purchase/idea"), "\"video*\" \"purchase*\" \"idea*\"")
    check("Possible reminder", CoreLogic.suggestedFlag("call", "Please remind me tomorrow"), "Possible date or reminder — verify")
    check("Possible commitment", CoreLogic.suggestedFlag("note", "I'll send the design"), "Possible commitment — verify")
    check("Not hallucinating", CoreLogic.suggestedFlag("recipe", "tomato pasta"), null)
    check("1080x2400 portrait", CoreLogic.videoSize(1080,2400), 576 to 1280)
    check("1920x1080 landscape", CoreLogic.videoSize(1920,1080), 1280 to 720)
    check("720p unscaled", CoreLogic.videoSize(1280,720), 1280 to 720)
    check("1MB", CoreLogic.prettyBytes(1_048_576), "1.0 MB")
    println("11 deterministic core tests passed")
}
