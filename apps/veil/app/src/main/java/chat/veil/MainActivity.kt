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
    var contactPage by mutableStateOf("home")
    var contactSelected by mutableStateOf("")
    var contactDraft by mutableStateOf(java.util.UUID.randomUUID().toString().replace("-",""))
    var contactPreview by mutableStateOf<org.json.JSONObject?>(null); private set
    var contactIncoming by mutableStateOf(""); private set
    private var pendingContactLink: String? = null
    var portableScreen by mutableStateOf(true)
    var portableSnapshot by mutableStateOf<org.json.JSONObject?>(null); private set
    var portableNotice by mutableStateOf(""); private set
    var portableBackup by mutableStateOf(""); private set
    var portableFileName by mutableStateOf(""); private set
    private var pendingPortableFile: Uri? = null
    private var encryptedExport: String? = null
    private val portableOpen = registerForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        pendingPortableFile=uri
        if(unlocked)readPortableFile()
    }
    private val portableSave = registerForActivityResult(ActivityResultContracts.CreateDocument("application/jose")) { uri ->
        val encrypted=encryptedExport;encryptedExport=null
        if(uri!=null && encrypted!=null)lifecycleScope.launch(Dispatchers.IO) {
            val ok=runCatching {contentResolver.openOutputStream(uri,"wt")!!.use {it.write(encrypted.toByteArray())}}.isSuccess
            withContext(Dispatchers.Main) {if(unlocked)portableNotice=if(ok) "Encrypted backup saved. Keep the recovery key separately." else "Backup could not be saved. Try again."}
        }
    }
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
        contactPage=savedInstanceState?.getString("contactPage") ?: "home"
        contactSelected=savedInstanceState?.getString("contactSelected") ?: ""
        contactDraft=savedInstanceState?.getString("contactDraft") ?: contactDraft
        section=savedInstanceState?.getInt("section") ?: 0
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
    override fun onSaveInstanceState(outState: Bundle) {
        // Navigation and random operation IDs only; no links, text or recovery secrets.
        outState.putString("contactPage",contactPage);outState.putString("contactSelected",contactSelected)
        outState.putString("contactDraft",contactDraft);outState.putInt("section",section)
        super.onSaveInstanceState(outState)
    }
    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent); setIntent(intent); capturePurposeLink(intent)
        if (unlocked) {importPurposeEntry();importContactEntry()}
    }
    private fun capturePurposeLink(intent: Intent?) {
        val data = intent?.data ?: return
        if (intent.action != Intent.ACTION_VIEW) return
        val contact = if(data.scheme=="veil-contact" && data.host=="open")data.getQueryParameter("link") else data.toString()
        if(contact!=null && runCatching {ContactExperience.parse(contact)}.isSuccess) {pendingContactLink=contact;return}
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
        portableSnapshot=null;portableNotice="";portableBackup="";portableFileName=""
        contactPreview=null;contactIncoming=""
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
                if(purposeTick % 5 == 0 && unlocked && !busy && portableSnapshot?.optBoolean("ready")==true) {
                    val updated=withContext(Dispatchers.IO) {mutex.withLock {runCatching {
                        val vault=Vault(this@MainActivity,"identity.v1")
                        val p=PortableSession(vault.read(),vault::write,{origin,path,data -> RelayClient(origin).request("POST",path,data=data)})
                        val before=p.snapshot();val facets=before.optJSONArray("facets")
                        var failed=false
                        if(facets!=null)for(i in 0 until facets.length()) {
                            val f=facets.getJSONObject(i)
                            if(!f.optBoolean("needs_migration"))runCatching {p.sync(f.getString("id"))}.onFailure {failed=true}
                        }
                        p.snapshot() to failed
                    }}}
                    if(unlocked && token==generation)updated.onSuccess {portableSnapshot=it.first;if(it.second)portableNotice="Some conversations could not refresh. Check your connection or contact hours, then retry."}
                }
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
    fun refreshPurposes() = purposeAction({ snapshot() }) { purposeSnapshot = it; importPurposeEntry(); contactAction({}) {importContactEntry()} }
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
    fun portableAction(block: PortableSession.()->Unit = {}) {
        if(!unlocked || busy)return
        busy=true;portableNotice="";val token=generation
        lifecycleScope.launch {
            val result=withContext(Dispatchers.IO) {mutex.withLock {runCatching {
                val vault=Vault(this@MainActivity,"identity.v1")
                val session=PortableSession(vault.read(),vault::write,{origin,path,data -> RelayClient(origin).request("POST",path,data=data)})
                session.block();session.snapshot()
            }}}
            if(unlocked && generation==token) {
                busy=false;result.onSuccess {portableSnapshot=it;readPortableFile()}.onFailure {portableNotice="Action incomplete. Check the provider, signed identity, permissions or recovery key. Stored identities were not reset. Refresh to retry delivery."}
            }
        }
    }
    fun <T> contactAction(block: PortableSession.()->T, done: (T)->Unit = {}) {
        if(!unlocked || busy)return
        busy=true;portableNotice="";val token=generation
        lifecycleScope.launch {
            val result=withContext(Dispatchers.IO) {mutex.withLock {
                runCatching {
                    val vault=Vault(this@MainActivity,"identity.v1")
                    val session=PortableSession(vault.read(),vault::write,{origin,path,data -> RelayClient(origin).request("POST",path,data=data)})
                    val operation=runCatching {session.block()}
                    Triple(operation,session.snapshot(),Unit)
                }
            }}
            if(unlocked && token==generation) {
                busy=false
                result.onSuccess { (operation,snap,_) ->
                    portableSnapshot=snap
                    operation.onSuccess(done).onFailure {portableNotice=ContactErrors.message(it)}
                    readPortableFile()
                }.onFailure {portableNotice="Your saved identity could not be opened. Nothing has been reset."}
            }
        }
    }
    fun newContact() {contactDraft=java.util.UUID.randomUUID().toString().replace("-","");contactPage="new";contactSelected="";portableNotice=""}
    fun prepareContact(kind:ContactExperience.Kind,p:PurposePolicy) {
        val draft=contactDraft
        contactAction({prepareInvitation(draft,kind,p)}) {id -> contactSelected=id;contactPage="invitation"}
    }
    fun resumeContact(id:String) = contactAction({resumeInvitation(id)}) {contactSelected=it;contactPage="invitation"}
    fun shareContactLink() {
        val fs=portableSnapshot?.optJSONArray("facets") ?: return
        val f=(0 until fs.length()).map(fs::getJSONObject).firstOrNull {it.getString("id")==contactSelected} ?: return
        val link=f.optJSONObject("invitation")?.optString("link") ?: return
        if(!unlocked || link.isBlank())return
        startActivity(Intent.createChooser(Intent(Intent.ACTION_SEND).apply {type="text/plain";putExtra(Intent.EXTRA_TEXT,link)},"Share invitation"))
    }
    fun copyContactLink(link:String) {
        if(!unlocked || runCatching{ContactExperience.parse(link)}.isFailure)return
        val manager=getSystemService(android.content.ClipboardManager::class.java)
        val clip=android.content.ClipData.newPlainText("Veil invitation",link)
        if(Build.VERSION.SDK_INT>=33)clip.description.extras=android.os.PersistableBundle().apply {putBoolean("android.content.extra.IS_SENSITIVE",true)}
        manager.setPrimaryClip(clip);portableNotice="Invitation copied. Only send it to people you choose."
        android.os.Handler(mainLooper).postDelayed({
            if(manager.primaryClip?.getItemAt(0)?.text?.toString()==link)manager.clearPrimaryClip()
        },60_000)
    }
    private fun importContactEntry() {
        val link=pendingContactLink ?: return
        if(!unlocked || busy)return
        contactIncoming=link;contactPage="receive";section=0
        contactAction({previewInvitation(link)}) {contactPreview=it}
    }
    fun openContactLink(value:String) {
        if(runCatching{ContactExperience.parse(value)}.isFailure){portableNotice="This invitation is incomplete. Ask your contact to share it again.";return}
        pendingContactLink=value.trim();contactDraft=java.util.UUID.randomUUID().toString().replace("-","");importContactEntry()
    }
    fun requestContact(text:String) {
        val link=contactIncoming;val draft=contactDraft
        contactAction({requestInvitation(link,text,draft)}) {id ->
            pendingContactLink=null;contactIncoming="";contactPreview=null;contactSelected=id;contactPage="chat";section=0
            intent.data=null
        }
    }
    fun dismissContactLink() {pendingContactLink=null;contactIncoming="";contactPreview=null;intent.data=null;contactPage="home"}
    fun choosePortableFile() {if(unlocked && !busy)portableOpen.launch(arrayOf("*/*"))}
    private fun readPortableFile() {
        val uri=pendingPortableFile ?: return
        if(!unlocked || busy)return
        pendingPortableFile=null;val token=generation;busy=true
        lifecycleScope.launch {
            val result=withContext(Dispatchers.IO) {runCatching {contentResolver.openInputStream(uri)!!.use {input ->
                val out=ByteArrayOutputStream();val buffer=ByteArray(8192)
                while(true) {val n=input.read(buffer);if(n<0)break;require(out.size()+n<=6*1024*1024);out.write(buffer,0,n)}
                out.toString("UTF-8")
            }}}
            if(unlocked && generation==token) {busy=false;result.onSuccess {portableBackup=it;portableFileName="Encrypted package selected"}.onFailure {portableNotice="Could not read the encrypted package."}}
        }
    }
    fun savePortableBackup(key:String) {
        if(!unlocked || busy)return
        busy=true;val token=generation
        lifecycleScope.launch {
            val result=withContext(Dispatchers.IO) {mutex.withLock {runCatching {
                val vault=Vault(this@MainActivity,"identity.v1")
                PortableSession(vault.read(),vault::write,{_,_,_->error("Export is offline")}).exportIdentity(key)
            }}}
            if(unlocked && generation==token) {busy=false;result.onSuccess {encryptedExport=it;portableSave.launch("identity-backup.jwe")}.onFailure {portableNotice="Could not create backup."}}
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
