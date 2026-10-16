import type { ParkingZone, ReportedAvailability, ZoneReport } from '@/types';
import { createId } from '@/utils/id';
import type { MockDatabase } from './db';

/**
 * Driver-reported zone availability. Recent reports are weighted by freshness
 * (the same decay Wusool uses for road reports, on a shorter clock because a
 * parking space turns over faster than a checkpoint) and overlaid on the zone.
 */

const WINDOW_MS = 2 * 60 * 60_000;
const HALF_LIFE_MIN = 30;

/** Reports from "other drivers" so the demo opens with live-looking crowd data. */
const SEED: { zoneId: string; availability: ReportedAvailability; minutesAgo: number }[] = [
  { zoneId: 'zone_manara', availability: 'full', minutesAgo: 8 },
  { zoneId: 'zone_manara', availability: 'full', minutesAgo: 15 },
  { zoneId: 'zone_hospital', availability: 'full', minutesAgo: 12 },
  { zoneId: 'zone_rukab', availability: 'available', minutesAgo: 22 },
  { zoneId: 'zone_irsal', availability: 'limited', minutesAgo: 31 },
];

const ageMinutes = (iso: string, now: number) => (now - new Date(iso).getTime()) / 60_000;

export function needsZoneSeed(db: MockDatabase): boolean {
  const now = Date.now();
  return !db.zoneReports.some((r) => now - new Date(r.reportedAt).getTime() < WINDOW_MS);
}

export function seedZoneReports(db: MockDatabase): void {
  const now = Date.now();
  for (const seed of SEED) {
    db.zoneReports.push({
      id: createId('zrp'),
      zoneId: seed.zoneId,
      availability: seed.availability,
      reportedAt: new Date(now - seed.minutesAgo * 60_000).toISOString(),
    });
  }
}

export function withCrowd(db: MockDatabase, zone: ParkingZone): ParkingZone {
  const now = Date.now();
  const recent: ZoneReport[] = db.zoneReports.filter(
    (r) => r.zoneId === zone.id && now - new Date(r.reportedAt).getTime() < WINDOW_MS,
  );
  if (!recent.length) return zone;

  const score: Record<ReportedAvailability, number> = { available: 0, limited: 0, full: 0 };
  for (const report of recent) {
    score[report.availability] += Math.exp(-ageMinutes(report.reportedAt, now) / HALF_LIFE_MIN);
  }
  const levels = Object.keys(score) as ReportedAvailability[];
  const availability = levels.sort((a, b) => score[b] - score[a])[0]!;
  const newest = Math.min(...recent.map((r) => ageMinutes(r.reportedAt, now)));

  return {
    ...zone,
    availability,
    crowd: {
      availability,
      baseAvailability: zone.availability,
      reportCount: recent.length,
      minutesSinceReport: Math.max(0, Math.round(newest)),
    },
  };
}
