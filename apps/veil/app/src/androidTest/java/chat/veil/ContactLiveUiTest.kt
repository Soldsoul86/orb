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

/** Explicit CI opt-in, disposable emulators, real production HTTPS and the rendered invitation QR.
 * Test-only accepted-auth callback does not exercise the OS biometric matcher.
 */
class ContactLiveUiTest {
    @get:Rule val ui=createAndroidComposeRule<MainActivity>()
    private val instrumentation get()=InstrumentationRegistry.getInstrumentation()
    private fun dir()=File(ui.activity.filesDir,"contact-live-fixture").apply{mkdirs()}
    private fun write(name:String,value:String){File(dir(),name).writeText(value)}
    private fun read(name:String)=File(dir(),name).readText()
    private fun focusedWindow():String = ParcelFileDescriptor.AutoCloseInputStream(instrumentation.uiAutomation.executeShellCommand("dumpsys window")).use { input ->
        input.readBytes().toString(Charsets.UTF_8).lineSequence().firstOrNull { it.contains("mCurrentFocus=") } ?: "No focused window"
    }
    private fun unlock() {
        try {ui.waitUntil(20000){ui.activity.window.decorView.hasWindowFocus()}}
        catch (error:Throwable) {throw AssertionError("Real app window focus required before test authentication: "+focusedWindow(),error)}
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
        require(args.getString("disposableFixture")=="true")
        val launchIntent=Intent(ui.activity.intent)
        unlock()
        try { when(stage) {
            "share" -> {
                val began=android.os.SystemClock.elapsedRealtime()
                ui.onNodeWithText("New contact").performClick();ui.onNodeWithText("Temporary").performClick()
                ui.onNodeWithText("Create QR invitation").performScrollTo().performClick();idle()
                assertEquals("invitation",ui.activity.contactPage)
                assertTrue("Creating a QR stays in the focused secure app",ui.activity.unlocked && ui.activity.window.decorView.hasWindowFocus())
                ui.onNodeWithContentDescription("Invitation QR code").performScrollTo().assertIsDisplayed()
                assertFalse("No share chooser on creation",focusedWindow().contains("ChooserActivity"))
                write("timing",(android.os.SystemClock.elapsedRealtime()-began).toString())
                val f=ui.activity.portableSnapshot!!.getJSONArray("facets").getJSONObject(0)
                val expected=f.getJSONObject("invitation").getString("link")
                val bounds=ui.onNodeWithContentDescription("Invitation QR code").fetchSemanticsNode().boundsInWindow
                var decoded=""
                ui.runOnIdle {
                    val view=ui.activity.window.decorView
                    val screen=Bitmap.createBitmap(view.width,view.height,Bitmap.Config.ARGB_8888)
                    view.draw(Canvas(screen))
                    val qr=Bitmap.createBitmap(screen,bounds.left.toInt(),bounds.top.toInt(),bounds.width.toInt(),bounds.height.toInt())
                    val bytes=java.io.ByteArrayOutputStream();qr.compress(Bitmap.CompressFormat.PNG,100,bytes)
                    decoded=PurposeQr.readPortable(java.io.ByteArrayInputStream(bytes.toByteArray()))
                    qr.recycle();screen.recycle()
                }
                assertEquals("Rendered QR encodes the real invitation",expected,decoded)
                write("link",decoded);write("facet",f.getString("id"))
                capture("invitation")
            }
            "request" -> {
                // Exercise the same exported ACTION_VIEW handler used by Android App Links.
                val link=read("link")
                ui.runOnIdle{ui.activity.startActivity(Intent(ui.activity,MainActivity::class.java).setAction(Intent.ACTION_VIEW).setData(Uri.parse(link)).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP))}
                instrumentation.waitForIdleSync();Thread.sleep(500);unlock()
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
                ui.onNodeWithText("End access?").performScrollTo().assertExists()
                assertTrue("Confirmation stays in the focused protected app",ui.activity.unlocked && ui.activity.window.decorView.hasWindowFocus())
                capture("end-confirmation")
                ui.onNodeWithText("End access").performScrollTo().performClick();idle()
                assertEquals("REVOKED",contact().getString("status"));assertFalse(contact().optBoolean("pending"));capture("ended")
                val id=read("facet");ui.runOnIdle{ui.activity.contactAction({cancelInvitation(id)})};idle()
            }
            "blocked" -> {chat();assertEquals("REVOKED",contact().getString("status"));ui.onNodeWithText("Send").assertDoesNotExist()}
            else -> error("Unknown live stage")
        }
        } catch (error: Throwable) {
            instrumentation.sendStatus(0,android.os.Bundle().apply{putString("stream", "LIVE BODY FAILURE: " + error.stackTraceToString())})
            throw error
        } finally {
            // ActivityScenario matches lifecycle callbacks against its launch intent. Production
            // correctly replaces/clears link data; restore only the harness intent after assertions.
            ui.runOnIdle{ui.activity.intent=launchIntent}
        }
        println("PASS live Android UI stage: $stage")
    }
}
