package chat.veil

import android.graphics.Bitmap
import android.graphics.Canvas
import android.view.WindowManager
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import java.io.File

/** In-process rendering of synthetic test UI; OS capture flag never disabled. */
class UxBaselineTest {
    @get:Rule val ui=createAndroidComposeRule<MainActivity>()
    private fun capture(name:String) {
        ui.waitForIdle()
        ui.runOnIdle {
            val a=ui.activity;assertTrue(a.window.attributes.flags and WindowManager.LayoutParams.FLAG_SECURE!=0)
            val view=a.window.decorView
            val bitmap=Bitmap.createBitmap(view.width,view.height,Bitmap.Config.ARGB_8888)
            view.draw(Canvas(bitmap))
            val dir=File(a.filesDir,"ux-evidence").apply{mkdirs()}
            File(dir,name+".png").outputStream().use {bitmap.compress(Bitmap.CompressFormat.PNG,100,it)};bitmap.recycle()
        }
    }
    @Test fun baselineScreens() {
        val base=InstrumentationRegistry.getArguments().getString("baseline") ?: return
        require(base=="true")
        ui.runOnIdle {MainActivity::class.java.getDeclaredMethod("authenticationAccepted").apply {isAccessible=true}.invoke(ui.activity)}
        ui.waitUntil(15000){ui.activity.purposeSnapshot!=null && !ui.activity.busy}
        capture("before-chats")
        ui.onNodeWithText("My identity").performClick()
        ui.waitUntil(15000){ui.activity.portableSnapshot!=null && !ui.activity.busy}
        capture("before-identity")
        ui.onNodeWithText("Create identity on this device").performScrollTo().performClick()
        ui.waitUntil(15000){ui.activity.portableSnapshot?.optBoolean("ready")==true && !ui.activity.busy}
        ui.onNodeWithText("Create a purpose").performScrollTo().performClick()
        capture("before-create")
        println("BASELINE: 3 taps after unlock to creation form; provider URL and advanced review still required before sharing. Share-sheet time not measured: provider unavailable in baseline.")
    }
}
