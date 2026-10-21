package chat.veil

import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.FilterQuality
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/** Keep the entire code and its white quiet zone visible, independent of explanatory text.
 * This stays inside the secured Activity; no extra window or capture exemption.
 */
@Composable internal fun InvitationQrScreen(link:String,modifier:Modifier=Modifier,onBack:()->Unit,onDetails:()->Unit) {
    val bitmap=remember(link){PurposeQr.renderPortable(link)}
    DisposableEffect(bitmap){onDispose{bitmap.recycle()}}
    val code:@Composable (Modifier)->Unit = { area ->
        BoxWithConstraints(area,contentAlignment=Alignment.Center) {
            Image(bitmap.asImageBitmap(),"Invitation QR code",Modifier.size(minOf(maxWidth,maxHeight)),filterQuality=FilterQuality.None)
        }
    }
    val controls:@Composable ()->Unit = {
        TextButton(onBack,modifier=Modifier.heightIn(min=48.dp)){Text("‹ Back")}
        Text("Your invitation QR",fontSize=24.sp)
        Text("Scan with your phone camera.",fontSize=16.sp)
    }
    BoxWithConstraints(modifier.padding(vertical=8.dp)) {
        if(maxWidth>maxHeight) {
            Row(Modifier.fillMaxSize(),horizontalArrangement=Arrangement.spacedBy(16.dp)) {
                code(Modifier.weight(1f).fillMaxHeight())
                Column(Modifier.weight(1f).fillMaxHeight().verticalScroll(rememberScrollState()),verticalArrangement=Arrangement.spacedBy(8.dp)) {
                    controls()
                    OutlinedButton(onDetails,modifier=Modifier.heightIn(min=48.dp)){Text("Details & other ways")}
                }
            }
        } else {
            Column(Modifier.fillMaxSize(),verticalArrangement=Arrangement.spacedBy(8.dp)) {
                controls()
                code(Modifier.weight(1f).fillMaxWidth())
                OutlinedButton(onDetails,modifier=Modifier.fillMaxWidth().heightIn(min=48.dp)){Text("Details & other ways")}
            }
        }
    }
}
