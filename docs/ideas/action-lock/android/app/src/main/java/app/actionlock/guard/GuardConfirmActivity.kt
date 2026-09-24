package app.actionlock.guard

import android.os.Bundle
import androidx.biometric.BiometricManager.Authenticators.BIOMETRIC_STRONG
import androidx.biometric.BiometricManager.Authenticators.DEVICE_CREDENTIAL
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity

/** The fingerprint step for a large payment to someone new; lifts the pause on success. */
class GuardConfirmActivity : FragmentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val key = intent.getStringExtra("key") ?: return finish()
        val event = intent.getStringExtra("event") ?: "{}"
        val prompt = BiometricPrompt(
            this,
            ContextCompat.getMainExecutor(this),
            object : BiometricPrompt.AuthenticationCallback() {
                override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                    PayGuardService.instance?.release(key, event, "confirmed")
                    finish()
                }

                override fun onAuthenticationError(errorCode: Int, errString: CharSequence) = finish()
            },
        )
        prompt.authenticate(
            BiometricPrompt.PromptInfo.Builder()
                .setTitle(intent.getStringExtra("title") ?: "Confirm this payment")
                .setSubtitle("Orb paused it: large, and to someone new.")
                .setAllowedAuthenticators(BIOMETRIC_STRONG or DEVICE_CREDENTIAL)
                .build(),
        )
    }
}
