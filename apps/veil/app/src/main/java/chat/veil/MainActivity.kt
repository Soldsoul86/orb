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
    var section by mutableStateOf(0)
    var legacyChat by mutableStateOf(true)
    var purposeSnapshot by mutableStateOf<PurposeSnapshot?>(null); private set
    var purposeListings by mutableStateOf<List<PurposeListing>>(emptyList()); private set
    var purposeTarget by mutableStateOf<PurposeListing?>(null); private set
    var purposeNotice by mutableStateOf(""); private set
    var purposeLinkInput by mutableStateOf("")
    private var pendingPurposeLink: String? = null
    private var pendingQr: Uri? = null
    private val qrPicker = registerForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        pendingQr = uri
        if (unlocked) importPurposeEntry()
    }
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
        capturePurposeLink(intent)
    }
    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent); setIntent(intent); capturePurposeLink(intent)
        if (unlocked) importPurposeEntry()
    }
    private fun capturePurposeLink(intent: Intent?) {
        val data = intent?.data ?: return
        if (intent.action != Intent.ACTION_VIEW) return
        val candidate = if (data.scheme == "veil-purpose" && data.host == "open") data.getQueryParameter("link") else data.toString()
        if (candidate != null && candidate.length <= 500) pendingPurposeLink = candidate
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
        purposeSnapshot = null; purposeListings = emptyList(); purposeTarget = null; purposeNotice = ""; purposeLinkInput = ""
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
        action({ snapshot() }) {
            snapshot = it; if (!it.ready) legacyChat = false
            importPending(); refreshPurposes(); startPolling()
        }
    }
    private fun startPolling() {
        polling?.cancel()
        polling = lifecycleScope.launch {
            val engine = Messenger(this@MainActivity)
            var purposeTick = 0
            while (unlocked) {
                delay(2000)
                val token = generation
                val result = withContext(Dispatchers.IO) { mutex.withLock { runCatching {
                    var syncError = false
                    try { engine.sync() } catch (_: Exception) { syncError = true }
                    engine.snapshot() to syncError
                } } }
                if (unlocked && token == generation) result.onSuccess {
                    snapshot = it.first
                    if (it.second) notice = "Delivery paused. Check the relay connection and storage limits. Queued messages will retry."
                }.onFailure { notice = "Vault could not be read. Your data has not been reset." }
                purposeTick++
                if (purposeTick % 5 == 0 && unlocked) {
                    val purposes = withContext(Dispatchers.IO) { mutex.withLock { runCatching {
                        val p = PurposeEngine(this@MainActivity)
                        val error = runCatching { p.sync() }.isFailure
                        p.snapshot() to error
                    } } }
                    if (unlocked && token == generation) purposes.onSuccess {
                        purposeSnapshot = it.first
                        if (it.second) purposeNotice = "Some purpose delivery is paused. Check hours, permissions or connection; queued messages will retry."
                    }.onFailure { purposeNotice = "Purpose data could not be read. Nothing has been reset." }
                }
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
    private fun <T> purposeAction(block: PurposeEngine.() -> T, done: (T) -> Unit = {}) {
        if (!unlocked || busy) return
        busy = true; purposeNotice = ""
        val token = generation
        lifecycleScope.launch {
            val result = withContext(Dispatchers.IO) { mutex.withLock { runCatching { PurposeEngine(this@MainActivity).block() } } }
            if (unlocked && token == generation) {
                busy = false
                result.onSuccess(done).onFailure { purposeNotice = "Could not complete this action. The server must support purposes; check connection, rules, quotas and approval. Nothing was reset." }
            }
        }
    }
    fun refreshPurposes() = purposeAction({ snapshot() }) { purposeSnapshot = it; importPurposeEntry() }
    fun setupPurposes() = purposeAction({ setup(); snapshot() }) { purposeSnapshot = it }
    fun createPurpose(p: PurposePolicy, consent: Boolean) = purposeAction({ create(p, consent); snapshot() }) { purposeSnapshot = it; section = 2 }
    fun editPurpose(id: String, p: PurposePolicy, consent: Boolean) = purposeAction({ update(id,p,consent); snapshot() }) { purposeSnapshot = it }
    fun searchPurposes(query: String) = purposeAction({ search(query) }) { purposeListings = it }
    fun lookupPurpose(value: String) = purposeAction({ lookup(value) }) { purposeTarget = it }
    fun choosePurpose(listing: PurposeListing) { purposeTarget = listing }
    fun closePurposeTarget() { purposeTarget = null }
    fun requestPurpose(listing: PurposeListing, text: String) = purposeAction({ request(listing,text); snapshot() }) {
        purposeSnapshot = it; purposeTarget = null; section = 0; legacyChat = false
    }
    fun decidePurpose(id: String, status: String) = purposeAction({ decide(id,status); snapshot() }) { purposeSnapshot = it }
    fun comparePurpose(id: String) = purposeAction({ compare(id); snapshot() }) { purposeSnapshot = it }
    fun sendPurpose(id: String, text: String, done: () -> Unit) = purposeAction({ send(id,text); snapshot() }) { purposeSnapshot = it; done() }
    fun reportPurpose(id: String) = purposeAction({ report(id) }) { purposeNotice = "Report recorded for operator review. This does not automatically block the listing." }
    fun sharePurpose(link: String) {
        if (!unlocked || link.isEmpty()) return
        startActivity(Intent.createChooser(Intent(Intent.ACTION_SEND).apply { type="text/plain";putExtra(Intent.EXTRA_TEXT,link) },"Share purpose link"))
    }
    fun copyPurpose(link: String) {
        if (!unlocked || link.isEmpty()) return
        val clip=android.content.ClipData.newPlainText("Veil purpose invitation",link)
        if (Build.VERSION.SDK_INT>=33) clip.description.extras=android.os.PersistableBundle().apply { putBoolean("android.content.extra.IS_SENSITIVE",true) }
        getSystemService(android.content.ClipboardManager::class.java).setPrimaryClip(clip)
        purposeNotice="Link copied. A private invitation permits one contact request, not unrestricted chat. Clipboard apps may retain it."
    }
    fun pickPurposeQr() { if(unlocked && !busy)qrPicker.launch("image/*") }
    private fun importPurposeEntry() {
        pendingPurposeLink?.let { purposeLinkInput=it;pendingPurposeLink=null;section=1 }
        val uri=pendingQr ?: return
        if(busy || !unlocked)return
        pendingQr=null
        purposeAction({ contentResolver.openInputStream(uri)?.use(PurposeQr::read) ?: error("Image unavailable") }) {
            purposeLinkInput=it;section=1
        }
    }
    fun prepareAndShareInvite() = action({ invitation() }) {
        invitation = it
        shareInvite()
    }
    private fun shareInvite() {
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
