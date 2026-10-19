package chat.veil

import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Canvas
import android.net.Uri
import android.os.ParcelFileDescriptor
import android.view.WindowManager
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import java.io.File

/** Explicit CI opt-in, disposable emulators, real production HTTPS and native Android Sharesheet.
 * Test-only accepted-auth callback does not exercise the OS biometric matcher.
 */
class ContactLiveUiTest {
    @get:Rule val ui=createAndroidComposeRule<MainActivity>()
    private val instrumentation get()=InstrumentationRegistry.getInstrumentation()
    private fun dir()=File(ui.activity.filesDir,"contact-live-fixture").apply{mkdirs()}
    private fun write(name:String,value:String){File(dir(),name).writeText(value)}
    private fun read(name:String)=File(dir(),name).readText()
    private fun unlock() {
        ui.runOnIdle {MainActivity::class.java.getDeclaredMethod("authenticationAccepted").apply{isAccessible=true}.invoke(ui.activity)}
        ui.waitUntil(120000){ui.activity.portableSnapshot!=null && !ui.activity.busy}
    }
    private fun idle()=ui.waitUntil(120000){!ui.activity.busy}
    private fun contact()=ui.activity.portableSnapshot!!.getJSONArray("contacts").getJSONObject(0)
    private fun chat(){ui.onNodeWithText("Temporary contact").performScrollTo().performClick();ui.onNodeWithText("Refresh / retry").performScrollTo().performClick();idle()}
    private fun capture(name:String) {
        ui.waitForIdle();ui.runOnIdle {
            val a=ui.activity;assertTrue(a.window.attributes.flags and WindowManager.LayoutParams.FLAG_SECURE!=0)
            val v=a.window.decorView;val b=Bitmap.createBitmap(v.width,v.height,Bitmap.Config.ARGB_8888);v.draw(Canvas(b))
            val d=File(a.filesDir,"ux-evidence").apply{mkdirs()};File(d,"live-$name.png").outputStream().use{b.compress(Bitmap.CompressFormat.PNG,100,it)};b.recycle()
        }
    }
    @Test fun stage() {
        val args=InstrumentationRegistry.getArguments();val stage=args.getString("liveStage") ?: return
        require(args.getString("disposableFixture")=="true");unlock()
        try { when(stage) {
            "share" -> {
                val began=android.os.SystemClock.elapsedRealtime()
                ui.onNodeWithText("New contact").performClick();ui.onNodeWithText("Temporary").performClick()
                ui.onNodeWithText("Share invitation").performScrollTo().performClick()
                // Native chooser takes focus and locks the app; do not synthesize a successful share.
                val deadline=android.os.SystemClock.elapsedRealtime()+120000
                var chooser=false
                while(!chooser && android.os.SystemClock.elapsedRealtime()<deadline) {
                    val root=instrumentation.uiAutomation.rootInActiveWindow
                    chooser=root?.packageName?.toString() in setOf("android","com.android.intentresolver")
                    if(!chooser)Thread.sleep(100)
                }
                assertTrue("Real Android Sharesheet opened",chooser)
                write("timing",(android.os.SystemClock.elapsedRealtime()-began).toString())
                ParcelFileDescriptor.AutoCloseInputStream(instrumentation.uiAutomation.executeShellCommand("input keyevent BACK")).use{it.readBytes()}
                Thread.sleep(500);unlock()
                val f=ui.activity.portableSnapshot!!.getJSONArray("facets").getJSONObject(0)
                write("link",f.getJSONObject("invitation").getString("link"));write("facet",f.getString("id"))
                capture("invitation")
            }
            "request" -> {
                // Exercise the same exported ACTION_VIEW handler used by Android App Links.
                val link=read("link")
                ui.runOnIdle{ui.activity.startActivity(Intent(ui.activity,MainActivity::class.java).setAction(Intent.ACTION_VIEW).setData(Uri.parse(link)).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP))}
                try {ui.waitUntil(120000){ui.activity.contactPreview!=null && !ui.activity.busy}}
                catch(e:Throwable){throw AssertionError("Preview did not appear: unlocked=${ui.activity.unlocked}, busy=${ui.activity.busy}, page=${ui.activity.contactPage}, notice=${ui.activity.portableNotice}",e)}
                capture("preview")
                ui.onNodeWithText("Introduce yourself").performScrollTo().performTextInput("Hello from the live contact test")
                ui.onNodeWithText("Request contact").performScrollTo().performClick();idle()
                assertEquals("PENDING",contact().getString("status"));capture("waiting")
            }
            "accept" -> {
                val id=read("facet");ui.runOnIdle{ui.activity.contactAction({sync(id)})};idle();chat()
                ui.onNodeWithText("Accept").performScrollTo().performClick();idle()
                assertEquals("APPROVED",contact().getString("status"));capture("accepted")
            }
            "send","reply" -> {
                chat();assertEquals("APPROVED",contact().getString("status"))
                if(stage=="reply")ui.onNodeWithText("Live encrypted hello").assertExists()
                ui.onNodeWithText("Message").performScrollTo().performTextInput(if(stage=="send")"Live encrypted hello" else "Live encrypted reply")
                ui.onNodeWithText("Send",useUnmergedTree=false).performScrollTo().performClick();idle()
                assertFalse(contact().optBoolean("pending"));capture(stage)
            }
            "receive" -> {chat();ui.onNodeWithText("Live encrypted reply").assertExists();capture("received")}
            "end" -> {
                chat();ui.onNodeWithText("End access").performScrollTo().performClick()
                ui.onAllNodesWithText("End access").onLast().performClick();idle()
                assertEquals("REVOKED",contact().getString("status"));assertFalse(contact().optBoolean("pending"));capture("ended")
                val id=read("facet");ui.runOnIdle{ui.activity.contactAction({cancelInvitation(id)})};idle()
            }
            "blocked" -> {chat();assertEquals("REVOKED",contact().getString("status"));ui.onNodeWithText("Send").assertDoesNotExist()}
            else -> error("Unknown live stage")
        }
        } catch (error: Throwable) {
            instrumentation.sendStatus(0,android.os.Bundle().apply{putString("stream", "LIVE BODY FAILURE: " + error.stackTraceToString())})
            throw error
        }
        println("PASS live Android UI stage: $stage")
    }
}
