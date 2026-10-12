package com.keep.local

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import androidx.test.core.app.ActivityScenario
import androidx.test.core.app.ApplicationProvider
import androidx.test.espresso.Espresso.onView
import androidx.test.espresso.action.ViewActions.*
import androidx.test.espresso.assertion.ViewAssertions.matches
import androidx.test.espresso.matcher.ViewMatchers.*
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class CaptureFlowTest {
    private val context = ApplicationProvider.getApplicationContext<Context>()
    private val db get() = MemoryDb.get(context)

    @Test fun captureSaveReopenAndRetrieve() {
        val title = "Milestone ${System.nanoTime()}"
        val body = "Remember budget deadlines tomorrow"
        try {
            ActivityScenario.launch(MainActivity::class.java).use {
                onView(withText("+ Note")).perform(click())
                onView(withId(R.id.memory_title)).perform(replaceText(title))
                onView(withId(R.id.memory_note)).perform(replaceText(body), closeSoftKeyboard())
                onView(withText("Save")).perform(scrollTo(), click())
            }
            // New Activity instance proves the text is read back from persistent storage.
            ActivityScenario.launch(MainActivity::class.java).use {
                onView(withId(R.id.search_query)).perform(replaceText("deadl"), closeSoftKeyboard())
                val end = System.currentTimeMillis() + 5000
                var shown = false
                while (!shown && System.currentTimeMillis() < end) {
                    try {
                        onView(withSubstring(title)).check(matches(isDisplayed()))
                        shown = true
                    } catch (_: AssertionError) { Thread.sleep(100) }
                    catch (_: androidx.test.espresso.NoMatchingViewException) { Thread.sleep(100) }
                }
                assertTrue("Saved note should appear for a prefix query", shown)
                onView(withSubstring(title)).perform(click())
                onView(withId(R.id.memory_note)).check(matches(withText(body)))
            }
        } finally { db.search(title, "note").filter { it.title == title }.forEach { db.remove(it.id) } }
    }

    @Test fun androidFtsEditsDeletesAndBoundedPreviews() {
        val id = db.add("note", "Regression", "deadlines " + "x".repeat(100_000))
        try {
            assertTrue(db.search("deadl", "note").any { it.id == id })
            assertTrue(db.search("deadl", "note").first { it.id == id }.body.length <= 240)
            assertTrue(db.get(id)!!.body.length > 100_000)
            db.update(id, "Regression", "replacementword", false)
            assertFalse(db.search("deadl", "note").any { it.id == id })
            assertTrue(db.search("replace", "note").any { it.id == id })
        } finally { db.remove(id) }
        assertFalse(db.search("replace", "note").any { it.id == id })
    }

    @Test fun installedPackageHasNoNetworkOrBroadStoragePermission() {
        val permissions = context.packageManager.getPackageInfo(context.packageName,
            PackageManager.GET_PERMISSIONS).requestedPermissions.orEmpty().toSet()
        for (permission in listOf(Manifest.permission.INTERNET,
            Manifest.permission.MANAGE_EXTERNAL_STORAGE, Manifest.permission.READ_EXTERNAL_STORAGE,
            Manifest.permission.SYSTEM_ALERT_WINDOW)) assertFalse(permission, permission in permissions)
        assertNull(AppFiles.safeFile(context, "../databases/memories.db"))
    }
}
