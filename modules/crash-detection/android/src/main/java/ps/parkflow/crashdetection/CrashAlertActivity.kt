package ps.parkflow.crashdetection

import android.app.Activity
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import kotlin.math.ceil
import kotlin.math.max

/**
 * The countdown screen shown after a crash, over the lock screen if needed.
 * The service owns the timer; this screen only shows it and sends the driver's
 * answer back. Built in code so the module needs no layout resources.
 */
class CrashAlertActivity : Activity() {
  private val handler = Handler(Looper.getMainLooper())
  private lateinit var countdown: TextView
  private lateinit var caption: TextView

  private val tick = object : Runnable {
    override fun run() {
      val endsAt = CrashAlertState.endsAtElapsed
      if (endsAt == null) {
        finish()
        return
      }
      val seconds = max(0, ceil((endsAt - SystemClock.elapsedRealtime()) / 1000.0).toInt())
      countdown.text = seconds.toString()
      caption.text = CrashStore.text(this@CrashAlertActivity, "callingIn", "Calling for help in {seconds} seconds")
        .replace("{seconds}", seconds.toString())
      handler.postDelayed(this, 250)
    }
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
      setShowWhenLocked(true)
      setTurnScreenOn(true)
    } else {
      @Suppress("DEPRECATION")
      window.addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON)
    }
    window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
    setContentView(buildLayout())
  }

  override fun onResume() {
    super.onResume()
    handler.post(tick)
  }

  override fun onPause() {
    handler.removeCallbacks(tick)
    super.onPause()
  }

  private fun dp(value: Int) =
    TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, value.toFloat(), resources.displayMetrics).toInt()

  private fun text(size: Float, bold: Boolean = false) = TextView(this).apply {
    setTextColor(Color.WHITE)
    setTextSize(TypedValue.COMPLEX_UNIT_SP, size)
    gravity = Gravity.CENTER
    if (bold) typeface = Typeface.DEFAULT_BOLD
  }

  private fun button(label: String, filled: Boolean, onClick: () -> Unit) = Button(this).apply {
    text = label
    isAllCaps = false
    setTextSize(TypedValue.COMPLEX_UNIT_SP, 17f)
    setTextColor(if (filled) Color.parseColor("#B3261E") else Color.WHITE)
    background = GradientDrawable().apply {
      cornerRadius = dp(16).toFloat()
      if (filled) setColor(Color.WHITE) else setStroke(dp(2), Color.WHITE)
    }
    minHeight = dp(56)
    setOnClickListener { onClick() }
  }

  private fun send(action: String) {
    startService(CrashDetectionService.intent(this, action))
    finish()
  }

  private fun buildLayout(): View {
    val root = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      setBackgroundColor(Color.parseColor("#B3261E"))
      setPadding(dp(24), dp(64), dp(24), dp(32))
      layoutDirection = if (CrashStore.isRtl(this@CrashAlertActivity)) View.LAYOUT_DIRECTION_RTL else View.LAYOUT_DIRECTION_LTR
    }
    val fill = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT)

    root.addView(text(26f, bold = true).apply { text = CrashStore.text(this@CrashAlertActivity, "title", "Possible crash detected") }, fill)
    root.addView(
      text(17f).apply {
        text = CrashStore.text(this@CrashAlertActivity, "body", "Are you okay? If you do not respond, we will call for help.")
        setPadding(0, dp(12), 0, 0)
      },
      fill,
    )
    root.addView(View(this), LinearLayout.LayoutParams(0, 0, 1f))
    countdown = text(96f, bold = true)
    root.addView(countdown, fill)
    caption = text(16f)
    root.addView(caption, fill)
    root.addView(View(this), LinearLayout.LayoutParams(0, 0, 1f))
    root.addView(
      button(CrashStore.text(this, "imOk", "I'm okay — cancel"), filled = true) { send(CrashDetectionService.ACTION_CANCEL_ALERT) },
      fill,
    )
    root.addView(View(this), LinearLayout.LayoutParams(0, dp(12)))
    root.addView(
      button(CrashStore.text(this, "callNow", "Call now"), filled = false) { send(CrashDetectionService.ACTION_CALL_NOW) },
      fill,
    )
    return root
  }
}
