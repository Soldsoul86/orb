package chat.veil

import android.app.KeyguardManager
import android.content.Intent
import android.graphics.Color as AndroidColor
import android.media.MediaMetadataRetriever
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.view.View
import android.view.WindowManager
import android.widget.FrameLayout
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.compose.runtime.*
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.*
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import java.io.ByteArrayOutputStream

class MainActivity : FragmentActivity() {
    var unlocked by mutableStateOf(false); private set
    var snapshot by mutableStateOf<Snapshot?>(null); private set
    var busy by mutableStateOf(false); private set
    var notice by mutableStateOf(""); private set
    var viewer by mutableStateOf<Pair<ChatMessage, ByteArray>?>(null); private set
    var attachment by mutableStateOf<Pair<String, ByteArray>?>(null); private set
    var invitation by mutableStateOf(""); private set
    private lateinit var curtain: View
    private val mutex = processMutex
    companion object { private val processMutex = Mutex() }
    private var generation = 0
    private var polling: Job? = null
    private var pendingUri: Uri? = null
    private var authShowing = false
    var concealPlayer: (() -> Unit)? = null
    private val picker = registerForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        pendingUri = uri
        if (unlocked) importPending()
    }
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
        if (Build.VERSION.SDK_INT >= 31) window.setHideOverlayWindows(true)
        if (Build.VERSION.SDK_INT >= 33) setRecentsScreenshotEnabled(false)
        setContent { VeilApp(this) }
        curtain = android.widget.TextView(this).apply {
            text = "Veil is locked\n\nTap to unlock"
            textSize = 20f
            gravity = android.view.Gravity.CENTER
            setTextColor(AndroidColor.rgb(181, 244, 207))
            setOnClickListener { unlock() }
            setBackgroundColor(AndroidColor.rgb(11, 16, 20))
            contentDescription = "Veil is locked. Tap to unlock."
            visibility = View.GONE
        }
        addContentView(curtain, FrameLayout.LayoutParams(-1, -1))
    }
    fun contentCommitted(renderedUnlocked: Boolean) {
        // A queued commit from before a focus loss must never uncover locked content.
        if (renderedUnlocked && unlocked && ::curtain.isInitialized) curtain.visibility = View.GONE
    }
    override fun onPause() {
        if (::curtain.isInitialized) curtain.visibility = View.VISIBLE
        lock()
        super.onPause()
    }
    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (!hasFocus && ::curtain.isInitialized) {
            curtain.visibility = View.VISIBLE
            concealPlayer?.invoke()
            // Losing focus invalidates a hold even when Activity.onPause is not dispatched.
            if (unlocked) lock()
        }
    }
    private fun lock() {
        generation++; unlocked = false; busy = false
        concealPlayer?.invoke(); closeViewer()
        attachment?.second?.fill(0); attachment = null
        invitation = ""; snapshot = null; notice = ""
        polling?.cancel(); polling = null
    }
    fun unlock() {
        if (authShowing) return
        if (!getSystemService(KeyguardManager::class.java).isDeviceSecure) {
            notice = "Set a device PIN or password in Android Settings, then unlock Veil."; return
        }
        val authenticators = if (Build.VERSION.SDK_INT >= 30)
            BiometricManager.Authenticators.BIOMETRIC_STRONG or BiometricManager.Authenticators.DEVICE_CREDENTIAL
        else BiometricManager.Authenticators.BIOMETRIC_WEAK or BiometricManager.Authenticators.DEVICE_CREDENTIAL
        authShowing = true
        val prompt = BiometricPrompt(this, ContextCompat.getMainExecutor(this), object : BiometricPrompt.AuthenticationCallback() {
            override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                authenticationAccepted()
            }
            override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                authShowing = false; notice = "Unlock canceled or unavailable. Use your device credential to retry."
            }
        })
        prompt.authenticate(BiometricPrompt.PromptInfo.Builder().setTitle("Open Veil")
            .setSubtitle("Your conversations stay behind this lock")
            .setAllowedAuthenticators(authenticators).build())
    }
    private fun authenticationAccepted() {
        authShowing = false; unlocked = true
        action({ snapshot() }) { snapshot = it; importPending(); startPolling() }
    }
    private fun startPolling() {
        polling?.cancel()
        polling = lifecycleScope.launch {
            while (unlocked) {
                delay(2000)
                val token = generation
                val result = withContext(Dispatchers.IO) { mutex.withLock { runCatching {
                    val engine = Messenger(this@MainActivity)
                    var syncError = false
                    try { engine.sync() } catch (_: Exception) { syncError = true }
                    engine.snapshot() to syncError
                } } }
                if (unlocked && token == generation) result.onSuccess {
                    snapshot = it.first
                    if (it.second) notice = "Delivery paused. Check the relay connection and storage limits. Queued messages will retry."
                }.onFailure { notice = "Vault could not be read. Your data has not been reset." }
            }
        }
    }
    private fun <T> action(block: Messenger.() -> T, success: (T) -> Unit = {}) {
        if (!unlocked || busy) return
        busy = true; notice = ""
        val token = generation
        lifecycleScope.launch {
            val result = withContext(Dispatchers.IO) { mutex.withLock { runCatching { Messenger(this@MainActivity).block() } } }
            if (unlocked && token == generation) {
                busy = false
                result.onSuccess(success).onFailure {
                    notice = "Couldn’t complete this action. Check the invitation, connection, expiration and storage limits. No security checks were bypassed."
                }
            }
        }
    }
    fun setup(url: String) = action({ setup(url); snapshot() }) { snapshot = it }
    fun createInvite() = action({ invitation() }) { invitation = it }
    fun shareInvite() {
        if (invitation.isNotEmpty()) startActivity(Intent.createChooser(Intent(Intent.ACTION_SEND).apply {
            type = "text/plain"; putExtra(Intent.EXTRA_TEXT, invitation)
        }, "Exchange privately"))
    }
    fun pair(value: String) = action({ pair(value); snapshot() }) { snapshot = it; invitation = "" }
    fun verify() = action({ verify(); snapshot() }) { snapshot = it }
    fun attach() { picker.launch("*/*") }
    fun removeAttachment() { attachment?.second?.fill(0); attachment = null }
    private fun importPending() {
        val uri = pendingUri ?: return
        pendingUri = null
        action({
            val mime = contentResolver.getType(uri) ?: error("No media type")
            require(mime in listOf("image/jpeg", "image/png", "image/webp", "video/mp4"))
            if (mime == "video/mp4") {
                val retriever = MediaMetadataRetriever()
                try {
                    retriever.setDataSource(this@MainActivity, uri)
                    val duration = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)?.toLong() ?: 0
                    require(duration in 1..15_000)
                } finally { retriever.release() }
            }
            val bytes = contentResolver.openInputStream(uri)!!.use { input ->
                val out = ByteArrayOutputStream(); val buffer = ByteArray(8192)
                while (true) {
                    val count = input.read(buffer); if (count < 0) break
                    require(out.size()+count <= MAX_MEDIA)
                    out.write(buffer, 0, count)
                }
                buffer.fill(0); out.toByteArray()
            }
            if (mime.startsWith("image/")) {
                val opts = android.graphics.BitmapFactory.Options().apply { inJustDecodeBounds = true }
                android.graphics.BitmapFactory.decodeByteArray(bytes, 0, bytes.size, opts)
                require(opts.outWidth in 1..12000 && opts.outHeight in 1..12000 && opts.outWidth.toLong()*opts.outHeight <= 24_000_000)
            }
            mime to bytes
        }) { attachment = it }
    }
    fun send(text: String, mode: Mode, ttl: Long, viewMs: Long, done: () -> Unit) {
        val media = attachment
        action({ send(text, media?.second, media?.first ?: "", mode, ttl, viewMs); snapshot() }) {
            snapshot = it; removeAttachment(); done()
        }
    }
    fun open(id: String) = action({ open(id) }) { viewer = it }
    fun closeViewer() { concealPlayer?.invoke(); viewer?.second?.fill(0); viewer = null }
}
