package com.keep.local.next
import android.content.Context
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.*
object TestFolder {
    fun authorize(c:Context):android.net.Uri {
        val device=androidx.test.uiautomator.UiDevice.getInstance(InstrumentationRegistry.getInstrumentation())
        val inst=InstrumentationRegistry.getInstrumentation()
        val monitor=object:android.app.Instrumentation.ActivityMonitor(){
            override fun onStartActivity(intent:android.content.Intent):android.app.Instrumentation.ActivityResult? {
                if(intent.action==android.content.Intent.ACTION_OPEN_DOCUMENT_TREE) intent.putExtra(android.provider.DocumentsContract.EXTRA_INITIAL_URI,android.provider.DocumentsContract.buildDocumentUri("com.android.externalstorage.documents","primary:Documents/KeepLocalFixtures"))
                return null
            }
        }
        inst.addMonitor(monitor)
        try { androidx.test.core.app.ActivityScenario.launch(LibrarySettingsActivity::class.java).use {
            androidx.test.espresso.Espresso.onView(androidx.test.espresso.matcher.ViewMatchers.withText("Choose document folder")).perform(androidx.test.espresso.action.ViewActions.scrollTo(),androidx.test.espresso.action.ViewActions.click())
            val select=device.wait(androidx.test.uiautomator.Until.findObject(androidx.test.uiautomator.By.res(java.util.regex.Pattern.compile(".*:id/action_menu_select"))),3000)
                ?:device.wait(androidx.test.uiautomator.Until.findObject(androidx.test.uiautomator.By.text(java.util.regex.Pattern.compile("(?i)(use this folder|select|allow access.*)"))),5000)
            val hierarchy=java.io.ByteArrayOutputStream();if(select==null)device.dumpWindowHierarchy(hierarchy)
            assertNotNull("Folder consent action: "+hierarchy.toString("UTF-8"),select);select!!.click()
            device.wait(androidx.test.uiautomator.Until.findObject(androidx.test.uiautomator.By.text(java.util.regex.Pattern.compile("(?i)allow"))),2000)?.click()
            assertTrue(device.wait(androidx.test.uiautomator.Until.hasObject(androidx.test.uiautomator.By.pkg(c.packageName)),5000))
        }
        } finally { inst.removeMonitor(monitor) }
        val grant=c.contentResolver.persistedUriPermissions.firstOrNull{it.uri.authority=="com.android.externalstorage.documents"&&it.uri.toString().contains("KeepLocalFixtures")}
        assertNotNull("Persisted read grant",grant)
        return requireNotNull(grant).uri
    }
}
