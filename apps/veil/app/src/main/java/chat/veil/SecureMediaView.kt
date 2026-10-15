package chat.veil

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.os.SystemClock
import android.view.Gravity
import android.view.MotionEvent
import android.view.SurfaceView
import android.view.View
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.TextView
import androidx.media3.common.MediaItem
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.ByteArrayDataSource
import androidx.media3.datasource.DataSource
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.ProgressiveMediaSource
import androidx.media3.ui.PlayerView
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import kotlin.math.sin

/** Concealment happens synchronously in Android input/lifecycle callbacks, before Compose recomposition. */
@androidx.annotation.OptIn(UnstableApi::class)
class SecureMediaView(context: Context, private val message: ChatMessage, private val bytes: ByteArray,
    private val expired: () -> Unit) : FrameLayout(context) {
    private var player: ExoPlayer? = null
    private var bitmap: Bitmap? = null
    private val media: View
    private val watermark = Watermark(context, message.watermark, message.id.take(4))
    private val cover = TextView(context).apply {
        text = "◉\n\nPress & hold to see\nRelease to conceal"
        textSize = 18f; gravity = Gravity.CENTER; setTextColor(Color.rgb(181, 244, 207))
        setBackgroundColor(Color.rgb(16, 25, 29))
    }
    private val gate = RevealGate()
    private var disposed = false
    private val wallDeadline = minOf(message.expires, if (message.deadline > 0) message.deadline else Long.MAX_VALUE)
    private val monotonicDeadline = SystemClock.elapsedRealtime() + (wallDeadline-now()).coerceAtLeast(0)
    private val tick = object : Runnable {
        override fun run() {
            if (disposed) return
            if (isExpired()) { conceal(); expired(); return }
            postDelayed(this, 16)
        }
    }
    init {
        setBackgroundColor(Color.BLACK)
        isClickable = true
        filterTouchesWhenObscured = true
        importantForAccessibility = IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS
        if (message.kind == "video") {
            val p = ExoPlayer.Builder(context).build(); player = p
            val factory = DataSource.Factory { ByteArrayDataSource(bytes) }
            p.setMediaSource(ProgressiveMediaSource.Factory(factory).createMediaSource(MediaItem.fromUri("memory://veil/${message.id}")))
            p.prepare()
            media = PlayerView(context).apply {
                useController = false; player = p; setShowBuffering(PlayerView.SHOW_BUFFERING_NEVER)
                (videoSurfaceView as? SurfaceView)?.setSecure(true)
            }
        } else {
            val options = BitmapFactory.Options().apply { inJustDecodeBounds = true }
            BitmapFactory.decodeByteArray(bytes, 0, bytes.size, options)
            require(options.outWidth in 1..12000 && options.outHeight in 1..12000 && options.outWidth.toLong()*options.outHeight <= 24_000_000)
            var sample = 1
            while (options.outWidth/sample > 2048 || options.outHeight/sample > 2048) sample *= 2
            options.inJustDecodeBounds = false; options.inSampleSize = sample
            bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.size, options) ?: error("Invalid photo")
            media = ImageView(context).apply { scaleType = ImageView.ScaleType.FIT_CENTER; setImageBitmap(bitmap) }
        }
        addView(media, LayoutParams(-1, -1)); addView(watermark, LayoutParams(-1, -1)); addView(cover, LayoutParams(-1, -1))
        conceal()
        if (message.mode == Mode.NORMAL) post { reveal() }
        post(tick)
    }
    private fun isExpired() = now() >= wallDeadline || SystemClock.elapsedRealtime() >= monotonicDeadline
    private fun reveal() {
        if (disposed || isExpired() || !hasWindowFocus()) return
        gate.foreground(true, SystemClock.elapsedRealtime()); gate.press(SystemClock.elapsedRealtime())
        if (!gate.visible(message.mode, now(), wallDeadline, message.viewMs, SystemClock.elapsedRealtime())) return
        media.visibility = VISIBLE; watermark.visibility = VISIBLE; cover.visibility = GONE
        player?.play()
    }
    fun conceal() {
        gate.release(SystemClock.elapsedRealtime()); player?.pause(); media.visibility = INVISIBLE; watermark.visibility = INVISIBLE; cover.visibility = VISIBLE
    }
    override fun onInterceptTouchEvent(ev: MotionEvent) = true
    override fun onTouchEvent(event: MotionEvent): Boolean {
        if ((event.flags and (MotionEvent.FLAG_WINDOW_IS_OBSCURED or MotionEvent.FLAG_WINDOW_IS_PARTIALLY_OBSCURED)) != 0) {
            conceal(); return true
        }
        if (message.mode == Mode.NORMAL) return true
        when (event.actionMasked) {
            MotionEvent.ACTION_DOWN -> if (event.pointerCount == 1) reveal()
            MotionEvent.ACTION_MOVE -> if (event.x !in 0f..width.toFloat() || event.y !in 0f..height.toFloat() || event.pointerCount != 1) conceal()
            MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL, MotionEvent.ACTION_POINTER_DOWN, MotionEvent.ACTION_POINTER_UP -> conceal()
        }
        return true
    }
    override fun onWindowFocusChanged(hasWindowFocus: Boolean) { super.onWindowFocusChanged(hasWindowFocus); gate.foreground(hasWindowFocus, SystemClock.elapsedRealtime()); if (!hasWindowFocus) conceal() }
    override fun onDetachedFromWindow() { dispose(); super.onDetachedFromWindow() }
    fun dispose() {
        if (disposed) return
        conceal(); disposed = true; removeCallbacks(tick)
        player?.release(); player = null
        (media as? ImageView)?.setImageDrawable(null)
        bitmap?.recycle(); bitmap = null
        bytes.fill(0)
    }
}

private class Watermark(context: Context, private val recipient: String, private val marker: String) : View(context) {
    private val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.WHITE; alpha = 105; textSize = 12 * resources.displayMetrics.scaledDensity
        setShadowLayer(2f, 0f, 1f, Color.BLACK)
    }
    private val clock = SimpleDateFormat("HH:mm:ss", Locale.US).apply { timeZone = TimeZone.getTimeZone("UTC") }
    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        val t = SystemClock.elapsedRealtime() / 1000.0
        val label = "$recipient · $marker · ${clock.format(Date())}"
        val dx = (sin(t/11)*18*resources.displayMetrics.density).toFloat()
        val dy = (sin(t/17)*24*resources.displayMetrics.density).toFloat()
        for (row in -1..5) for (col in -1..2) {
            val x = col * (width/2f).coerceAtLeast(180f) + dx
            val y = row * (height/5f).coerceAtLeast(90f) + dy
            canvas.save(); canvas.rotate(-18f, x, y); canvas.drawText(label, x, y, paint); canvas.restore()
        }
        postInvalidateDelayed(100)
    }
}
