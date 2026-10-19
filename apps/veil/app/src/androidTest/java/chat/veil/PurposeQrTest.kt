package chat.veil
import org.junit.Assert.*
import org.junit.Test
import java.io.ByteArrayOutputStream
import android.graphics.Bitmap
class PurposeQrTest {
    @Test fun fullSignedPortableCardQrIsTheSameInvitation() {
        val db=org.json.JSONObject()
        val client=PortableSession(db,{}, {_,_,_->error("Creation must be offline")})
        client.createIdentity()
        val id=client.createFacet(PurposePolicy("Personal",timezone="Pacific/Auckland"),"https://independent.example",false)
        val card=client.card(id);val bitmap=PurposeQr.renderPortable(card)
        val bytes=ByteArrayOutputStream().also {bitmap.compress(Bitmap.CompressFormat.PNG,100,it)}.toByteArray();bitmap.recycle()
        assertEquals(card,PurposeQr.readPortable(bytes.inputStream()))
        assertEquals(id,client.inspectCard(card).getString("id"))
    }
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
