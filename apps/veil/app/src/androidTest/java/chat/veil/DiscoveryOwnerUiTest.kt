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

/** TEST-only local owner disclosure, without contacting a provider or publishing. */
class DiscoveryOwnerUiTest {
    @get:Rule val ui=createAndroidComposeRule<MainActivity>()
    @Test fun draftRequiresPurposeReviewAndExplicitConsent() {
        ui.runOnIdle {MainActivity::class.java.getDeclaredMethod("authenticationAccepted").apply{isAccessible=true}.invoke(ui.activity)}
        ui.waitUntil(20000){ui.activity.portableSnapshot!=null&&!ui.activity.busy}
        ui.runOnIdle {ui.activity.contactAction({
            if(!ready())createIdentity()
            createFacet(PurposePolicy("TEST discovery UI",timezone="UTC"),"https://test-provider.example",false)
        }){ui.activity.contactPage="home"}}
        ui.waitUntil(20000){!ui.activity.busy}
        ui.onNodeWithText("Reach me").performClick()
        ui.onNodeWithText("Be found · discovery preview").performScrollTo().performClick()
        ui.waitUntil(20000){ui.activity.contactPage=="discovery"}
        ui.onNodeWithText("TEST discovery UI").performScrollTo().performClick()
        ui.onNodeWithTag("discovery-public").assertIsOff()
        ui.onNodeWithText("Public name").performScrollTo().performTextInput("TEST designer")
        ui.onNodeWithText("How can you help?").performScrollTo().performTextInput("Android interface redesign")
        ui.onNodeWithText("Design & create").performScrollTo().performClick()
        ui.onNodeWithText("ui").performScrollTo().performClick()
        ui.onNodeWithTag("discovery-public").performScrollTo().performClick()
        ui.onNodeWithText("Preview directory HTTPS address").performScrollTo().performTextInput("https://test-directory.example")
        ui.onNodeWithText("Review profile").performScrollTo().performClick()
        ui.onNodeWithText("Publish").performScrollTo().assertIsNotEnabled()
        ui.onNodeWithTag("discovery-consent").performScrollTo().performClick()
        ui.onNodeWithText("Publish").assertIsEnabled()
        // Changing disclosure invalidates consent and requires a fresh review.
        ui.onNodeWithText("How can you help?").performScrollTo().performTextInput(" for remote projects")
        ui.onNodeWithText("Publish").assertDoesNotExist()
        ui.onNodeWithText("Review profile").performScrollTo().performClick()
        ui.onNodeWithText("Publish").performScrollTo().assertIsNotEnabled()
        // Deliberately do not authorize: TEST provider is not a working remote service.
        ui.runOnIdle {
            val a=ui.activity;assertTrue(a.window.attributes.flags and WindowManager.LayoutParams.FLAG_SECURE!=0)
            val f=contactEntries(a.portableSnapshot!!.getJSONArray("facets")).first{it.getJSONObject("policy").getString("display_name")=="TEST discovery UI"}
            assertEquals("UNLISTED",f.getJSONObject("policy").getString("discovery_mode"))
            val v=a.window.decorView;val bitmap=Bitmap.createBitmap(v.width,v.height,Bitmap.Config.ARGB_8888);v.draw(Canvas(bitmap))
            val dir=File(a.filesDir,"discovery-evidence").apply{mkdirs()};File(dir,"android-test-owner-review.png").outputStream().use{bitmap.compress(Bitmap.CompressFormat.PNG,100,it)};bitmap.recycle()
        }
    }
}
