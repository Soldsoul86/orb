package app.actionlock.guard

import android.accessibilityservice.AccessibilityService
import android.content.Intent
import android.graphics.PixelFormat
import android.graphics.Rect
import android.graphics.drawable.GradientDrawable
import android.os.Handler
import android.os.Looper
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import app.actionlock.JournalFile
import org.json.JSONObject
import java.io.File
import java.util.Calendar

/**
 * The pay guard. When PhonePe or Google Pay shows a pay screen, reads the
 * payee and amount, applies the guard table Orb built from your model, and,
 * if the payment needs a pause, covers the Pay button with the reason and a
 * countdown (and your fingerprint for large payments to someone new).
 *
 * Reads only the screens of the apps in PayScreen.apps; everything else is
 * ignored. Nothing is sent anywhere: the app has no internet permission.
 */
class PayGuardService : AccessibilityService() {

    private val main = Handler(Looper.getMainLooper())
    private lateinit var windows: WindowManager
    private lateinit var log: JournalFile
    private var overlay: View? = null
    private var overlayKey: String? = null
    private var table: GuardTable? = null
    private var tableStamp = 0L
    private var pending = false

    /** UPI ID → name, from screens that showed both (a PIN screen may show only the ID). */
    private val vpaNames = HashMap<String, String>()

    /** Payments you already let through (payee|amount → when), so the pause shows once. */
    private val released = HashMap<String, Long>()

    override fun onServiceConnected() {
        instance = this
        windows = getSystemService(WindowManager::class.java)
        log = JournalFile(filesDir, "guard.jsonl")
    }

    override fun onDestroy() {
        hide()
        if (instance === this) instance = null
        super.onDestroy()
    }

    override fun onInterrupt() = hide()

    override fun onAccessibilityEvent(event: AccessibilityEvent) {
        val pkg = event.packageName?.toString() ?: return
        if (pkg == packageName) return
        if (pkg !in PayScreen.apps) {
            if (event.eventType == AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) hide()
            return
        }
        // Screens change many times a second while you type: look at most every 250 ms.
        if (pending) return
        pending = true
        main.postDelayed({
            pending = false
            check(pkg)
        }, 250)
    }

    private fun loadTable(): GuardTable? {
        val f = File(filesDir, "guard.json")
        if (!f.exists()) return null
        if (f.lastModified() != tableStamp) {
            table = try {
                GuardTable.parse(f.readText())
            } catch (_: Exception) {
                null
            }
            tableStamp = f.lastModified()
        }
        return table
    }

    private fun check(pkg: String) {
        val root = rootInActiveWindow ?: return
        if (root.packageName?.toString() != pkg) return
        val nodes = ArrayList<ScreenNode>()
        val bounds = ArrayList<Rect>()
        collect(root, nodes, bounds, 0)
        val info = PayScreen.parse(nodes)
        if (info == null) {
            hide()
            if (PayScreen.looksLikePayment(nodes)) remember("no pay button found", pkg, PayScreenInfo(null, null, null, -1), nodes)
            return
        }
        val amount = info.amount
        if (amount == null) {
            hide()
            remember("unread", pkg, info, nodes)
            return
        }
        val t = loadTable() ?: return
        // A PIN screen may show only the UPI ID: use the name seen with that ID on the screen before.
        val vpa = info.vpa?.lowercase()?.takeIf { !it.startsWith("x") }
        if (info.name != null && vpa != null) vpaNames[vpa] = info.name
        val who = info.name ?: vpa?.let { vpaNames[it] } ?: vpa
        val key = "$who|$amount"
        val now = System.currentTimeMillis()
        released.entries.removeAll { now - it.value > 3 * 60_000 }
        if (key in released) {
            hide()
            return
        }
        if (who == null) remember("unread", pkg, info, nodes)
        val decision = GuardRules.decide(t, who, amount, Calendar.getInstance().get(Calendar.HOUR_OF_DAY))
        if (decision.mode == "pass") {
            hide()
            return
        }
        val cover = Rect(bounds[info.cover.first()]).also { r -> info.cover.forEach { r.union(bounds[it]) } }
        if (overlayKey == key) {
            move(cover)
            return
        }
        show(pkg, key, info.copy(name = who), decision, cover)
    }

