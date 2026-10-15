package chat.veil
import org.junit.Assert.*
import org.junit.Test
import java.io.ByteArrayOutputStream
import android.graphics.Bitmap
class PurposeQrTest {
    @Test fun generatedAndImportedQrResolvesToExactPurpose() {
        val relay="https://relay.example";val alias="p-"+"a".repeat(32);val invite="b".repeat(43)
        val link=PurposeLink.create(relay,alias,invite)
        val bitmap=PurposeQr.render(link)
        val bytes=ByteArrayOutputStream().also { bitmap.compress(Bitmap.CompressFormat.PNG,100,it) }.toByteArray()
        bitmap.recycle()
        val decoded=PurposeQr.read(bytes.inputStream())
        assertEquals(link,decoded)
        assertEquals(alias to invite,PurposeLink.parse(decoded,relay))
    }
}
