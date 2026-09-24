package app.actionlock

import android.annotation.SuppressLint
import android.content.ComponentName
import android.content.Intent
import android.content.pm.PackageManager
import android.provider.Settings
import android.net.Uri
import android.os.Bundle
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.lifecycle.lifecycleScope
import androidx.biometric.BiometricManager.Authenticators.BIOMETRIC_STRONG
import androidx.biometric.BiometricManager.Authenticators.DEVICE_CREDENTIAL
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity
import androidx.webkit.WebViewAssetLoader
import androidx.webkit.WebViewClientCompat
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.codescanner.GmsBarcodeScannerOptions
import com.google.mlkit.vision.codescanner.GmsBarcodeScanning
import org.json.JSONObject

/**
 * Imperative shell. The lock itself (severity, buffers, history) runs as
 * JavaScript in the WebView — the same TypeScript core the tests cover.
 * This class only provides what the page cannot: opening a UPI app, the
 * fingerprint prompt, the QR scanner, storage and incoming upi:// links.
 */
class MainActivity : FragmentActivity() {

    private lateinit var web: WebView
    private lateinit var journal: PrivateFile
    private lateinit var profile: PrivateFile
    private var fileCallback: ValueCallback<Array<Uri>>? = null
    private lateinit var answers: JournalFile
    private lateinit var readers: PhoneReaders
    private lateinit var guardTable: PrivateFile
    private lateinit var reasoning: JournalFile
    private lateinit var nano: OnDeviceModel

