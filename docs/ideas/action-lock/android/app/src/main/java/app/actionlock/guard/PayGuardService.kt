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

    private var lastRefs: List<AccessibilityNodeInfo> = emptyList()
    private var lastNodes: List<ScreenNode> = emptyList()
    private var cancelUntil = 0L
    private var guardedPkg = ""

    /** When each app last showed a money request someone sent. */
    private val requestSeen = HashMap<String, Long>()

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
        val refs = ArrayList<AccessibilityNodeInfo>()
        collect(root, nodes, bounds, refs, 0)
        lastRefs = refs
        lastNodes = nodes
        val now0 = System.currentTimeMillis()
        if (PayScreen.isRequest(nodes)) requestSeen[pkg] = now0
        // Just after "Don't pay": confirm the app's "cancel this payment?" dialog if it shows one.
        if (now0 < cancelUntil) {
            val yes = PayScreen.cancelConfirm(nodes)
            if (yes >= 0) click(refs[yes])
        }
        val info = PayScreen.parse(nodes, pinOnly = pkg !in PayScreen.ownScreens)
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
        val audio = getSystemService(android.media.AudioManager::class.java)
        val onCall = audio?.mode == android.media.AudioManager.MODE_IN_CALL || audio?.mode == android.media.AudioManager.MODE_IN_COMMUNICATION
        val fromRequest = (requestSeen[pkg] ?: 0L) > now - 3 * 60_000
        val decision = GuardRules.decide(t, who, amount, Calendar.getInstance().get(Calendar.HOUR_OF_DAY), onCall, fromRequest)
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

    private fun collect(n: AccessibilityNodeInfo, nodes: MutableList<ScreenNode>, bounds: MutableList<Rect>, refs: MutableList<AccessibilityNodeInfo>, depth: Int) {
        if (depth > 40 || nodes.size > 600) return
        if (!n.isVisibleToUser) return
        val text = (n.text ?: n.contentDescription)?.toString()
        if (!text.isNullOrBlank()) {
            nodes += ScreenNode(text, n.isEditable, n.isClickable || n.parent?.isClickable == true)
            bounds += Rect().also { n.getBoundsInScreen(it) }
            refs += n
        }
        for (i in 0 until n.childCount) n.getChild(i)?.let { collect(it, nodes, bounds, refs, depth + 1) }
    }

    /** Clicks a node, or the nearest clickable parent (labels are often inside the button). */
    private fun click(n: AccessibilityNodeInfo): Boolean {
        var cur: AccessibilityNodeInfo? = n
        repeat(4) {
            val c = cur ?: return false
            if (c.isClickable) return c.performAction(AccessibilityNodeInfo.ACTION_CLICK)
            cur = c.parent
        }
        return false
    }

    /**
     * "Don't pay": leave the payment. On the PIN screen the back gesture is often
     * ignored, so the screen's own Close is tapped and a "cancel payment?"
     * dialog confirmed; if the PIN screen is somehow still there, the pause
     * comes back rather than leaving the keypad open.
     */
    private fun leave(pkg: String) {
        cancelUntil = System.currentTimeMillis() + 4_000
        val close = PayScreen.closeButton(lastNodes)
        if (!(close >= 0 && click(lastRefs[close]))) performGlobalAction(GLOBAL_ACTION_BACK)
        main.postDelayed({ check(pkg) }, 900)
        main.postDelayed({ check(pkg) }, 2_000)
    }

    // ── Overlay ──────────────────────────────────────────────────────────
    // On the UPI PIN screen: one sheet over the keypad (amount, payee, reasons,
    // countdown, Don't pay / Pay anyway). On an app's own pay screen: a card
    // above the Pay button and a small locked chip over it, so the amount field
    // and keyboard keep working.

    private var shield: TextView? = null
    private var go: TextView? = null
    private var bar: View? = null
    private var event: JSONObject? = null
    private var decision: GuardDecision? = null
    private var sheetMode = false
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
        val h = dp(196)
        return windowParams(WindowManager.LayoutParams.MATCH_PARENT, h, 0, (pay.top - h - dp(8)).coerceAtLeast(0))
    }

    /** Over the PIN keypad, full width, at least tall enough for the sheet's content. */
    private fun sheetParams(keys: Rect): WindowManager.LayoutParams {
        val screen = resources.displayMetrics.heightPixels
        val top = (keys.top - dp(12)).coerceAtLeast(0).coerceAtMost(screen - dp(340))
        return windowParams(WindowManager.LayoutParams.MATCH_PARENT, (keys.bottom + dp(12)).coerceAtMost(screen) - top, 0, top)
    }

    private fun move(r: Rect) {
        if (sheetMode) {
            overlay?.let { windows.updateViewLayout(it, sheetParams(r)) }
        } else {
            shield?.let { windows.updateViewLayout(it, shieldParams(r)) }
            overlay?.let { windows.updateViewLayout(it, cardParams(r)) }
        }
    }

    private val tick = object : Runnable {
        override fun run() {
            val b = go ?: return
            val d = decision ?: return
            if (left > 0) {
                b.isEnabled = false
                b.alpha = 0.55f
                b.text = if (d.mode == "confirm") "Fingerprint · ${left}s" else "Pay anyway · ${left}s"
                shield?.text = "🔒 ${left}s"
                left--
                main.postDelayed(this, 1000)
            } else {
                b.isEnabled = true
                b.alpha = 1f
                b.text = if (d.mode == "confirm") "Confirm with fingerprint" else "Pay anyway"
                shield?.text = "🔒 Tap Pay anyway"
            }
        }
    }

    private class Palette(val fg: Int, val muted: Int, val bg: Int, val accent: Int, val onAccent: Int, val track: Int, val warn: Int)

    private fun palette(): Palette {
        val dark = (resources.configuration.uiMode and android.content.res.Configuration.UI_MODE_NIGHT_MASK) == android.content.res.Configuration.UI_MODE_NIGHT_YES
        return if (dark) {
            Palette(0xFFF1EEE8.toInt(), 0xFFA59F94.toInt(), 0xFF1D1C1A.toInt(), 0xFF8AA6F6.toInt(), 0xFF101828.toInt(), 0xFF2E2C29.toInt(), 0xFFE5574C.toInt())
        } else {
            Palette(0xFF1C1B19.toInt(), 0xFF67635C.toInt(), 0xFFFFFFFF.toInt(), 0xFF2F5BD3.toInt(), 0xFFFFFFFF.toInt(), 0xFFE7E4DD.toInt(), 0xFFC8322B.toInt())
        }
    }

    private fun pill(text: String, fill: Int, fg: Int, stroke: Int? = null) = TextView(this).apply {
        this.text = text
        gravity = Gravity.CENTER
        setTextColor(fg)
        textSize = 15f
        setTypeface(typeface, android.graphics.Typeface.BOLD)
        setPadding(dp(12), dp(12), dp(12), dp(12))
        background = GradientDrawable().apply {
            cornerRadius = dp(26).toFloat()
            setColor(fill)
            if (stroke != null) setStroke(dp(1), stroke)
        }
        isClickable = true
    }

    private fun show(pkg: String, key: String, info: PayScreenInfo, d: GuardDecision, cover: Rect) {
        val ev = JSONObject().put("app", PayScreen.apps[pkg]).put("name", info.name ?: JSONObject.NULL).put("amount", info.amount).put("mode", d.mode).put("seconds", d.seconds)
        hide()
        event = ev
        decision = d
        overlayKey = key
        sheetMode = info.pin
        guardedPkg = pkg
        record("shown", ev)
        create(info, d, cover)
        left = d.seconds
        main.post(tick)
    }

    private fun create(info: PayScreenInfo, d: GuardDecision, cover: Rect) {
        val c = palette()
        val header = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            addView(View(this@PayGuardService).apply {
                background = GradientDrawable().apply {
                    shape = GradientDrawable.OVAL
                    setColor(c.accent)
                }
            }, LinearLayout.LayoutParams(dp(12), dp(12)).apply { rightMargin = dp(8) })
            addView(TextView(this@PayGuardService).apply {
                text = "Orb paused this payment"
                setTextColor(c.muted)
                textSize = 13f
            })
        }
        val amount = TextView(this).apply {
            text = GuardRules.rupees(info.amount ?: 0.0)
            setTextColor(c.fg)
            textSize = if (sheetMode) 34f else 22f
            setTypeface(typeface, android.graphics.Typeface.BOLD)
            setPadding(0, dp(6), 0, 0)
        }
        val to = TextView(this).apply {
            text = "to ${info.name ?: "this payee"}"
            setTextColor(c.fg)
            textSize = 16f
            maxLines = 1
            ellipsize = android.text.TextUtils.TruncateAt.END
        }
        val why = TextView(this).apply {
            text = d.reasons.joinToString("\n") { "• $it" }
            setTextColor(c.fg)
            textSize = 14f
            setLineSpacing(dp(2).toFloat(), 1f)
            setPadding(0, dp(10), 0, dp(12))
            maxLines = if (sheetMode) 6 else 3
            ellipsize = android.text.TextUtils.TruncateAt.END
        }
        // Countdown bar: shrinks to nothing as the pause ends.
        val track = android.widget.FrameLayout(this).apply {
            background = GradientDrawable().apply {
                cornerRadius = dp(2).toFloat()
                setColor(c.track)
            }
        }
        val fill = View(this).apply {
            background = GradientDrawable().apply {
                cornerRadius = dp(2).toFloat()
                setColor(c.accent)
            }
            pivotX = 0f
        }
        track.addView(fill, android.widget.FrameLayout.LayoutParams(android.widget.FrameLayout.LayoutParams.MATCH_PARENT, dp(4)))
        bar = fill

        val stop = pill("Don't pay", c.accent, c.onAccent)
        val pay = pill("Pay anyway", android.graphics.Color.TRANSPARENT, c.fg, c.muted)
        go = pay
        val buttons = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            setPadding(0, dp(12), 0, 0)
            addView(stop, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f).apply { rightMargin = dp(10) })
            addView(pay, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
        }
        val sheet = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(20), dp(16), dp(20), dp(16))
            background = GradientDrawable().apply {
                cornerRadius = dp(24).toFloat()
                setColor(c.bg)
                setStroke(dp(1), c.track)
            }
            addView(header)
            addView(amount)
            addView(to)
            addView(why)
            addView(track, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(4)))
            if (sheetMode) addView(View(this@PayGuardService), LinearLayout.LayoutParams(0, 0, 1f))
            addView(buttons)
            // Touches on the sheet never reach the keypad or Pay underneath.
            isClickable = true
        }
        if (sheetMode) sheet.gravity = Gravity.TOP

        stop.setOnClickListener {
            event?.let { record("cancelled", it) }
            hide()
            leave(guardedPkg)
        }
        pay.setOnClickListener {
            val key = overlayKey ?: return@setOnClickListener
            val ev = event ?: return@setOnClickListener
            if (decision?.mode == "confirm") {
                startActivity(
                    Intent(this, GuardConfirmActivity::class.java)
                        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                        .putExtra("key", key)
                        .putExtra("event", ev.toString())
                        .putExtra("title", "Pay ${GuardRules.rupees(ev.optDouble("amount"))} to ${ev.optString("name").takeIf { it.isNotEmpty() && it != "null" } ?: "this payee"}?"),
                )
            } else {
                release(key, ev.toString(), "continued")
            }
        }

        if (sheetMode) {
            windows.addView(sheet, sheetParams(cover))
        } else {
            windows.addView(sheet, cardParams(cover))
            val chip = TextView(this).apply {
                gravity = Gravity.CENTER
                setTextColor(c.onAccent)
                textSize = 14f
                setTypeface(typeface, android.graphics.Typeface.BOLD)
                background = GradientDrawable().apply {
                    cornerRadius = dp(28).toFloat()
                    setColor(c.accent)
                }
                isClickable = true
            }
            windows.addView(chip, shieldParams(cover))
            shield = chip
        }
        overlay = sheet

        // Slide in, a short buzz, and the countdown bar running down.
        sheet.alpha = 0f
        sheet.translationY = dp(24).toFloat()
        sheet.animate().alpha(1f).translationY(0f).setDuration(180).start()
        sheet.performHapticFeedback(if (android.os.Build.VERSION.SDK_INT >= 30) android.view.HapticFeedbackConstants.CONFIRM else android.view.HapticFeedbackConstants.LONG_PRESS)
        if (d.seconds > 0) fill.animate().scaleX(0f).setDuration(d.seconds * 1000L).setInterpolator(android.view.animation.LinearInterpolator()).start()
    }

    private fun hide() {
        main.removeCallbacks(tick)
        bar?.animate()?.cancel()
        overlay?.let { runCatching { windows.removeView(it) } }
        shield?.let { runCatching { windows.removeView(it) } }
        overlay = null
        shield = null
        overlayKey = null
        go = null
        bar = null
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
