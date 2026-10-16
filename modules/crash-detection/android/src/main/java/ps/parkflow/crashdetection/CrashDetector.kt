package ps.parkflow.crashdetection

import kotlin.math.acos
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sqrt

/**
 * Kotlin twin of src/utils/crashDetector.ts — keep the two in step.
 *
 * A crash is a hard, sustained impact while the car was moving, followed by the
 * phone ending up turned over (rollover) or the car coming to an abrupt stop.
 */
data class MotionSample(val t: Long, val x: Double, val y: Double, val z: Double) {
  val magnitude: Double get() = sqrt(x * x + y * y + z * z)
}

data class CrashDetection(
  val impactAt: Long,
  val peakG: Double,
  val rotationDeg: Double,
  val speedKmh: Double,
  val reason: String,
)

object CrashThresholds {
  const val ARM_SPEED_KMH = 20.0
  const val ARM_WINDOW_MS = 60_000L
  const val IMPACT_G = 4.0
  const val SUSTAINED_G = 2.5
  const val MIN_SUSTAINED_SAMPLES = 3
  const val SUSTAIN_WINDOW_MS = 200L
  const val ROLLOVER_DEG = 60.0
  const val STOPPED_KMH = 8.0
  const val SETTLE_MS = 3_000L
  const val GRAVITY_WINDOW_MS = 1_000L
  const val COOLDOWN_MS = 60_000L
  const val REJECTED_COOLDOWN_MS = 5_000L
  const val BUFFER_MS = 6_000L
}

class CrashDetector {
  private val samples = ArrayDeque<MotionSample>()
  private val speeds = ArrayDeque<Pair<Long, Double>>()
  private var pendingImpactAt: Long? = null
  private var pendingPeak = 0.0
  private var quietUntil = 0L

  fun pushSpeed(t: Long, kmh: Double) {
    speeds.addLast(t to kmh)
    while (speeds.isNotEmpty() && speeds.first().first < t - CrashThresholds.ARM_WINDOW_MS) speeds.removeFirst()
  }

  fun isArmed(now: Long): Boolean =
    maxSpeedBetween(now - CrashThresholds.ARM_WINDOW_MS, Long.MAX_VALUE) >= CrashThresholds.ARM_SPEED_KMH

  fun push(sample: MotionSample): CrashDetection? {
    samples.addLast(sample)
    while (samples.isNotEmpty() && samples.first().t < sample.t - CrashThresholds.BUFFER_MS) samples.removeFirst()

    val impactAt = pendingImpactAt
    if (impactAt != null) {
      if (sample.t - impactAt < CrashThresholds.SETTLE_MS) {
        pendingPeak = max(pendingPeak, sample.magnitude)
        return null
      }
      val result = evaluate(impactAt, pendingPeak)
      pendingImpactAt = null
      quietUntil = sample.t + if (result != null) CrashThresholds.COOLDOWN_MS else CrashThresholds.REJECTED_COOLDOWN_MS
      return result
    }

    if (sample.t < quietUntil || sample.magnitude < CrashThresholds.IMPACT_G) return null
    if (!isArmed(sample.t)) return null
    val sustained = samples.count {
      kotlin.math.abs(it.t - sample.t) <= CrashThresholds.SUSTAIN_WINDOW_MS && it.magnitude >= CrashThresholds.SUSTAINED_G
    }
    if (sustained < CrashThresholds.MIN_SUSTAINED_SAMPLES) return null
    pendingImpactAt = sample.t
    pendingPeak = sample.magnitude
    return null
  }

  private fun evaluate(impactAt: Long, peakG: Double): CrashDetection? {
    val before = averageDirection(samples.filter {
      it.t >= impactAt - CrashThresholds.GRAVITY_WINDOW_MS - 300 && it.t < impactAt - 300
    })
    val after = averageDirection(samples.filter {
      it.t > impactAt + CrashThresholds.SETTLE_MS - CrashThresholds.GRAVITY_WINDOW_MS && it.t <= impactAt + CrashThresholds.SETTLE_MS
    })
    val rotation = if (before != null && after != null) angleDeg(before, after) else 0.0
    val speed = maxSpeedBetween(impactAt - CrashThresholds.ARM_WINDOW_MS, impactAt)
    val latest = speeds.lastOrNull { it.first > impactAt }
    val stopped = latest != null && latest.second <= CrashThresholds.STOPPED_KMH

    return when {
      rotation >= CrashThresholds.ROLLOVER_DEG -> CrashDetection(impactAt, peakG, rotation, speed, "rollover")
      stopped -> CrashDetection(impactAt, peakG, rotation, speed, "sudden_stop")
      else -> null
    }
  }

  private fun maxSpeedBetween(from: Long, until: Long): Double =
    speeds.filter { it.first in from..until }.maxOfOrNull { it.second } ?: 0.0

  private fun averageDirection(list: List<MotionSample>): DoubleArray? {
    if (list.isEmpty()) return null
    var x = 0.0; var y = 0.0; var z = 0.0
    for (s in list) { x += s.x; y += s.y; z += s.z }
    val length = sqrt(x * x + y * y + z * z)
    return if (length > 0) doubleArrayOf(x / length, y / length, z / length) else null
  }

  private fun angleDeg(a: DoubleArray, b: DoubleArray): Double {
    val dot = max(-1.0, min(1.0, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]))
    return Math.toDegrees(acos(dot))
  }
}
