package ps.parkflow.crashdetection

import android.Manifest
import android.annotation.SuppressLint
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.SystemClock
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.telecom.TelecomManager

/**
 * Watches for crashes while the app is closed. Android only allows this as a
 * foreground service, which must show a notification; it is kept silent and
 * low-priority. GPS runs slowly until the car is moving, and the motion sensor
 * is only read while it is — so a phone that is not in a moving car costs little.
 */
class CrashDetectionService : Service(), SensorEventListener, LocationListener {
  companion object {
    const val ACTION_START = "ps.parkflow.crashdetection.START"
    const val ACTION_STOP = "ps.parkflow.crashdetection.STOP"
    const val ACTION_CANCEL_ALERT = "ps.parkflow.crashdetection.CANCEL_ALERT"
    const val ACTION_CALL_NOW = "ps.parkflow.crashdetection.CALL_NOW"
    const val ACTION_SIMULATE = "ps.parkflow.crashdetection.SIMULATE"

    private const val MONITOR_CHANNEL = "parkflow_crash_monitor"
    private const val ALERT_CHANNEL = "parkflow_crash_alert"
    private const val MONITOR_ID = 7101
    private const val ALERT_ID = 7102
    private const val ARM_CHECK_MS = 2_000L
    private const val IDLE_LOCATION_MS = 10_000L
    private const val DRIVING_LOCATION_MS = 1_000L
    private const val G = 9.80665

    @Volatile var running = false
      private set

    fun intent(context: Context, action: String) =
      Intent(context, CrashDetectionService::class.java).setAction(action)
  }

  private val handler = Handler(Looper.getMainLooper())
  private val detector = CrashDetector()
  private var sensorOn = false
  private var locationIntervalMs = 0L
  private var lastLocation: Location? = null
  private var alert: CrashDetection? = null
  private var alertLocation: Location? = null

  private val sensorManager by lazy { getSystemService(Context.SENSOR_SERVICE) as SensorManager }
  private val locationManager by lazy { getSystemService(Context.LOCATION_SERVICE) as LocationManager }
  private val notificationManager by lazy { getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager }

  private val armCheck = object : Runnable {
    override fun run() {
      val armed = detector.isArmed(SystemClock.elapsedRealtime())
      setSensor(armed)
      requestLocation(if (armed) DRIVING_LOCATION_MS else IDLE_LOCATION_MS)
      handler.postDelayed(this, ARM_CHECK_MS)
    }
  }

