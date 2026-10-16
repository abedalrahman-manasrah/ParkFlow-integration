package ps.parkflow.crashdetection

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * JS entry point for the background crash detection service.
 * See src/utils/crashDetectionNative.ts for the typed wrapper.
 */
class CrashDetectionModule : Module() {
  private val context: Context
    get() = requireNotNull(appContext.reactContext) { "React context is not available" }

  override fun definition() = ModuleDefinition {
    Name("ParkFlowCrashDetection")

    /**
     * Saves the number, countdown and texts, then starts the service. Returns
     * false without starting when location access is missing, because Android
     * will not run a location foreground service without it.
     */
    Function("start") { options: Map<String, Any?> ->
      val ctx = context
      if (ctx.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
        return@Function false
      }
      CrashStore.saveConfig(ctx, options)
      val intent = CrashDetectionService.intent(ctx, CrashDetectionService.ACTION_START)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) ctx.startForegroundService(intent) else ctx.startService(intent)
      true
    }

    Function("stop") {
      val ctx = context
      CrashStore.setEnabled(ctx, false)
      if (CrashDetectionService.running) ctx.startService(CrashDetectionService.intent(ctx, CrashDetectionService.ACTION_STOP))
      true
    }

    Function("isRunning") { CrashDetectionService.running }

    /** Detections made while the app was closed, for upload; clears them. */
    Function("consumeEvents") { CrashStore.consumeEvents(context) }

    /** Development aid: runs the full alert, countdown and call flow without a crash. */
    Function("simulate") {
      val ctx = context
      if (CrashDetectionService.running) ctx.startService(CrashDetectionService.intent(ctx, CrashDetectionService.ACTION_SIMULATE))
      CrashDetectionService.running
    }
  }
}
