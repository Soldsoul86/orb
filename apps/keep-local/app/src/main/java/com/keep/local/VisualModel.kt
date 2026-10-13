package com.keep.local.next

import ai.onnxruntime.*
import android.content.Context
import android.graphics.Bitmap
import java.io.Closeable
import java.io.File
import java.nio.FloatBuffer
import java.nio.LongBuffer
import kotlin.math.sqrt

interface VisualEncoder : Closeable {
    val modelId: String
    fun image(bitmap: Bitmap): FloatArray
    fun text(query: String): FloatArray
}

class ClipEncoder(context: Context, threads: Int = Runtime.getRuntime().availableProcessors().coerceIn(1, 8)) : VisualEncoder {
    override val modelId = ModelPack.ID
    private val directory = ModelPack.directory(context)
    private val env = OrtEnvironment.getEnvironment()
    private val options = OrtSession.SessionOptions().apply { setIntraOpNumThreads(threads); setInterOpNumThreads(1) }
    private var vision: OrtSession? = null
    private var language: OrtSession? = null
    private var tokenizer: ClipTokenizer? = null
    override fun image(bitmap: Bitmap): FloatArray {
        val session = vision ?: env.createSession(File(directory, "vision.onnx").absolutePath, options).also { vision = it }
        val side = minOf(bitmap.width, bitmap.height)
        val crop = Bitmap.createBitmap(bitmap, (bitmap.width-side)/2, (bitmap.height-side)/2, side, side)
        val small = Bitmap.createScaledBitmap(crop, 224, 224, true)
        try {
            val pixels = IntArray(224*224); small.getPixels(pixels, 0, 224, 0, 0, 224, 224)
            val values = FloatArray(pixels.size*3)
            val mean = floatArrayOf(.48145466f,.4578275f,.40821073f)
            val std = floatArrayOf(.26862954f,.26130258f,.27577711f)
            for (c in 0..2) for (i in pixels.indices) values[c*pixels.size+i] = (((pixels[i] shr (16-8*c)) and 255)/255f-mean[c])/std[c]
            OnnxTensor.createTensor(env, FloatBuffer.wrap(values), longArrayOf(1,3,224,224)).use { tensor ->
                session.run(mapOf("pixel_values" to tensor), setOf("image_embeds")).use { return normalized((it[0].value as Array<*>)[0] as FloatArray) }
            }
        } finally { if (small !== bitmap && small !== crop) small.recycle(); if (crop !== bitmap) crop.recycle() }
    }
    override fun text(query: String): FloatArray {
        val session = language ?: env.createSession(File(directory, "text.onnx").absolutePath, options).also { language = it }
        val ids = (tokenizer ?: ClipTokenizer(directory).also { tokenizer=it }).encode(query)
        val inputs = mutableMapOf<String, OnnxTensor>()
        try {
            for (name in session.inputNames) {
                val data = if (name == "input_ids") ids else if (name == "attention_mask") LongArray(77) { i -> if (i <= ids.indexOf(49407L)) 1 else 0 } else error("Unsupported text input: $name")
                inputs[name] = OnnxTensor.createTensor(env, LongBuffer.wrap(data), longArrayOf(1,77))
            }
            session.run(inputs, setOf("text_embeds")).use { return normalized((it[0].value as Array<*>)[0] as FloatArray) }
        } finally { inputs.values.forEach { it.close() } }
    }
    override fun close() { vision?.close(); language?.close(); options.close() }
    companion object {
        fun normalized(v: FloatArray): FloatArray {
            require(v.size == 512 && v.all { it.isFinite() }) { "Invalid embedding" }
            val norm = sqrt(v.sumOf { (it*it).toDouble() }).toFloat(); require(norm > 0)
            return FloatArray(v.size) { v[it]/norm }
        }
        fun cosine(a: FloatArray, b: FloatArray): Float = a.indices.sumOf { (a[it]*b[it]).toDouble() }.toFloat()
    }
}