  private val countdownDone = Runnable { callNow() }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    createChannels()
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    when (intent?.action) {
      ACTION_STOP -> {
        stopMonitoring()
        stopSelf()
        return START_NOT_STICKY
      }
      ACTION_CANCEL_ALERT -> finishAlert("cancelled")
      ACTION_CALL_NOW -> callNow()
      ACTION_SIMULATE -> raise(CrashDetection(SystemClock.elapsedRealtime(), 0.0, 0.0, 0.0, "test"))
      // ACTION_START, or a restart by the system after it reclaimed the process.
      else -> if (!startMonitoring()) return START_NOT_STICKY
    }
    return START_STICKY
  }

  override fun onDestroy() {
    stopMonitoring()
    super.onDestroy()
  }

  // ---- Monitoring ---------------------------------------------------------

  private fun hasPermission(permission: String) =
    checkSelfPermission(permission) == PackageManager.PERMISSION_GRANTED

  private fun startMonitoring(): Boolean {
    if (!CrashStore.isEnabled(this) || !hasPermission(Manifest.permission.ACCESS_FINE_LOCATION)) {
      stopSelf()
      return false
    }
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        startForeground(MONITOR_ID, monitorNotification(), ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION)
      } else {
        startForeground(MONITOR_ID, monitorNotification())
      }
    } catch (error: Exception) {
      // Android refused a foreground start (for example from the background on 12+).
      stopSelf()
      return false
    }
    if (!running) {
      running = true
      requestLocation(IDLE_LOCATION_MS)
      handler.post(armCheck)
    }
    return true
  }

  private fun stopMonitoring() {
    running = false
    handler.removeCallbacks(armCheck)
    setSensor(false)
    locationManager.removeUpdates(this)
    locationIntervalMs = 0L
    if (alert != null) finishAlert("cancelled")
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) stopForeground(STOP_FOREGROUND_REMOVE) else @Suppress("DEPRECATION") stopForeground(true)
  }

  @SuppressLint("MissingPermission")
  private fun requestLocation(intervalMs: Long) {
    if (intervalMs == locationIntervalMs || !hasPermission(Manifest.permission.ACCESS_FINE_LOCATION)) return
    locationManager.removeUpdates(this)
    val provider = when {
      locationManager.isProviderEnabled(LocationManager.GPS_PROVIDER) -> LocationManager.GPS_PROVIDER
      locationManager.isProviderEnabled(LocationManager.NETWORK_PROVIDER) -> LocationManager.NETWORK_PROVIDER
      else -> return
    }
    locationManager.requestLocationUpdates(provider, intervalMs, 0f, this, Looper.getMainLooper())
    locationIntervalMs = intervalMs
  }

  private fun setSensor(on: Boolean) {
    if (on == sensorOn) return
    val accelerometer = sensorManager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER) ?: return
    if (on) sensorManager.registerListener(this, accelerometer, SensorManager.SENSOR_DELAY_GAME)
    else sensorManager.unregisterListener(this)
    sensorOn = on
  }

  override fun onLocationChanged(location: Location) {
    val previous = lastLocation
    lastLocation = location
    val kmh = when {
      location.hasSpeed() -> location.speed * 3.6
      previous != null && location.time > previous.time ->
        previous.distanceTo(location) / ((location.time - previous.time) / 1000.0) * 3.6
      else -> return
    }
    detector.pushSpeed(SystemClock.elapsedRealtime(), kmh)
  }

  // Older Android versions call these; the defaults are not available before API 30.
  override fun onProviderEnabled(provider: String) {}
  override fun onProviderDisabled(provider: String) {}
  @Deprecated("Deprecated in Android") override fun onStatusChanged(provider: String?, status: Int, extras: Bundle?) {}

  override fun onSensorChanged(event: SensorEvent) {
    val t = event.timestamp / 1_000_000 // nanoseconds since boot, same clock as elapsedRealtime
    val detection = detector.push(MotionSample(t, event.values[0] / G, event.values[1] / G, event.values[2] / G))
    if (detection != null) raise(detection)
  }

  override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}

  // ---- Alert --------------------------------------------------------------

  private fun raise(detection: CrashDetection) {
    if (alert != null) return
    alert = detection
    alertLocation = lastLocation
    val seconds = CrashStore.countdownSeconds(this)
    CrashAlertState.endsAtElapsed = SystemClock.elapsedRealtime() + seconds * 1000L
    vibrate()
    notificationManager.notify(ALERT_ID, alertNotification(seconds))
    // Shown directly when allowed; otherwise the full-screen notification brings it up.
    try {
      startActivity(Intent(this, CrashAlertActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    } catch (_: Exception) {
    }
    handler.postDelayed(countdownDone, seconds * 1000L)
  }

  private fun callNow() {
    if (alert == null) return
    val number = CrashStore.callNumber(this)
    finishAlert(if (number == null) "no_number" else placeCall(number))
  }

  /**
   * TelecomManager.placeCall is not an activity start, so unlike opening the
   * dialer it is allowed from the background — the driver does not need to tap.
   */
  @SuppressLint("MissingPermission")
  private fun placeCall(number: String): String {
    val uri = Uri.fromParts("tel", number, null)
    if (hasPermission(Manifest.permission.CALL_PHONE)) {
      try {
        (getSystemService(Context.TELECOM_SERVICE) as TelecomManager).placeCall(uri, Bundle())
        return "called"
      } catch (_: Exception) {
      }
    }
    // Without the permission all we can do is leave a notification that dials on tap.
    notificationManager.notify(ALERT_ID + 1, dialNotification(uri))
    return "call_failed"
  }

  private fun finishAlert(outcome: String) {
    val detection = alert ?: return
    handler.removeCallbacks(countdownDone)
    vibrator()?.cancel()
    notificationManager.cancel(ALERT_ID)
    val detectedAt = System.currentTimeMillis() - (SystemClock.elapsedRealtime() - detection.impactAt)
    CrashStore.recordEvent(this, detection, detectedAt, alertLocation?.latitude, alertLocation?.longitude, outcome)
    CrashAlertState.endsAtElapsed = null
    alert = null
    alertLocation = null
  }

  private fun vibrator(): Vibrator? =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) (getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager)?.defaultVibrator
    else @Suppress("DEPRECATION") (getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator)

  private fun vibrate() {
    val pattern = longArrayOf(0, 600, 400)
    val vibrator = vibrator() ?: return
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) vibrator.vibrate(VibrationEffect.createWaveform(pattern, 0))
    else @Suppress("DEPRECATION") vibrator.vibrate(pattern, 0)
  }

  // ---- Notifications ------------------------------------------------------

  private fun createChannels() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    notificationManager.createNotificationChannel(
      NotificationChannel(MONITOR_CHANNEL, CrashStore.text(this, "monitorChannel", "Crash detection"), NotificationManager.IMPORTANCE_MIN).apply {
        setShowBadge(false)
        setSound(null, null)
        enableVibration(false)
      },
    )
    notificationManager.createNotificationChannel(
      NotificationChannel(ALERT_CHANNEL, CrashStore.text(this, "alertChannel", "Crash alerts"), NotificationManager.IMPORTANCE_HIGH).apply {
        lockscreenVisibility = Notification.VISIBILITY_PUBLIC
      },
    )
  }

  private fun builder(channel: String): Notification.Builder =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) Notification.Builder(this, channel)
    else @Suppress("DEPRECATION") Notification.Builder(this)

  private fun openAppIntent(): PendingIntent? {
    val launch = packageManager.getLaunchIntentForPackage(packageName) ?: return null
    return PendingIntent.getActivity(this, 0, launch, PendingIntent.FLAG_IMMUTABLE)
  }

  private fun serviceAction(action: String, requestCode: Int): PendingIntent =
    PendingIntent.getService(this, requestCode, intent(this, action), PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)

  private fun monitorNotification(): Notification =
    builder(MONITOR_CHANNEL)
      .setSmallIcon(android.R.drawable.ic_menu_mylocation)
      .setContentTitle(CrashStore.text(this, "monitorTitle", "Crash detection is on"))
      .setContentText(CrashStore.text(this, "monitorBody", "ParkFlow will call for help if it detects a crash."))
      .setContentIntent(openAppIntent())
      .setOngoing(true)
      .setShowWhen(false)
      .apply { if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) @Suppress("DEPRECATION") setPriority(Notification.PRIORITY_MIN) }
      .build()

  private fun alertNotification(seconds: Int): Notification {
    val activity = PendingIntent.getActivity(
      this,
      1,
      Intent(this, CrashAlertActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
      PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )
    return builder(ALERT_CHANNEL)
      .setSmallIcon(android.R.drawable.stat_sys_warning)
      .setContentTitle(CrashStore.text(this, "title", "Possible crash detected"))
      .setContentText(CrashStore.text(this, "body", "Are you okay? If you do not respond, we will call for help."))
      .setCategory(Notification.CATEGORY_CALL)
      .setFullScreenIntent(activity, true)
      .setContentIntent(activity)
      .setOngoing(true)
      .setAutoCancel(false)
      .setWhen(System.currentTimeMillis() + seconds * 1000L)
      .setUsesChronometer(true)
      .apply {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) setChronometerCountDown(true)
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) @Suppress("DEPRECATION") setPriority(Notification.PRIORITY_MAX)
      }
      .addAction(Notification.Action.Builder(null, CrashStore.text(this, "imOk", "I'm okay — cancel"), serviceAction(ACTION_CANCEL_ALERT, 2)).build())
      .addAction(Notification.Action.Builder(null, CrashStore.text(this, "callNow", "Call now"), serviceAction(ACTION_CALL_NOW, 3)).build())
      .build()
  }

  private fun dialNotification(uri: Uri): Notification {
    val dial = PendingIntent.getActivity(this, 4, Intent(Intent.ACTION_DIAL, uri).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK), PendingIntent.FLAG_IMMUTABLE)
    return builder(ALERT_CHANNEL)
      .setSmallIcon(android.R.drawable.stat_sys_warning)
      .setContentTitle(CrashStore.text(this, "callNow", "Call now"))
      .setContentText(uri.schemeSpecificPart)
      .setContentIntent(dial)
      .setAutoCancel(true)
      .build()
  }
}
