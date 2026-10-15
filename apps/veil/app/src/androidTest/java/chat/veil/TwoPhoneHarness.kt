package chat.veil

import android.graphics.Bitmap
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Assume.assumeTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.io.ByteArrayOutputStream
import java.io.File
import java.security.MessageDigest

/** Explicit debug-only two-phone harness. No exported component or production unlock bypass. */
@RunWith(AndroidJUnit4::class)
class TwoPhoneHarness {
    @Test fun step() {
        val args = InstrumentationRegistry.getArguments()
        val step = args.getString("veilStep")
        assumeTrue("Run with scripts/two_phone.py", step != null)
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val engine = Messenger(context)
        val dir = File(context.filesDir, "harness").apply { mkdirs() }
        fun photo(): ByteArray {
            val bitmap = Bitmap.createBitmap(320, 240, Bitmap.Config.ARGB_8888).apply { eraseColor(0xFF28A080.toInt()) }
            return ByteArrayOutputStream().apply { bitmap.compress(Bitmap.CompressFormat.PNG, 100, this); bitmap.recycle() }.toByteArray()
        }
        when (step) {
            "setup" -> {
                engine.setup(args.getString("relay")!!)
                File(dir, "invite.txt").writeText(engine.invitation())
            }
            "pair" -> {
                engine.pair(File(dir, "peer.txt").readText())
                // Test fixtures exchange both invites directly over trusted USB. UI users must compare codes.
                engine.verify(); assertTrue(engine.snapshot().verified)
            }
            "send" -> {
                engine.send("VEIL_E2E_CANARY_5738", null, "", Mode.PROTECTED, 3_600_000, 0)
                engine.send("", photo(), "image/png", Mode.EYES_ONLY, 3_600_000, 15_000)
                val video = File(dir, "fixture.mp4")
                if (video.exists()) engine.send("", video.readBytes(), "video/mp4", Mode.EYES_ONLY, 3_600_000, 0)
                engine.sync(); assertEquals(0, engine.snapshot().pending)
            }
            "receive" -> {
                repeat(4) { engine.sync() }
                val messages = engine.snapshot().messages
                assertTrue(messages.any { !it.mine && it.text == "VEIL_E2E_CANARY_5738" })
                val image = messages.first { !it.mine && it.kind == "photo" }
                val bytes = engine.open(image.id).second
                assertArrayEquals(photo(), bytes); bytes.fill(0)
                val expectedVideo = File(dir, "fixture.mp4")
                if (expectedVideo.exists()) {
                    val video = messages.first { !it.mine && it.kind == "video" }
                    val received = engine.open(video.id).second
                    assertArrayEquals(MessageDigest.getInstance("SHA-256").digest(expectedVideo.readBytes()), MessageDigest.getInstance("SHA-256").digest(received))
                    received.fill(0)
                }
            }
            "send-expiring" -> {
                engine.send("VEIL_EXPIRING", null, "", Mode.EYES_ONLY, 60_000, 0); engine.sync()
            }
            "receive-expiring" -> {
                engine.sync(); assertTrue(engine.snapshot().messages.any { it.text == "VEIL_EXPIRING" })
            }
            "expired" -> assertFalse(engine.snapshot().messages.any { it.text == "VEIL_EXPIRING" })
            "clean" -> dir.deleteRecursively()
            else -> error("Unknown harness step")
        }
    }
}