    private fun collect(n: AccessibilityNodeInfo, nodes: MutableList<ScreenNode>, bounds: MutableList<Rect>, depth: Int) {
        if (depth > 40 || nodes.size > 600) return
        if (!n.isVisibleToUser) return
        val text = (n.text ?: n.contentDescription)?.toString()
        if (!text.isNullOrBlank()) {
            nodes += ScreenNode(text, n.isEditable, n.isClickable || n.parent?.isClickable == true)
            bounds += Rect().also { n.getBoundsInScreen(it) }
        }
        for (i in 0 until n.childCount) n.getChild(i)?.let { collect(it, nodes, bounds, depth + 1) }
    }

    // ── Overlay: a shield exactly over Pay, and a card above it with the reason ──

    private var shield: TextView? = null
    private var title: TextView? = null
    private var why: TextView? = null
    private var go: Button? = null
    private var event: JSONObject? = null
    private var decision: GuardDecision? = null
    private var left = 0
    private var lastRemembered = ""

    private fun dp(v: Int) = TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v.toFloat(), resources.displayMetrics).toInt()

    private fun windowParams(w: Int, h: Int, x: Int, y: Int) = WindowManager.LayoutParams(
        w,
        h,
        WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY,
        // Not focusable: the keyboard and the amount field keep working underneath.
        WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
        PixelFormat.TRANSLUCENT,
    ).apply {
        gravity = Gravity.TOP or Gravity.START
        this.x = x
        this.y = y
    }

    private fun shieldParams(pay: Rect) = windowParams(pay.width() + dp(8), pay.height() + dp(8), (pay.left - dp(4)).coerceAtLeast(0), (pay.top - dp(4)).coerceAtLeast(0))

    private fun cardParams(pay: Rect): WindowManager.LayoutParams {
        val h = dp(170)
        return windowParams(WindowManager.LayoutParams.MATCH_PARENT, h, 0, (pay.top - h - dp(8)).coerceAtLeast(0))
    }

    private fun move(pay: Rect) {
        shield?.let { windows.updateViewLayout(it, shieldParams(pay)) }
        overlay?.let { windows.updateViewLayout(it, cardParams(pay)) }
    }

    private val tick = object : Runnable {
        override fun run() {
            val b = go ?: return
            val d = decision ?: return
            if (left > 0) {
                b.isEnabled = false
                b.text = "Continue in ${left}s"
                shield?.text = "Wait ${left}s"
                left--
                main.postDelayed(this, 1000)
            } else {
                b.isEnabled = true
                b.text = if (d.mode == "confirm") "Fingerprint" else "Continue"
                shield?.text = if (d.mode == "confirm") "Fingerprint first" else "Tap Continue"
            }
        }
    }

    private fun show(pkg: String, key: String, info: PayScreenInfo, d: GuardDecision, pay: Rect) {
        val ev = JSONObject().put("app", PayScreen.apps[pkg]).put("name", info.name ?: JSONObject.NULL).put("amount", info.amount).put("mode", d.mode).put("seconds", d.seconds)
        event = ev
        decision = d
        overlayKey = key
        record("shown", ev)
        if (overlay == null) create(pay) else move(pay)
        // A new payee or amount starts the pause again.
        title?.text = "Orb · pause before paying ${GuardRules.rupees(info.amount!!)}"
        why?.text = d.reasons.joinToString("\n")
        left = d.seconds
        main.removeCallbacks(tick)
        main.post(tick)
    }

    private fun create(pay: Rect) {
        val dark = (resources.configuration.uiMode and android.content.res.Configuration.UI_MODE_NIGHT_MASK) == android.content.res.Configuration.UI_MODE_NIGHT_YES
        val fg = if (dark) 0xFFF1EEE8.toInt() else 0xFF1C1B19.toInt()
        val bg = if (dark) 0xFF1D1C1A.toInt() else 0xFFFFFFFF.toInt()
        val accent = if (dark) 0xFF8AA6F6.toInt() else 0xFF2F5BD3.toInt()

        title = TextView(this).apply {
            setTextColor(fg)
            textSize = 16f
            setTypeface(typeface, android.graphics.Typeface.BOLD)
        }
        why = TextView(this).apply {
            setTextColor(fg)
            textSize = 14f
            setPadding(0, dp(4), 0, dp(6))
            maxLines = 3
        }
        val cancel = Button(this).apply { text = "Don't pay" }
        go = Button(this).apply { setTextColor(accent) }
        val buttons = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            addView(cancel, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
            addView(go, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
        }
        val card = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(18), dp(12), dp(18), dp(8))
            background = GradientDrawable().apply {
                cornerRadius = dp(20).toFloat()
                setColor(bg)
                setStroke(dp(1), accent)
            }
            addView(title)
            addView(why)
            addView(buttons)
            isClickable = true
        }
        // Over the Pay button: taps land here, not on Pay, until you continue.
        val s = TextView(this).apply {
            gravity = Gravity.CENTER
            setTextColor(0xFFFFFFFF.toInt())
            textSize = 14f
            setTypeface(typeface, android.graphics.Typeface.BOLD)
            background = GradientDrawable().apply {
                cornerRadius = dp(28).toFloat()
                setColor(accent)
            }
            isClickable = true
        }

        cancel.setOnClickListener {
            event?.let { record("cancelled", it) }
            hide()
            performGlobalAction(GLOBAL_ACTION_BACK)
        }
        go?.setOnClickListener {
            val key = overlayKey ?: return@setOnClickListener
            val ev = event ?: return@setOnClickListener
            if (decision?.mode == "confirm") {
                val amount = ev.optDouble("amount")
                startActivity(
                    Intent(this, GuardConfirmActivity::class.java)
                        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                        .putExtra("key", key)
                        .putExtra("event", ev.toString())
                        .putExtra("title", "Pay ${GuardRules.rupees(amount)} to ${ev.optString("name").takeIf { it.isNotEmpty() && it != "null" } ?: "this payee"}?"),
                )
            } else {
                release(key, ev.toString(), "continued")
            }
        }
        windows.addView(card, cardParams(pay))
        windows.addView(s, shieldParams(pay))
        overlay = card
        shield = s
    }

    private fun hide() {
        main.removeCallbacks(tick)
        overlay?.let { runCatching { windows.removeView(it) } }
        shield?.let { runCatching { windows.removeView(it) } }
        overlay = null
        shield = null
        overlayKey = null
        title = null
        why = null
        go = null
    }

    /** You chose to go ahead: the pause is lifted for this payee and amount. */
    fun release(key: String, event: String, outcome: String) {
        released[key] = System.currentTimeMillis()
        record(outcome, JSONObject(event))
        main.post { if (overlayKey == key) hide() }
    }

    private fun record(outcome: String, event: JSONObject) {
        runCatching {
            log.append(JSONObject(event.toString()).put("kind", "guard").put("at", System.currentTimeMillis()).put("outcome", outcome).toString())
        }
    }

    /** Pay screens the reader couldn't fully read, so the reader can be improved (kept on the phone). */
    private fun remember(what: String, pkg: String, info: PayScreenInfo, nodes: List<ScreenNode>) {
        val signature = nodes.joinToString("|") { it.text.filter { c -> !c.isDigit() } }
        if (signature == lastRemembered) return
        lastRemembered = signature
        val f = File(filesDir, "guard-unread.txt")
        if (f.exists() && f.length() > 200_000) return
        runCatching {
            f.appendText(
                "── $what ${PayScreen.apps[pkg]} name=${info.name} amount=${info.amount}\n" +
                    nodes.take(60).joinToString("\n") { "  ${if (it.clickable) "[b]" else ""}${if (it.editable) "[e]" else ""}${it.text.take(80).replace('\n', ' ')}" } + "\n",
            )
        }
    }

    companion object {
        @Volatile
        var instance: PayGuardService? = null
    }
}
