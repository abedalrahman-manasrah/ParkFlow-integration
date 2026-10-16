import type { PointsEntry, PointsReason } from '@/types';
import { createId } from '@/utils/id';
import { nowIso } from '@/utils/time';
import type { MockDatabase } from './db';

/**
 * Report points, following Wusool's rule: points are always created pending and
 * reality promotes them, never the submission. A report that nobody contradicts
 * within the window verifies; one that a later, different report overturns is
 * revoked.
 */

const REPORT_POINTS = 5;
/** One reward per place per half hour — repeat taps earn nothing. */
const COOLDOWN_MS = 30 * 60_000;
const VERIFY_AFTER_MS = 15 * 60_000;

export function awardReportPoints(
  db: MockDatabase,
  input: { userId: string; reason: PointsReason; placeId: string; refId: string },
): PointsEntry | undefined {
  const now = Date.now();
  const onCooldown = db.pointsLedger.some(
    (entry) =>
      entry.userId === input.userId &&
      entry.placeId === input.placeId &&
      now - new Date(entry.createdAt).getTime() < COOLDOWN_MS,
  );
  if (onCooldown) return undefined;

  const entry: PointsEntry = {
    id: createId('pts'),
    userId: input.userId,
    points: REPORT_POINTS,
    reason: input.reason,
    state: 'pending',
    placeId: input.placeId,
    refId: input.refId,
    createdAt: nowIso(),
  };
  db.pointsLedger.push(entry);
  return entry;
}

const at = (iso: string) => new Date(iso).getTime();

/** A later report on the same place, from someone else, that says something different. */
function contradicted(db: MockDatabase, entry: PointsEntry): boolean {
  const within = (laterIso: string, earlierIso: string) =>
    at(laterIso) > at(earlierIso) && at(laterIso) - at(earlierIso) <= VERIFY_AFTER_MS;

  const road = db.roadEvents.find((event) => event.id === entry.refId);
  if (road) {
    return db.roadEvents.some(
      (event) =>
        event.checkpointId === road.checkpointId &&
        event.userId !== entry.userId &&
        event.status !== road.status &&
        within(event.reportedAt, road.reportedAt),
    );
  }

  const zone = db.zoneReports.find((report) => report.id === entry.refId);
  if (zone) {
    return db.zoneReports.some(
      (report) =>
        report.zoneId === zone.zoneId &&
        report.userId !== entry.userId &&
        report.availability !== zone.availability &&
        within(report.reportedAt, zone.reportedAt),
    );
  }
  return false;
}

/** Settles every pending entry old enough to judge. Returns whether anything changed. */
export function promotePendingPoints(db: MockDatabase): boolean {
  const now = Date.now();
  let changed = false;
  for (const entry of db.pointsLedger) {
    if (entry.state !== 'pending' || now - at(entry.createdAt) < VERIFY_AFTER_MS) continue;
    entry.state = contradicted(db, entry) ? 'revoked' : 'verified';
    changed = true;
  }
  return changed;
}
