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
        ui.onNodeWithText("Profile draft from discovery").performScrollTo().performTextInput("""{"v":1,"visibility":"PUBLIC","profile":{"alias":"TEST designer","purpose":"Android interface redesign","category":"DESIGN & CREATE","tags":["ui"]}}""")
        ui.onNodeWithText("Review exact disclosure").performScrollTo().performClick()
        ui.onNodeWithText("Advanced identity details").assertExists()
        ui.onNodeWithText("Authorize signed export").performScrollTo().assertIsNotEnabled()
        ui.onAllNodes(isToggleable()).onLast().performScrollTo().performClick()
        ui.onNodeWithText("Authorize signed export").assertIsEnabled()
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
