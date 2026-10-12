package com.keep.local

import android.app.Activity
import android.content.Intent
import android.media.MediaMetadataRetriever
import android.net.Uri
import android.os.Bundle
import android.provider.OpenableColumns
import android.widget.TextView

/** Separate test APK/UID, deliberately absent from the product APK. */
class ShareReceiverActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val result = try {
            val uri = requireNotNull(intent.getParcelableExtra<Uri>(Intent.EXTRA_STREAM))
            check(uri.scheme == "content")
            val title = contentResolver.query(uri, null, null, null, null)!!.use {
                check(it.moveToFirst())
                it.getString(it.getColumnIndexOrThrow(OpenableColumns.DISPLAY_NAME))
            }
            val descriptor = contentResolver.openFileDescriptor(uri, "r")!!
            descriptor.use { check(it.statSize > 0) }
            MediaMetadataRetriever().use { retriever ->
                retriever.setDataSource(this, uri)
                check(retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)!!.toLong() > 0)
                val frame = retriever.getFrameAtTime(0)
                check(frame != null)
                frame.recycle()
            }
            "Received playable video: $title"
        } catch (e: Exception) { "Receive failed: ${e.javaClass.simpleName}" }
        setContentView(TextView(this).apply { text = result; textSize = 20f })
    }
}
