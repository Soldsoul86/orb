package chat.veil

import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.test.platform.app.InstrumentationRegistry
import org.json.JSONObject
import org.junit.Rule
import org.junit.Test
import java.io.File

/** Actual Veil activity, existing vault/controller, production guest adapter and Compose inbox. */
class GuestJourneyTest {
    @get:Rule val ui=createAndroidComposeRule<MainActivity>()
    private val files get()=ui.activity.filesDir
    private fun unlock() {
        ui.runOnIdle{MainActivity::class.java.getDeclaredMethod("authenticationAccepted").apply{isAccessible=true}.invoke(ui.activity)}
        ui.waitUntil(30000){ui.activity.portableSnapshot!=null && !ui.activity.busy}
    }
    private fun public(name:String,value:JSONObject) {File(files,"$name.tmp").writeText(value.toString());check(File(files,"$name.tmp").renameTo(File(files,name)))}
    private fun openInbox() {ui.runOnIdle{ui.activity.contactPage="guest";ui.activity.section=0}}
    private fun waitText(text:String) {ui.waitUntil(120000){ui.onAllNodesWithText(text,substring=true).fetchSemanticsNodes().isNotEmpty()}}
    @Test fun requestApprovalReply() {
        unlock()
        val account=JSONObject(InstrumentationRegistry.getInstrumentation().context.assets.open("pilot-account.json").bufferedReader().readText())
        var configured=false
        ui.runOnIdle{ui.activity.contactAction({
            if(!ready())createIdentity()
            val id=createFacet(PurposePolicy("TEST Alex",description="Design help",timezone="UTC"),"https://veil.test",false)
            GuestOwner(this,files).apply{configure(id,"http://10.0.2.2:8765","http://127.0.0.1:8766",account.getString("username"),account.getString("password"))}.snapshot()
        }){public("pilot-public.json",JSONObject().put("link",it.getString("link")));configured=true}}
        ui.waitUntil(60000){configured && !ui.activity.busy};openInbox()
        waitText("Browser visitor 1")
        ui.onNodeWithTag("guest-conversation-0").performScrollTo().performClick()
        waitText("PILOT_REQUEST_CANARY_91f7")
        public("pilot-arrival.json",JSONObject().put("requestInInbox",true))
        ui.onNodeWithTag("guest-approve").performScrollTo().performClick()
        waitText("Approved")
        ui.onNodeWithTag("guest-reply").performScrollTo().performTextInput("PILOT_REPLY_CANARY_39a2")
        ui.waitUntil(30000){!ui.activity.busy}
        ui.onNodeWithTag("guest-send").performScrollTo().performClick()
        waitText("Received by service")
        ui.runOnIdle {
            val v=ui.activity.window.decorView
            val image=android.graphics.Bitmap.createBitmap(v.width,v.height,android.graphics.Bitmap.Config.ARGB_8888)
            v.draw(android.graphics.Canvas(image))
            File(files,"pilot-reply.png").outputStream().use{image.compress(android.graphics.Bitmap.CompressFormat.PNG,100,it)}
            image.recycle()
        }
        public("pilot-replied.json",JSONObject().put("actualVeilInbox",true).put("uiApproval",true).put("uiReply",true))
    }
    @Test fun processRestartContinuationAndRevoke() {
        unlock();openInbox();waitText("Browser visitor 1")
        ui.onNodeWithTag("guest-conversation-0").performScrollTo().performClick()
        waitText("PILOT_REPLY_CANARY_39a2")
        waitText("PILOT_CONTINUE_CANARY_c3bf")
        ui.waitUntil(30000){!ui.activity.busy}
        ui.onNodeWithTag("guest-revoke").performScrollTo().performClick()
        waitText("Revoked")
        public("pilot-result.json",JSONObject().put("processRestart",true).put("continuedRequest",true).put("uiRevocation",true))
    }
}
