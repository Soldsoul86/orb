package com.keep.local.next

/** Deliberately narrow literal rules, not a generative agent. */
object DiscoveryRules {
    data class DocumentHint(val title:String,val excerpt:String,val reason:String)
    private val date=Regex("\\b(?:\\d{4}-\\d{2}-\\d{2}|\\d{1,2}[/.-]\\d{1,2}[/.-]\\d{2,4})\\b")
    fun document(text:String):DocumentHint? {
        if(text.isBlank())return null
        val warranty=Regex("\\bwarrant(?:y|ies)\\b",RegexOption.IGNORE_CASE)
        val receipt=Regex("\\b(?:receipt|invoice)\\b",RegexOption.IGNORE_CASE)
        val coverage=Regex("\\b(?:expires?|expiry|coverage|manufacturer|valid|period)\\b",RegexOption.IGNORE_CASE)
        val total=Regex("\\btotal\\b.*\\d",RegexOption.IGNORE_CASE)
        val category=when {
            warranty.containsMatchIn(text)&&coverage.containsMatchIn(text)->"Possible warranty information"
            receipt.containsMatchIn(text)&&(date.containsMatchIn(text)||total.containsMatchIn(text))->"Possible purchase receipt"
            date.containsMatchIn(text)->"A date is explicitly written in this document"
            else->return null
        }
        val lines=text.lineSequence().filter{warranty.containsMatchIn(it)||receipt.containsMatchIn(it)||coverage.containsMatchIn(it)||date.containsMatchIn(it)||total.containsMatchIn(it)}.take(4).joinToString("\n").take(1200)
        return DocumentHint(category,lines,"Literal wording in the source may be useful later. No deadline, amount or date has been inferred.")
    }
}