    private val access = registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) {
        callJs("OrbApp.onAccess")
    }

    // The page's "Load profile.json" button: WebView needs the app to open the file picker.
    private val pickFile = registerForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        fileCallback?.onReceiveValue(if (uri == null) null else arrayOf(uri))
        fileCallback = null
    }
    private var incomingLink: String? = null
    private var pendingUpiActionId: String? = null

    private val upiResult = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        val id = pendingUpiActionId ?: return@registerForActivityResult
        pendingUpiActionId = null
        callJs("ActionLockApp.onUpiResult", id, UpiResponse.from(result.data))
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        journal = PrivateFile(filesDir, "journal.json", "[]")
        profile = PrivateFile(filesDir, "profile.json", "")
        answers = JournalFile(filesDir, "answers.jsonl")
        readers = PhoneReaders(this)
        guardTable = PrivateFile(filesDir, "guard.json", "")
        reasoning = JournalFile(filesDir, "reasoning.jsonl")
        nano = OnDeviceModel(lifecycleScope)
        nano.refresh { callJs("window.OrbApp?.onModelStatus") }
        incomingLink = upiLinkOf(intent)

        val assets = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        web = WebView(this).apply {
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.allowFileAccess = false
            settings.allowContentAccess = false
            webViewClient = object : WebViewClientCompat() {
                override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? =
                    assets.shouldInterceptRequest(request.url)

                // Only between the app's own pages (Orb and the lock); never to the web.
                override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean =
                    request.url.host != "appassets.androidplatform.net"
            }
            webChromeClient = object : WebChromeClient() {
                override fun onShowFileChooser(
                    view: WebView,
                    callback: ValueCallback<Array<Uri>>,
                    params: FileChooserParams,
                ): Boolean {
                    fileCallback?.onReceiveValue(null)
                    fileCallback = callback
                    pickFile.launch(arrayOf("application/json", "text/plain", "*/*"))
                    return true
                }
            }
            addJavascriptInterface(Bridge(), "AndroidLock")
            addJavascriptInterface(OrbBridge(), "AndroidOrb")
        }
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)
        setContentView(web)
        web.loadUrl("https://appassets.androidplatform.net/assets/index.html")
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        upiLinkOf(intent)?.let { callJs("ActionLockApp.onIncoming", it) }
    }

    override fun onDestroy() {
        web.destroy()
        super.onDestroy()
    }

    private fun upiLinkOf(intent: Intent?): String? =
        intent?.data?.takeIf { it.scheme.equals("upi", ignoreCase = true) }?.toString()

    /** Calls a page function with JSON-encoded arguments, on the UI thread. */
    private fun callJs(fn: String, vararg args: Any?) {
        val encoded = args.joinToString(",") { arg ->
            when (arg) {
                null -> "null"
                is Boolean -> arg.toString()
                else -> JSONObject.quote(arg.toString())
            }
        }
        web.post { web.evaluateJavascript("$fn($encoded)", null) }
    }

    private fun launchUpi(actionId: String, link: String) {
        val pay = Intent(Intent.ACTION_VIEW, Uri.parse(link))
        val upiApps = packageManager.queryIntentActivities(pay, 0).filter { it.activityInfo.packageName != packageName }
        if (upiApps.isEmpty()) {
            Toast.makeText(this, R.string.no_upi_app, Toast.LENGTH_LONG).show()
            callJs("ActionLockApp.onUpiResult", actionId, null)
            return
        }
        // Never hand the payment back to ourselves.
        val chooser = Intent.createChooser(pay, getString(R.string.pay_with)).apply {
            putExtra(Intent.EXTRA_EXCLUDE_COMPONENTS, arrayOf(ComponentName(this@MainActivity, MainActivity::class.java)))
        }
        pendingUpiActionId = actionId
        upiResult.launch(chooser)
    }

    private fun authenticate(actionId: String, title: String) {
        val prompt = BiometricPrompt(
            this,
            ContextCompat.getMainExecutor(this),
            object : BiometricPrompt.AuthenticationCallback() {
                override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                    callJs("ActionLockApp.onBiometric", actionId, true, "")
                }

                override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                    callJs("ActionLockApp.onBiometric", actionId, false, errString.toString())
                }
            },
        )
        val info = BiometricPrompt.PromptInfo.Builder()
            .setTitle(title)
            .setSubtitle(getString(R.string.unlock_subtitle))
            .setAllowedAuthenticators(BIOMETRIC_STRONG or DEVICE_CREDENTIAL)
            .build()
        prompt.authenticate(info)
    }

    private fun scanQr() {
        val options = GmsBarcodeScannerOptions.Builder()
            .setBarcodeFormats(Barcode.FORMAT_QR_CODE)
            .build()
        GmsBarcodeScanning.getClient(this, options).startScan()
            .addOnSuccessListener { code -> callJs("ActionLockApp.onScan", code.rawValue ?: "", "Unreadable QR code.") }
            .addOnCanceledListener { callJs("ActionLockApp.onScan", "", "Scan cancelled.") }
            .addOnFailureListener { e -> callJs("ActionLockApp.onScan", "", e.message ?: "Scanner unavailable.") }
    }

    override fun onResume() {
        super.onResume()
        // Back from the usage-access or permission settings screen.
        if (::web.isInitialized) callJs("window.OrbApp?.onAccess")
    }

    private fun copy(text: String) {
        getSystemService(android.content.ClipboardManager::class.java)?.setPrimaryClip(android.content.ClipData.newPlainText("Orb request", text))
    }

    private fun granted(permission: String) = ContextCompat.checkSelfPermission(this, permission) == PackageManager.PERMISSION_GRANTED

    /** Exposed to the Orb page as `AndroidOrb`: the sensors and Orb's journal. */
    private inner class OrbBridge {
        @android.webkit.JavascriptInterface
        fun access(): String = JSONObject()
            .put("sms", granted(android.Manifest.permission.READ_SMS))
            .put("calls", granted(android.Manifest.permission.READ_CALL_LOG))
            .put("contacts", granted(android.Manifest.permission.READ_CONTACTS))
            .put("usage", readers.hasUsageAccess())
            .toString()

        @android.webkit.JavascriptInterface
        fun requestAccess() = runOnUiThread {
            access.launch(
                arrayOf(
                    android.Manifest.permission.READ_SMS,
                    android.Manifest.permission.READ_CALL_LOG,
                    android.Manifest.permission.READ_CONTACTS,
                ),
            )
        }

        @android.webkit.JavascriptInterface
        fun requestUsageAccess() = runOnUiThread {
            startActivity(Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS))
        }

        /** One source as text: sms, calls, contacts, apps, phone or usage. Empty if not allowed. */
        @android.webkit.JavascriptInterface
        fun read(source: String): String = try {
            when (source) {
                "sms" -> if (granted(android.Manifest.permission.READ_SMS)) readers.sms() else ""
                "calls" -> if (granted(android.Manifest.permission.READ_CALL_LOG)) readers.calls() else ""
                "contacts" -> if (granted(android.Manifest.permission.READ_CONTACTS)) readers.contacts() else ""
                "apps" -> readers.apps()
                "phone" -> readers.phone()
                "usage" -> readers.usage()
                else -> ""
            }
        } catch (e: Exception) {
            ""
        }

        @android.webkit.JavascriptInterface
        fun loadAnswers(): String = answers.read()

        @android.webkit.JavascriptInterface
        fun appendAnswer(json: String) = answers.append(json)

        /** The pay guard's table (src/orb/guard.ts), rebuilt whenever the model changes. */
        @android.webkit.JavascriptInterface
        fun saveGuard(json: String) = guardTable.write(json)

        @android.webkit.JavascriptInterface
        fun guardOn(): Boolean {
            val on = Settings.Secure.getString(contentResolver, Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES) ?: return false
            return on.split(':').any { it.startsWith("$packageName/") }
        }

        @android.webkit.JavascriptInterface
        fun openGuardSettings() = runOnUiThread { startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)) }

        /** What the guard did (one JSON event per line) and pay screens it couldn't read. */
        @android.webkit.JavascriptInterface
        fun guardLog(): String = JournalFile(filesDir, "guard.jsonl").read()

        // ── Reasoning: the on-device model, the cloud hand-off, the reasoning log ──

        @android.webkit.JavascriptInterface
        fun modelStatus(): String = nano.status

        @android.webkit.JavascriptInterface
        fun modelReason(): String = nano.reason

        @android.webkit.JavascriptInterface
        fun modelRecheck() = runOnUiThread { nano.refresh { callJs("window.OrbApp?.onModelStatus") } }

        /** AI apps installed on the phone that a request can be handed to (JSON: [{id, name}]). */
        @android.webkit.JavascriptInterface
        fun aiApps(): String {
            val known = listOf(
                "com.anthropic.claude" to "Claude",
                "com.google.android.apps.bard" to "Gemini",
                "com.openai.chatgpt" to "ChatGPT",
                "ai.perplexity.app.android" to "Perplexity",
            )
            val arr = org.json.JSONArray()
            for ((id, name) in known) {
                val installed = runCatching { packageManager.getPackageInfo(id, 0) }.isSuccess
                if (installed) arr.put(JSONObject().put("id", id).put("name", name))
            }
            return arr.toString()
        }

        /** Hands the request to one AI app; if it doesn't take shared text, copies it and opens the app. */
        @android.webkit.JavascriptInterface
        fun shareTo(app: String, text: String) = runOnUiThread {
            val send = Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, text).setPackage(app)
            val ok = runCatching { startActivity(send) }.isSuccess
            if (!ok) {
                copy(text)
                packageManager.getLaunchIntentForPackage(app)?.let { startActivity(it) }
                Toast.makeText(this@MainActivity, "Copied: paste it into the app", Toast.LENGTH_LONG).show()
            }
        }

        @android.webkit.JavascriptInterface
        fun copyText(text: String) = runOnUiThread {
            copy(text)
            Toast.makeText(this@MainActivity, "Copied", Toast.LENGTH_SHORT).show()
        }

        @android.webkit.JavascriptInterface
        fun modelDownload() = runOnUiThread { nano.download { callJs("window.OrbApp?.onModelStatus") } }

        /** Runs the on-device model; the reply comes back through OrbApp.onModelReply(id, reply, error). */
        @android.webkit.JavascriptInterface
        fun modelGenerate(id: String, prompt: String) = runOnUiThread {
            nano.generate(prompt) { reply, error -> callJs("OrbApp.onModelReply", id, reply, error) }
        }

        /** Cloud, per task with your yes: you pick the AI app that sends it. Orb itself stays offline. */
        @android.webkit.JavascriptInterface
        fun shareText(text: String) = runOnUiThread {
            val send = Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, text)
            startActivity(Intent.createChooser(send, "Ask an AI app"))
        }

        @android.webkit.JavascriptInterface
        fun clipboardText(): String {
            val cm = getSystemService(android.content.ClipboardManager::class.java)
            return cm?.primaryClip?.takeIf { it.itemCount > 0 }?.getItemAt(0)?.coerceToText(this@MainActivity)?.toString() ?: ""
        }

        @android.webkit.JavascriptInterface
        fun loadReasoning(): String = reasoning.read()

        @android.webkit.JavascriptInterface
        fun appendReasoning(json: String) = reasoning.append(json)

        /** The WhatsApp message guard's own switch (off unless you turn it on). */
        @android.webkit.JavascriptInterface
        fun messageGuardOn(): Boolean = java.io.File(filesDir, "message-guard-on").exists()

        @android.webkit.JavascriptInterface
        fun setMessageGuard(on: Boolean) {
            val f = java.io.File(filesDir, "message-guard-on")
            if (on) f.writeText("on") else f.delete()
        }

        /** People the guard learned from the UPI apps' own history screens. */
        @android.webkit.JavascriptInterface
        fun guardSeen(): String = java.io.File(filesDir, "guard-seen.json").let { if (it.exists()) it.readText() else "{}" }

        @android.webkit.JavascriptInterface
        fun clearGuardUnread() {
            java.io.File(filesDir, "guard-unread.txt").delete()
        }

        @android.webkit.JavascriptInterface
        fun guardUnread(): String = java.io.File(filesDir, "guard-unread.txt").let { if (it.exists()) it.readText().takeLast(20_000) else "" }

        /** The profile the lock judges payments against, rebuilt from the phone's own data. */
        @android.webkit.JavascriptInterface
        fun saveProfile(json: String) = profile.write(json)
    }

    /** Exposed to the page as `AndroidLock`. Called on a background thread. */
    private inner class Bridge {
        @android.webkit.JavascriptInterface
        fun loadJournal(): String = journal.read()

        @android.webkit.JavascriptInterface
        fun saveJournal(json: String) = journal.write(json)

        @android.webkit.JavascriptInterface
        fun launchUpi(actionId: String, link: String) = runOnUiThread { this@MainActivity.launchUpi(actionId, link) }

        @android.webkit.JavascriptInterface
        fun authenticate(actionId: String, title: String) = runOnUiThread { this@MainActivity.authenticate(actionId, title) }

        @android.webkit.JavascriptInterface
        fun scanQr() = runOnUiThread { this@MainActivity.scanQr() }

        @android.webkit.JavascriptInterface
        fun loadProfile(): String = profile.read()

        @android.webkit.JavascriptInterface
        fun saveProfile(json: String) = profile.write(json)

        @android.webkit.JavascriptInterface
        fun takeIncomingLink(): String = synchronized(this@MainActivity) {
            val link = incomingLink ?: ""
            incomingLink = null
            link
        }
    }
}
