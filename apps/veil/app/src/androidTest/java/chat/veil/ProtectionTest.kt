package chat.veil

import android.graphics.Bitmap
import android.os.SystemClock
import android.os.ParcelFileDescriptor
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import androidx.test.core.app.ActivityScenario
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import java.io.ByteArrayOutputStream
import java.util.concurrent.atomic.AtomicBoolean

@RunWith(AndroidJUnit4::class)
class ProtectionTest {
    @Test fun flagIsSetBeforeAuthentication() {
        ActivityScenario.launch(MainActivity::class.java).use { scenario -> scenario.onActivity { a ->
            assertTrue(a.window.attributes.flags and WindowManager.LayoutParams.FLAG_SECURE != 0)
            assertFalse(a.unlocked)
        } }
    }
    @Test fun nativeRevealReleaseCancelAndFocusLoss() {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        // These are test-device preparation commands, not app permissions or an
        // authentication bypass. A credential-protected device still needs its owner.
        for (command in listOf("input keyevent KEYCODE_WAKEUP", "wm dismiss-keyguard")) {
            ParcelFileDescriptor.AutoCloseInputStream(instrumentation.uiAutomation.executeShellCommand(command)).use { it.readBytes() }
        }
        ActivityScenario.launch(MainActivity::class.java).use { scenario ->
            instrumentation.waitForIdleSync()
            // RESUMED may precede the first window traversal. Attach the test view
            // only after the actual Activity window is ready, never force focus.
            val windowReady = AtomicBoolean(false)
            val windowDeadline = SystemClock.uptimeMillis() + 10_000
            while (!windowReady.get() && SystemClock.uptimeMillis() < windowDeadline) {
                scenario.onActivity { windowReady.set(it.window.decorView.hasWindowFocus()) }
                if (!windowReady.get()) Thread.sleep(50)
            }
            assertTrue("Activity must have real window focus before attaching the viewer", windowReady.get())
            var view: SecureMediaView? = null
            scenario.onActivity { a ->
                val bitmap = Bitmap.createBitmap(32, 32, Bitmap.Config.ARGB_8888)
                val bytes = ByteArrayOutputStream().apply { bitmap.compress(Bitmap.CompressFormat.PNG, 100, this) }.toByteArray()
                bitmap.recycle()
                val m = ChatMessage("1234", false, "photo", Mode.EYES_ONLY, "", "image/png", now()+60_000, 0, 0, "abc123", "Received")
                view = SecureMediaView(a, m, bytes) {}
                a.addContentView(view, android.view.ViewGroup.LayoutParams(300, 300))
            }
            instrumentation.waitForIdleSync()
            // Activity RESUMED / main-loop idle can precede window focus on a cold emulator.
            // Wait for the actual precondition instead of mistaking that race for a reveal failure.
            val focused = AtomicBoolean(false)
            val deadline = SystemClock.uptimeMillis() + 10_000
            while (!focused.get() && SystemClock.uptimeMillis() < deadline) {
                scenario.onActivity { focused.set(view!!.hasWindowFocus()) }
                if (!focused.get()) Thread.sleep(50)
            }
            scenario.onActivity {
                val v = view!!
                assertTrue("Viewer must remain attached", v.isAttachedToWindow)
                assertTrue("Device must be awake and unlocked", v.hasWindowFocus())
                fun event(action: Int) {
                    val t = SystemClock.uptimeMillis()
                    MotionEvent.obtain(t, t, action, 100f, 100f, 0).also { e -> v.onTouchEvent(e); e.recycle() }
                }
                assertEquals(View.VISIBLE, v.getChildAt(2).visibility)
                event(MotionEvent.ACTION_DOWN)
                assertEquals(View.GONE, v.getChildAt(2).visibility)
                event(MotionEvent.ACTION_UP)
                assertEquals(View.VISIBLE, v.getChildAt(2).visibility)
                event(MotionEvent.ACTION_DOWN); event(MotionEvent.ACTION_CANCEL)
                assertEquals(View.VISIBLE, v.getChildAt(2).visibility)
                event(MotionEvent.ACTION_DOWN); v.onWindowFocusChanged(false)
                assertEquals(View.VISIBLE, v.getChildAt(2).visibility)
                assertEquals(View.INVISIBLE, v.getChildAt(0).visibility)
                v.dispose()
            }
        }
    }
}
