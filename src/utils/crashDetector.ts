/**
 * Crash detection from the phone's motion sensors.
 *
 * A crash is a hard impact while the car was moving, followed by either the
 * phone ending up turned over (the car rolled or flipped) or the car coming to
 * an abrupt stop. Each signal alone is common — phones get dropped, roads have
 * potholes — so a detection needs the impact, recent driving speed and one of
 * the two after-effects together.
 *
 * Pure and platform-free so it can be tuned and tested without a device.
 */

export interface MotionSample {
  /** Milliseconds, monotonic. */
  t: number;
  /** Acceleration including gravity, in g. */
  x: number;
  y: number;
  z: number;
}

export interface CrashDetection {
  /** Epoch-ish timestamp of the impact, same clock as the samples. */
  impactAt: number;
  peakG: number;
  /** How far the phone's "down" turned between before and after the impact. */
  rotationDeg: number;
  /** Fastest speed seen in the minute before the impact. */
  speedKmh: number;
  reason: 'rollover' | 'sudden_stop';
}

export const CRASH_THRESHOLDS = {
  /** Only watch for crashes after the car has gone at least this fast recently. */
  armSpeedKmh: 20,
  armWindowMs: 60_000,
  /** Peak acceleration that counts as an impact. Hard braking stays under ~1.2 g. */
  impactG: 4,
  /** The impact must last a little: several samples above this level… */
  sustainedG: 2.5,
  minSustainedSamples: 3,
  /** …within this window around the peak. A drop onto the floor is one short spike. */
  sustainWindowMs: 200,
  /** Orientation change that reads as the car turning over. */
  rolloverDeg: 60,
  /** Below this speed after the impact counts as stopped. */
  stoppedKmh: 8,
  /** Time after the impact before deciding, so the car has settled. */
  settleMs: 3_000,
  /** Gravity is averaged over this span before the impact and at the end of settling. */
  gravityWindowMs: 1_000,
  /** Quiet period after a detection, and after an impact that turned out not to be one. */
  cooldownMs: 60_000,
  rejectedCooldownMs: 5_000,
  bufferMs: 6_000,
} as const;

type Thresholds = typeof CRASH_THRESHOLDS;

const magnitude = (s: { x: number; y: number; z: number }) => Math.sqrt(s.x * s.x + s.y * s.y + s.z * s.z);

function averageDirection(samples: MotionSample[]) {
  if (!samples.length) return null;
  const sum = samples.reduce((acc, s) => ({ x: acc.x + s.x, y: acc.y + s.y, z: acc.z + s.z }), { x: 0, y: 0, z: 0 });
  const length = magnitude(sum);
  return length > 0 ? { x: sum.x / length, y: sum.y / length, z: sum.z / length } : null;
}

function angleDeg(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) {
  const dot = Math.max(-1, Math.min(1, a.x * b.x + a.y * b.y + a.z * b.z));
  return (Math.acos(dot) * 180) / Math.PI;
}

export class CrashDetector {
  private samples: MotionSample[] = [];
  private speeds: { t: number; kmh: number }[] = [];
  private pending?: { impactAt: number; peakG: number };
  private quietUntil = 0;

  constructor(private readonly thresholds: Thresholds = CRASH_THRESHOLDS) {}

  /** GPS speed, km/h, on the same clock as the motion samples. */
  pushSpeed(t: number, kmh: number) {
    this.speeds.push({ t, kmh });
    this.speeds = this.speeds.filter((s) => s.t >= t - this.thresholds.armWindowMs);
  }

  /** True while the car has recently been driving, so a crash is plausible. */
  isArmed(now: number) {
    return this.maxSpeedSince(now - this.thresholds.armWindowMs) >= this.thresholds.armSpeedKmh;
  }

  /** Feeds one sample; returns a detection once an impact has settled into a crash. */
  push(sample: MotionSample): CrashDetection | null {
    const th = this.thresholds;
    this.samples.push(sample);
    while (this.samples.length && this.samples[0]!.t < sample.t - th.bufferMs) this.samples.shift();

    if (this.pending) {
      if (sample.t - this.pending.impactAt < th.settleMs) {
        this.pending.peakG = Math.max(this.pending.peakG, magnitude(sample));
        return null;
      }
      const result = this.evaluate(this.pending.impactAt, this.pending.peakG);
      this.pending = undefined;
      // A rejected impact (pothole, dropped phone) only pauses briefly, so a real
      // crash right after it is still caught.
      this.quietUntil = sample.t + (result ? th.cooldownMs : th.rejectedCooldownMs);
      return result;
    }

    if (sample.t < this.quietUntil || magnitude(sample) < th.impactG) return null;
    if (!this.isArmed(sample.t)) return null;
    const sustained = this.samples.filter(
      (s) => Math.abs(s.t - sample.t) <= th.sustainWindowMs && magnitude(s) >= th.sustainedG,
    ).length;
    if (sustained < th.minSustainedSamples) {
      // Could still grow into a sustained impact; look again on the next sample.
      return null;
    }
    this.pending = { impactAt: sample.t, peakG: magnitude(sample) };
    return null;
  }

  private evaluate(impactAt: number, peakG: number): CrashDetection | null {
    const th = this.thresholds;
    // Start the "before" window a little ahead of the impact so the crash itself is excluded.
    const before = averageDirection(
      this.samples.filter((s) => s.t >= impactAt - th.gravityWindowMs - 300 && s.t < impactAt - 300),
    );
    const after = averageDirection(
      this.samples.filter((s) => s.t > impactAt + th.settleMs - th.gravityWindowMs && s.t <= impactAt + th.settleMs),
    );
    const rotationDeg = before && after ? angleDeg(before, after) : 0;
    const speedKmh = this.maxSpeedSince(impactAt - th.armWindowMs, impactAt);
    const latest = this.speeds.filter((s) => s.t > impactAt).at(-1);
    const stopped = latest !== undefined && latest.kmh <= th.stoppedKmh;

    if (rotationDeg >= th.rolloverDeg) return { impactAt, peakG, rotationDeg, speedKmh, reason: 'rollover' };
    if (stopped) return { impactAt, peakG, rotationDeg, speedKmh, reason: 'sudden_stop' };
    return null;
  }

  private maxSpeedSince(from: number, until = Number.POSITIVE_INFINITY) {
    return this.speeds
      .filter((s) => s.t >= from && s.t <= until)
      .reduce((max, s) => Math.max(max, s.kmh), 0);
  }
}
