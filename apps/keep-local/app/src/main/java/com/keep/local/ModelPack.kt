package com.keep.local.next

import android.content.Context
import android.net.Uri
import android.os.CancellationSignal
import org.json.JSONObject
import java.io.File
import java.security.MessageDigest
import java.util.zip.ZipInputStream

/** Explicit local-file install, pinned by the build's model manifest. No network permission. */
object ModelPack {
    const val ID = "clip-vit-b32-int8-v1"
    private val names = setOf("vision.onnx", "text.onnx", "vocab.json", "merges.txt")
    fun directory(c: Context) = File(c.filesDir, "models/$ID")
    fun ready(c: Context) = File(directory(c), "installed").isFile && names.all { File(directory(c),it).isFile }
    fun manifest(c: Context) = JSONObject(c.assets.open("visual-model.json").bufferedReader().use { it.readText() })
    fun size(c: Context): Long = manifest(c).getJSONObject("files").let { files -> names.sumOf { files.getJSONObject(it).getLong("bytes") } }
    @Synchronized fun install(c: Context, uri: Uri, cancel: CancellationSignal) {
        check(!ready(c)) { "Visual model already installed. Remove it before replacing it." }
        val spec = manifest(c).getJSONObject("files")
        check(c.filesDir.usableSpace > size(c) + 64L*1024*1024) { "Not enough free space for the model" }
        val stage = File(c.filesDir, "models/installing").also { it.deleteRecursively(); it.mkdirs() }
        try {
            val seen = mutableSetOf<String>()
            ZipInputStream(c.contentResolver.openInputStream(uri) ?: error("Cannot open model pack")).use { zip ->
                while (true) {
                    cancel.throwIfCanceled()
                    val entry = zip.nextEntry ?: break
                    require(entry.name in names && seen.add(entry.name) && !entry.isDirectory) { "Unexpected or duplicate model file" }
                    val metadata = spec.getJSONObject(entry.name)
                    val digest = MessageDigest.getInstance("SHA-256"); var written = 0L
                    File(stage,entry.name).outputStream().use { out ->
                        val buf = ByteArray(65536)
                        while (true) { cancel.throwIfCanceled(); val n=zip.read(buf); if(n<0) break
                            written+=n; require(written<=metadata.getLong("bytes")) { "Model exceeds expected size" }
                            digest.update(buf,0,n); out.write(buf,0,n)
                        }
                    }
                    require(written == metadata.getLong("bytes") && digest.digest().joinToString("") { "%02x".format(it) } == metadata.getString("sha256")) { "Model checksum mismatch" }
                }
            }
            require(seen == names) { "Incomplete model pack" }
            File(stage,"installed").writeText(ID)
            directory(c).deleteRecursively()
            check(stage.renameTo(directory(c))) { "Cannot finalize model installation" }
        } finally { stage.deleteRecursively() }
    }
}
