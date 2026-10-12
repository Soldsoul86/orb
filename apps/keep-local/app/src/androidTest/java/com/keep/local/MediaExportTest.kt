package com.keep.local

import android.content.Context
import android.content.Intent
import android.media.MediaMetadataRetriever
import android.net.Uri
import android.os.CancellationSignal
import android.os.OperationCanceledException
import android.provider.MediaStore
import android.provider.OpenableColumns
import androidx.test.core.app.ActivityScenario
import androidx.test.core.app.ApplicationProvider
import androidx.test.espresso.Espresso.onView
import androidx.test.espresso.action.ViewActions.*
import androidx.test.espresso.matcher.ViewMatchers.*
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.uiautomator.By
import androidx.test.uiautomator.UiDevice
import androidx.test.uiautomator.Until
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File
import java.io.FileNotFoundException
import java.io.RandomAccessFile
import java.security.MessageDigest

@RunWith(AndroidJUnit4::class)
class MediaExportTest {
    private val context = ApplicationProvider.getApplicationContext<Context>()
    private val db get() = MemoryDb.get(context)
    private val device = UiDevice.getInstance(InstrumentationRegistry.getInstrumentation())
    private fun cad() = requireNotNull(db.get(987654L)) { "CI must seed an existing CAD Test video before upgrade" }
    private fun hash(file: File): String {
        val digest = MessageDigest.getInstance("SHA-256")
        file.inputStream().use { input ->
            val buffer = ByteArray(65536)
            while (true) { val n = input.read(buffer); if (n < 0) break; digest.update(buffer, 0, n) }
        }
        return digest.digest().joinToString("") { "%02x".format(it) }
    }
    private fun playable(uri: Uri) {
        MediaMetadataRetriever().use {
            it.setDataSource(context, uri)
            assertTrue(it.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)!!.toLong() > 0)
            val frame = it.getFrameAtTime(0)
            assertNotNull(frame); frame?.recycle()
        }
    }
    private fun rows() = context.contentResolver.query(MediaStore.Video.Media.EXTERNAL_CONTENT_URI,
        arrayOf(MediaStore.MediaColumns._ID), "${MediaStore.MediaColumns.RELATIVE_PATH}=? AND ${MediaStore.MediaColumns.IS_PENDING}=0",
        arrayOf("Movies/Keep Local/"), null)!!.use { it.count }

    @Test fun existingCadPlaysSharesToSeparateUidAndSurvivesReopen() {
        val item = cad()
        val file = MediaExport.source(context, item)
        val before = hash(file)
        playable(AppFiles.itemUri(item.id))
        ActivityScenario.launch<EditorActivity>(Intent(context, EditorActivity::class.java).putExtra("id", item.id)).use {
            onView(withId(R.id.media_play)).perform(scrollTo(), click())
            assertTrue(device.wait(Until.hasObject(By.clazz("android.widget.VideoView")), 5000))
            device.pressBack()
            onView(withId(R.id.media_share)).perform(scrollTo(), click())
            // Native resolver is actually displayed; select a real separate-UID receiver.
            var target = device.wait(Until.findObject(By.textContains("Keep Local Test Receiver")), 5000)
            if (target == null) {
                device.swipe(device.displayWidth / 2, device.displayHeight * 3 / 4,
                    device.displayWidth / 2, device.displayHeight / 4, 20)
                target = device.wait(Until.findObject(By.textContains("Keep Local Test Receiver")), 5000)
            }
            assertNotNull("Sharesheet must list compatible receiver", target)
            target!!.click()
            val received = device.wait(Until.hasObject(By.text("Received playable video: CAD Test.mp4")), 10000)
            if (!received) {
                val hierarchy = java.io.ByteArrayOutputStream()
                device.dumpWindowHierarchy(hierarchy)
                println(hierarchy.toString("UTF-8"))
            }
            assertTrue("Receiver must read and decode the granted MP4", received)
            device.pressBack()
        }
        assertEquals(before, hash(file))
        ActivityScenario.launch<EditorActivity>(Intent(context, EditorActivity::class.java).putExtra("id", item.id)).use {
            assertEquals(item, db.get(item.id))
            playable(AppFiles.itemUri(item.id))
        }
    }

    @Test fun galleryButtonPublishesPlayableCopyAndDuplicateDoesNotOverwrite() {
        val item = cad()
        val before = hash(MediaExport.source(context, item))
        val existing = rows()
        ActivityScenario.launch<EditorActivity>(Intent(context, EditorActivity::class.java).putExtra("id", item.id)).use {
            onView(withId(R.id.media_gallery)).perform(scrollTo(), click())
            val deadline = System.currentTimeMillis() + 15000
            while (rows() == existing && System.currentTimeMillis() < deadline) Thread.sleep(100)
            assertEquals(existing + 1, rows())
        }
        val duplicate = MediaExport.saveToGallery(context, item, CancellationSignal())
        try {
            assertEquals(existing + 2, rows())
            context.contentResolver.query(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, null,
                "${MediaStore.MediaColumns.RELATIVE_PATH}=?", arrayOf("Movies/Keep Local/"), null)!!.use { cursor ->
                val names = mutableSetOf<String>()
                while (cursor.moveToNext()) {
                    assertEquals(0, cursor.getInt(cursor.getColumnIndexOrThrow(MediaStore.MediaColumns.IS_PENDING)))
                    val name = cursor.getString(cursor.getColumnIndexOrThrow(MediaStore.MediaColumns.DISPLAY_NAME))
                    assertTrue(name.startsWith("CAD Test")); assertTrue(name.endsWith(".mp4"))
                    names.add(name)
                    val uri = android.content.ContentUris.withAppendedId(MediaStore.Video.Media.EXTERNAL_CONTENT_URI,
                        cursor.getLong(cursor.getColumnIndexOrThrow(MediaStore.MediaColumns._ID)))
                    playable(uri)
                    val copy = File(context.cacheDir, "verify-copy.mp4")
                    try {
                        context.contentResolver.openInputStream(uri)!!.use { input -> copy.outputStream().use { out -> input.copyTo(out, 65536) } }
                        assertEquals(before, hash(copy))
                    } finally { copy.delete() }
                }
                assertTrue(names.size >= 2)
            }
            assertEquals(before, hash(MediaExport.source(context, item)))
            assertEquals(item, db.get(item.id))
        } finally { context.contentResolver.delete(duplicate, null, null) }
    }

    @Test fun cancelledPickerAndMissingFilesDoNotTouchOriginal() {
        val item = cad()
        val before = hash(MediaExport.source(context, item))
        ActivityScenario.launch<EditorActivity>(Intent(context, EditorActivity::class.java).putExtra("id", item.id)).use {
            onView(withId(R.id.media_files)).perform(scrollTo(), click())
            assertTrue(device.wait(Until.hasObject(By.pkg("com.google.android.documentsui")), 5000) ||
                device.wait(Until.hasObject(By.pkg("com.android.documentsui")), 5000))
            device.pressBack()
        }
        val count = rows()
        assertThrows(OperationCanceledException::class.java) {
            MediaExport.saveToGallery(context, item, CancellationSignal().apply { cancel() })
        }
        assertEquals(count, rows())
        assertThrows(FileNotFoundException::class.java) {
            MediaExport.sendIntent(context, item.copy(path = "media/not-found.mp4"))
        }
        assertNull(AppFiles.safeFile(context, "media/../../databases/memories.db"))
        assertEquals(before, hash(MediaExport.source(context, item)))
    }

    @Test fun providerCannotBeReadByAnotherAppWithoutExplicitGrant() {
        val original = cad()
        val id = db.add("video", "Private grant check", path = original.path, mime = original.mime, bytes = original.bytes)
        try {
            context.startActivity(Intent(Intent.ACTION_SEND).apply {
                component = android.content.ComponentName("com.keep.local.test", "com.keep.local.ShareReceiverActivity")
                putExtra(Intent.EXTRA_STREAM, AppFiles.itemUri(id))
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            })
            assertTrue(device.wait(Until.hasObject(By.text("Receive failed: SecurityException")), 5000))
            device.pressBack()
        } finally { db.remove(id) }
    }

    @Test fun saveToFilesCreatesPlayableVideoInDownloads() {
        val item = cad()
        val title = "Keep Local SAF ${System.nanoTime()}"
        val id = db.add("video", title, path = item.path, mime = item.mime, bytes = item.bytes)
        val exported = "/sdcard/Download/$title.mp4"
        try {
            ActivityScenario.launch<EditorActivity>(Intent(context, EditorActivity::class.java).putExtra("id", id)).use {
                onView(withId(R.id.media_files)).perform(scrollTo(), click())
                val roots = device.wait(Until.findObject(By.desc("Show roots")), 5000)
                if (roots != null) {
                    roots.click()
                    val downloads = device.wait(Until.findObject(By.text("Downloads")), 5000)
                    assertNotNull("Local Downloads destination", downloads)
                    downloads!!.click()
                }
                val save = device.wait(Until.findObject(By.res("com.google.android.documentsui", "action_menu_save")), 3000)
                    ?: device.wait(Until.findObject(By.res("com.android.documentsui", "action_menu_save")), 3000)
                    ?: device.wait(Until.findObject(By.text("SAVE")), 3000)
                assertNotNull("Create document confirmation", save)
                save!!.click()
                val expected = hash(MediaExport.source(context, item))
                val deadline = System.currentTimeMillis() + 15000
                var matched = false
                while (!matched && System.currentTimeMillis() < deadline) {
                    matched = device.executeShellCommand("sha256sum '$exported'").startsWith(expected)
                    if (!matched) Thread.sleep(100)
                }
                assertTrue("SAF export in Downloads equals original MP4", matched)
                playable(AppFiles.itemUri(item.id))
            }
        } finally {
            db.remove(id)
            device.executeShellCommand("rm -f '$exported'")
        }
    }

    @Test fun largeFileIsStreamedAndOtherMediaHaveCorrectNamesAndMime() {
        val file = File(AppFiles.mediaDir(context), "large-export-test.bin")
        val destination = File(context.cacheDir, "large-copy.bin")
        try {
            val size = 256L * 1024 * 1024
            RandomAccessFile(file, "rw").use { it.setLength(size) }
            file.inputStream().use { input -> destination.outputStream().use { output ->
                assertEquals(size, ExportNames.copy(input, output, size) {})
            } }
            assertEquals(hash(file), hash(destination))
        } finally { file.delete(); destination.delete() }
        for ((path, mime) in listOf("media/voice.m4a" to "audio/mp4", "media/photo.jpg" to "image/jpeg", "media/manual.pdf" to "application/pdf")) {
            val item = cad().copy(path = path, kind = if (mime.startsWith("audio")) "audio" else "file", mime = mime)
            assertEquals(mime, MediaExport.mime(item))
            assertEquals("CAD Test.${path.substringAfterLast('.')}", MediaExport.filename(item))
        }
        context.contentResolver.query(AppFiles.itemUri(cad().id), null, null, null, null)!!.use {
            assertTrue(it.moveToFirst())
            assertEquals("CAD Test.mp4", it.getString(it.getColumnIndexOrThrow(OpenableColumns.DISPLAY_NAME)))
        }
        assertThrows(FileNotFoundException::class.java) {
            context.contentResolver.openFileDescriptor(AppFiles.itemUri(cad().id), "w")
        }
    }
}
