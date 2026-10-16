package ps.parkflow.crashdetection

import android.content.Context
import android.content.SharedPreferences
import org.json.JSONArray
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

/**
 * What the service needs to keep working after the app is closed: the number to
 * call, the countdown, the texts in the driver's language, and the detections
 * that still have to be reported to the backend next time the app opens.
 */
object CrashStore {
  private const val PREFS = "parkflow_crash_detection"
  private const val EVENTS = "pending_events"
  private const val MAX_EVENTS = 50

  private fun prefs(context: Context): SharedPreferences =
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  fun saveConfig(context: Context, options: Map<String, Any?>) {
    val editor = prefs(context).edit().putBoolean("enabled", true)
    for ((key, value) in options) {
      when (value) {
        is String -> editor.putString(key, value)
        is Number -> editor.putInt(key, value.toInt())
        is Boolean -> editor.putBoolean(key, value)
        null -> editor.remove(key)
      }
    }
    editor.apply()
  }

  fun setEnabled(context: Context, enabled: Boolean) = prefs(context).edit().putBoolean("enabled", enabled).apply()
  fun isEnabled(context: Context) = prefs(context).getBoolean("enabled", false)

  fun callNumber(context: Context): String? = prefs(context).getString("callNumber", null)?.takeIf { it.isNotBlank() }
  fun countdownSeconds(context: Context): Int = prefs(context).getInt("countdownSeconds", 15).coerceIn(5, 60)
  fun isRtl(context: Context): Boolean = prefs(context).getBoolean("rtl", false)

  /** A text passed in from the app, already in the driver's language. */
  fun text(context: Context, key: String, fallback: String): String =
    prefs(context).getString("text.$key", null) ?: fallback

  @Synchronized
  fun recordEvent(context: Context, detection: CrashDetection, detectedAtMs: Long, latitude: Double?, longitude: Double?, outcome: String) {
    val events = JSONArray(prefs(context).getString(EVENTS, "[]"))
    val event = JSONObject()
      .put("detectedAt", isoUtc(detectedAtMs))
      .put("peakG", detection.peakG)
      .put("rotationDeg", detection.rotationDeg)
      .put("speedKmh", detection.speedKmh)
      .put("outcome", outcome)
    if (latitude != null && longitude != null) event.put("latitude", latitude).put("longitude", longitude)
    events.put(event)
    // Keep the newest events if the app has not been opened for a long time.
    val trimmed = JSONArray()
    for (i in maxOf(0, events.length() - MAX_EVENTS) until events.length()) trimmed.put(events.get(i))
    prefs(context).edit().putString(EVENTS, trimmed.toString()).apply()
  }

  /** Hands the stored events to the app for upload and clears them. */
  @Synchronized
  fun consumeEvents(context: Context): List<Map<String, Any?>> {
    val events = JSONArray(prefs(context).getString(EVENTS, "[]"))
    prefs(context).edit().putString(EVENTS, "[]").apply()
    return (0 until events.length()).map { index ->
      val event = events.getJSONObject(index)
      event.keys().asSequence().associateWith { key -> event.get(key) }
    }
  }

  private fun isoUtc(ms: Long): String =
    SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US)
      .apply { timeZone = TimeZone.getTimeZone("UTC") }
      .format(Date(ms))
}

/** The running countdown, shared by the service (which owns it) and the alert screen. */
object CrashAlertState {
  /** SystemClock.elapsedRealtime() when the call will be placed; null when no alert is up. */
  @Volatile var endsAtElapsed: Long? = null
}
