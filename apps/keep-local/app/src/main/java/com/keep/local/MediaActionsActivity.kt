package com.keep.local.next

import android.app.Activity
import android.app.AlertDialog
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.os.CancellationSignal
import android.os.Handler
import android.os.Looper
import android.os.OperationCanceledException
import android.widget.Button
import android.widget.LinearLayout
import android.widget.Toast
import java.io.FileNotFoundException
import java.util.concurrent.Executors

/** Shared actions for details and playback, with rotation-safe background copying. */
abstract class MediaActionsActivity : Activity() {
    private var pendingItemId = -1L
    private var exportTask: ExportTask? = null
    private var progress: AlertDialog? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        pendingItemId = savedInstanceState?.getLong("export_item", -1) ?: -1
        exportTask = lastNonConfigurationInstance as? ExportTask
    }

    protected fun addMediaActions(root: LinearLayout, item: MemoryItem, play: (() -> Unit)? = null) {
        fun action(label: String, idValue: Int, block: () -> Unit) {
            root.addView(Button(this).apply {
                text = label
                id = idValue
                isAllCaps = false
                setOnClickListener { block() }
            })
        }
        if (play != null) action("Play", R.id.media_play, play)
        action("Share", R.id.media_share) {
            try {
                val fresh = MemoryDb.get(this).get(item.id) ?: throw FileNotFoundException()
                startActivity(Intent.createChooser(MediaExport.sendIntent(this, fresh), "Share ${fresh.title}"))
            } catch (_: FileNotFoundException) { message("The original file is missing or empty.") }
            catch (_: Exception) { message("Couldn't open sharing. Try Save to Files.") }
        }
        if (MediaExport.isGalleryItem(item)) action("Save to Gallery", R.id.media_gallery) {
            startExport(item.id, null)
        }
        action("Save to Files", R.id.media_files) {
            if (exportTask != null || pendingItemId > 0) {
                message("Finish or cancel the current export first.")
            } else try {
                val fresh = MemoryDb.get(this).get(item.id) ?: throw FileNotFoundException()
                MediaSource.check(this, fresh)
                pendingItemId = item.id
                startActivityForResult(MediaExport.destinationIntent(fresh), CREATE_DOCUMENT)
            } catch (_: Exception) {
                pendingItemId = -1
                message("Cannot open the file picker or original file.")
            }
        }
    }

    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode != CREATE_DOCUMENT) return
        val id = pendingItemId
        pendingItemId = -1
        val uri = data?.data
        if (resultCode != RESULT_OK || uri == null) { message("Export cancelled. Original kept."); return }
        if (id > 0) startExport(id, uri)
    }

    private fun startExport(id: Long, destination: Uri?) {
        if (exportTask != null) { message("An export is already running."); return }
        val task = ExportTask(applicationContext, id, destination)
        exportTask = task
        bindTask()
        task.start()
    }

    private fun bindTask() {
        val task = exportTask ?: return
        if (task.result == null && progress == null) {
            progress = AlertDialog.Builder(this).setTitle("Saving a copy…")
                .setMessage("Your original stays in Keep Local.")
                .setNegativeButton("Cancel") { _, _ -> task.cancel.cancel() }
                .setCancelable(false).show()
        }
        task.listener = { result ->
            progress?.dismiss(); progress = null
            exportTask = null
            task.listener = null
            message(result)
        }
        task.result?.let { task.listener?.invoke(it) }
    }

    override fun onResume() { super.onResume(); bindTask() }
    override fun onPause() {
        exportTask?.listener = null
        progress?.dismiss(); progress = null
        super.onPause()
    }
    override fun onSaveInstanceState(outState: Bundle) {
        outState.putLong("export_item", pendingItemId)
        super.onSaveInstanceState(outState)
    }
    override fun onRetainNonConfigurationInstance(): Any? = exportTask
    override fun onDestroy() {
        exportTask?.listener = null
        if (!isChangingConfigurations) exportTask?.cancel?.cancel()
        progress?.dismiss(); progress = null
        super.onDestroy()
    }

    private fun message(value: String) = Toast.makeText(this, value, Toast.LENGTH_LONG).show()

    private class ExportTask(private val context: android.content.Context, private val id: Long, private val destination: Uri?) {
        val cancel = CancellationSignal()
        var result: String? = null // main thread only
        var listener: ((String) -> Unit)? = null // detached while activity is not resumed
        fun start() {
            executor.execute {
                val status = try {
                    val item = MemoryDb.get(context).get(id) ?: throw FileNotFoundException()
                    if (destination == null) {
                        MediaExport.saveToGallery(context, item, cancel)
                        val folder = if (MediaExport.mime(item).startsWith("video/")) "Movies" else "Pictures"
                        "Saved to $folder/Keep Local. Original kept."
                    } else {
                        MediaExport.saveToDocument(context, item, destination, cancel)
                        "Saved to your selected folder. Original kept."
                    }
                } catch (_: OperationCanceledException) { "Export cancelled. Original kept." }
                catch (_: FileNotFoundException) { "Original or destination unavailable. Original kept." }
                catch (_: Exception) { "Couldn't export. Check free storage or try Save to Files. Original kept." }
                Handler(Looper.getMainLooper()).post {
                    result = status
                    listener?.invoke(status)
                }
            }
        }
    }

    companion object {
        private const val CREATE_DOCUMENT = 4701
        private val executor = Executors.newSingleThreadExecutor()
    }
}
