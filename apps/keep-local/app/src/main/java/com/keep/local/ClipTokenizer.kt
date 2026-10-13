package com.keep.local.next

import org.json.JSONObject
import java.io.File
import java.text.Normalizer
import java.util.Locale

/** CLIP byte-level BPE. No query-specific labels or candidate descriptions. */
class ClipTokenizer(directory: File) {
    private val vocab = JSONObject(File(directory, "vocab.json").readText())
    private val ranks = File(directory, "merges.txt").readLines().filter { it.isNotBlank() && !it.startsWith("#") }
        .withIndex().associate { it.value to it.index }
    private val bytes = run {
        val values = ((33..126) + (161..172) + (174..255)).toMutableList()
        val chars = values.toMutableList(); var extra = 0
        for (b in 0..255) if (b !in values) { values.add(b); chars.add(256 + extra++) }
        values.indices.associate { values[it] to chars[it].toChar().toString() }
    }
    private val pattern = Regex("<\\|startoftext\\|>|<\\|endoftext\\|>|'s|'t|'re|'ve|'m|'ll|'d|[\\p{L}]+|[\\p{N}]|[^\\s\\p{L}\\p{N}]+", RegexOption.IGNORE_CASE)
    fun encode(query: String): LongArray {
        val result = mutableListOf(49406L)
        val clean = Normalizer.normalize(query.take(4000), Normalizer.Form.NFC).trim().lowercase(Locale.ROOT)
        for (match in pattern.findAll(clean)) {
            val encoded = match.value.toByteArray(Charsets.UTF_8).joinToString("") { bytes[it.toInt() and 255]!! }
            if (encoded.isEmpty()) continue
            var word = encoded.map { it.toString() }.toMutableList()
            word[word.lastIndex] += "</w>"
            while (word.size > 1) {
                val best = (0 until word.lastIndex).minByOrNull { ranks["${word[it]} ${word[it+1]}"] ?: Int.MAX_VALUE }!!
                val pair = "${word[best]} ${word[best+1]}"
                if (!ranks.containsKey(pair)) break
                val merged = mutableListOf<String>(); var i = 0
                while (i < word.size) {
                    if (i < word.lastIndex && "${word[i]} ${word[i+1]}" == pair) { merged.add(word[i]+word[i+1]); i += 2 }
                    else merged.add(word[i++])
                }
                word = merged
            }
            for (piece in word) { result.add(vocab.getInt(piece).toLong()); if (result.size == 76) break }
            if (result.size == 76) break
        }
        result.add(49407L)
        return LongArray(77) { if (it < result.size) result[it] else 49407L }
    }
}
