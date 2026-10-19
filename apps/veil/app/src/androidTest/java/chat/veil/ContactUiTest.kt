package chat.veil

import android.graphics.Bitmap
import android.graphics.Canvas
import android.view.WindowManager
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import java.io.File

/** Actual screen rendering under FLAG_SECURE. No private user data, no capture bypass in app. */
class ContactUiTest {
    @get:Rule val ui=createAndroidComposeRule<MainActivity>()
    private fun open() {
        ui.runOnIdle {MainActivity::class.java.getDeclaredMethod("authenticationAccepted").apply{isAccessible=true}.invoke(ui.activity)}
        ui.waitUntil(20000){ui.activity.portableSnapshot!=null && !ui.activity.busy}
    }
    private fun capture(name:String) {
        ui.waitForIdle();ui.runOnIdle {
            val a=ui.activity;assertTrue(a.window.attributes.flags and WindowManager.LayoutParams.FLAG_SECURE!=0)
            val v=a.window.decorView;val bitmap=Bitmap.createBitmap(v.width,v.height,Bitmap.Config.ARGB_8888)
            v.draw(Canvas(bitmap));val dir=File(a.filesDir,"ux-evidence").apply{mkdirs()}
            File(dir,"${androidx.test.platform.app.InstrumentationRegistry.getArguments().getString("theme") ?: "default"}-$name.png").outputStream().use{bitmap.compress(Bitmap.CompressFormat.PNG,100,it)};bitmap.recycle()
        }
    }
    @Test fun temporaryNeedsNoIdentityOrProviderForm() {
        open();capture("after-chats")
        ui.onNodeWithText("New contact").performClick();capture("after-new-contact")
        ui.onNodeWithText("Temporary").performClick();capture("after-temporary")
        ui.onNodeWithText("Share invitation").performScrollTo().assertIsEnabled()
        ui.onNodeWithText("Invitation expires 7 days after creation.").assertExists()
        ui.onNodeWithText("After you accept a request, access lasts 7 days.").assertExists()
        ui.onNodeWithText("Provider HTTPS origin").assertDoesNotExist()
        println("UX TAP MAP: Chats -> New contact (1) -> Temporary (2) -> Share invitation CTA (3). Network/share completion measured separately.")
    }
    @Test fun workAndSettingsHavePlainLabels() {
        open();ui.onNodeWithText("New contact").performClick();ui.onNodeWithText("Work").performClick();capture("after-work")
        ui.onNodeWithText("Change rules").performScrollTo().performClick()
        ui.onNodeWithText("Timezone, for example Asia/Kolkata").assertExists()
        ui.onNodeWithText("Cancel changes").performScrollTo().performClick()
        ui.onNodeWithText("Settings").performClick();capture("after-settings")
        ui.onNodeWithText("Back up my identity").assertIsDisplayed();ui.onNodeWithText("Move my identity").assertExists()
        ui.onNodeWithText("Discover").assertDoesNotExist()
    }
    @Test fun invalidLinkDoesNotCreateRequestOrIdentity() {
        open();val before=ui.activity.portableSnapshot!!.optBoolean("ready");val count=ui.activity.portableSnapshot!!.optJSONArray("contacts")?.length() ?: 0
        ui.onNodeWithText("Open an invitation").performScrollTo().performClick()
        ui.onNodeWithText("Paste invitation link").performTextInput("https://example.org/i#bad")
        ui.onNodeWithText("Preview invitation").performClick()
        ui.onNodeWithText("This invitation is incomplete. Ask your contact to share it again.").assertExists()
        assertEquals(before,ui.activity.portableSnapshot!!.optBoolean("ready"));assertEquals(count,ui.activity.portableSnapshot!!.optJSONArray("contacts")?.length() ?: 0)
    }
}
