package chat.veil

import android.view.View
import android.view.WindowManager
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.lifecycle.Lifecycle
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test

/** Exercises the real Compose/native cover transition, not the OS biometric matcher.
 * Reflection supplies an accepted authentication callback only inside instrumentation.
 * No Intent, public method or production bypass is added to the application.
 */
class UnlockRegressionTest {
    @get:Rule val compose = createAndroidComposeRule<MainActivity>()

    private fun cover(): View {
        val field = MainActivity::class.java.getDeclaredField("curtain")
        field.isAccessible = true
        return field.get(compose.activity) as View
    }

    private fun acceptAuthentication() {
        val callback = MainActivity::class.java.getDeclaredMethod("authenticationAccepted")
        callback.isAccessible = true
        callback.invoke(compose.activity)
    }

    private fun awaitSetup() {
        compose.waitUntil(10_000) { compose.activity.snapshot != null }
        compose.onNodeWithText("Relay HTTPS address").assertIsDisplayed()
        compose.runOnIdle {
            assertTrue(compose.activity.unlocked)
            // Compose semantics alone would pass even with the opaque native cover on top.
            assertEquals("Authenticated content must not remain covered", View.GONE, cover().visibility)
            assertTrue(compose.activity.window.attributes.flags and WindowManager.LayoutParams.FLAG_SECURE != 0)
        }
    }

    @Test fun successfulAuthenticationRemovesNativeCover() {
        compose.runOnIdle {
            compose.activity.onWindowFocusChanged(false)
            assertEquals(View.VISIBLE, cover().visibility)
            acceptAuthentication()
            compose.activity.onWindowFocusChanged(true)
        }
        awaitSetup()
    }

    @Test fun backgroundAndFocusLossStillLockAndAllowAnotherUnlock() {
        compose.runOnIdle { acceptAuthentication() }
        awaitSetup()
        compose.runOnIdle {
            compose.activity.onWindowFocusChanged(false)
            assertFalse(compose.activity.unlocked)
            assertEquals(View.VISIBLE, cover().visibility)
            compose.activity.contentCommitted(true) // stale unlocked frame
            assertEquals(View.VISIBLE, cover().visibility)
            compose.activity.onWindowFocusChanged(true)
            acceptAuthentication()
        }
        awaitSetup()
        compose.activityRule.scenario.moveToState(Lifecycle.State.CREATED)
        compose.activityRule.scenario.moveToState(Lifecycle.State.RESUMED)
        compose.runOnIdle {
            assertFalse(compose.activity.unlocked)
            assertEquals(View.VISIBLE, cover().visibility)
            acceptAuthentication()
        }
        awaitSetup()
    }
}
