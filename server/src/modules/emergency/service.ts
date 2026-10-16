import type { CrashEventOutcome } from '@prisma/client';
import { db } from '../../database/client';
import { env } from '../../config/env';

/**
 * Emergency calling stays off until EMERGENCY_CALL_NUMBER is set, so the phone
 * keeps detecting nothing and dialing nobody until the deployment opts in.
 */
export function config() {
  const callNumber = env.EMERGENCY_CALL_NUMBER?.trim() || null;
  return {
    enabled: callNumber !== null,
    callNumber,
    countdownSeconds: env.EMERGENCY_COUNTDOWN_SECONDS,
  };
}

export interface CrashEventInput {
  detectedAt: string;
  latitude?: number;
  longitude?: number;
  speedKmh?: number;
  peakG: number;
  rotationDeg?: number;
  outcome: CrashEventOutcome;
}

/** Keeps a record of every detection, including the ones the driver cancelled. */
export async function recordCrash(userId: string, input: CrashEventInput) {
  const { callNumber } = config();
  return db.crashEvent.create({
    data: {
      userId,
      ...input,
      detectedAt: new Date(input.detectedAt),
      calledNumber: input.outcome === 'called' || input.outcome === 'call_failed' ? callNumber : null,
    },
  });
}

export async function recentCrashes(userId: string) {
  return db.crashEvent.findMany({ where: { userId }, orderBy: { detectedAt: 'desc' }, take: 20 });
}
