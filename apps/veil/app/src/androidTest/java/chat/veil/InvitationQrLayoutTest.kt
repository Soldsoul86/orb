package chat.veil

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.asAndroidBitmap
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.dp
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import android.graphics.Bitmap

/** Synthetic URL only. Render/decode evidence is not a physical camera or Lens test. */
class InvitationQrLayoutTest {
    @get:Rule val ui=createComposeRule()
    @Test fun entireQrDecodesWithoutScrollingAcrossSizesAndFontScales() {
        var landscape by mutableStateOf(false)
        var scale by mutableStateOf(1f)
        var dark by mutableStateOf(false)
        var details by mutableStateOf(false)
        val link="https://veil-relay-soldsoul86.onrender.com/i#"+"A".repeat(43)
        ui.setContent {
            CompositionLocalProvider(LocalDensity provides Density(1f,scale)) {
                MaterialTheme(colorScheme=if(dark)darkColorScheme() else lightColorScheme()) {
                    Surface(Modifier.size(if(landscape)640.dp else 360.dp,if(landscape)320.dp else 560.dp).testTag("viewport")) {
                        InvitationQrScreen(link,Modifier.fillMaxSize(),{}) {details=true}
                    }
                }
            }
        }
        for(rotated in listOf(false,true)) for(fontScale in listOf(1f,2f)) for(night in listOf(false,true)) {
            ui.runOnIdle {landscape=rotated;scale=fontScale;dark=night}
            ui.waitForIdle()
            val qr=ui.onNodeWithContentDescription("Invitation QR code").assertIsDisplayed()
            val bounds=qr.fetchSemanticsNode().boundsInRoot
            val viewport=ui.onNodeWithTag("viewport").fetchSemanticsNode().boundsInRoot
            assertTrue("Entire QR fits the viewport",bounds.left>=viewport.left && bounds.top>=viewport.top && bounds.right<=viewport.right && bounds.bottom<=viewport.bottom)
            assertEquals(bounds.width,bounds.height,1f)
            assertTrue("QR has useful visible area",bounds.width>=200)
            val bytes=ByteArrayOutputStream()
            qr.captureToImage().asAndroidBitmap().compress(Bitmap.CompressFormat.PNG,100,bytes)
            assertEquals(link,PurposeQr.readPortable(ByteArrayInputStream(bytes.toByteArray())))
            ui.onNodeWithText("Details & other ways").assertIsDisplayed().performClick()
            ui.runOnIdle {assertTrue(details);details=false}
        }
    }
}
