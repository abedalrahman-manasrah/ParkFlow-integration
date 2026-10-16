import type { PointsEntry } from '@prisma/client';
import type { Tx } from '../../database/client';
import { event } from '../../realtime/outbox';
import { notify } from '../notifications/service';
import { post } from '../wallet/ledger';

function configuredInt(name: string, fallback: number, maximum: number): number {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value >= 0 && value <= maximum ? value : fallback;
}

/** Points a driver earns for a new map incident report — the same for every type. */
export const incidentReportPoints = () => configuredInt('INCIDENT_REPORT_POINTS', 10, 1000);
/** Wallet credit per verified point, in minor units (agorot). 10 → 1 point = ₪0.10. */
export const rewardPerPoint = () => configuredInt('POINTS_REWARD_MINOR_UNITS', 10, 10_000);
/** Rewarded incident reports per rolling 24 hours, so reporting cannot be farmed for money. */
const dailyIncidentRewardLimit = () => configuredInt('INCIDENT_REPORT_DAILY_REWARDS', 10, 1000);

const formatShekels = (minor: number) => `₪${(minor / 100).toFixed(2)}`;
// Arabic counts 3–10 take the plural "نقاط"; everything else reads naturally with "نقطة".
const pointsAr = (n: number) => `${n} ${n >= 3 && n <= 10 ? 'نقاط' : 'نقطة'}`;

/** Records pending points for a fresh incident report, or nothing once the daily cap is hit. */
export async function awardIncidentReport(tx: Tx, userId: string, reportId: string) {
  const points = incidentReportPoints();
  if (points <= 0) return null;
  const today = await tx.pointsEntry.count({
    where: { userId, reason: 'incident_report', createdAt: { gt: new Date(Date.now() - 86_400_000) } },
  });
  if (today >= dailyIncidentRewardLimit()) return null;
  const entry = await tx.pointsEntry.create({
    data: { userId, placeId: reportId, reason: 'incident_report', points, incidentReportId: reportId },
  });
  const notification = await announcePoints(tx, entry);
  return { id: entry.id, points: entry.points, state: entry.state, rewardMinor: points * rewardPerPoint(), notification };
}

/**
 * Tells the reporter the moment a report earns points. The money follows once
 * the report is confirmed (see settlePoints), so the note says so up front.
 */
export async function announcePoints(tx: Tx, entry: PointsEntry) {
  const amount = entry.points * rewardPerPoint();
  const notification = await notify(
    tx,
    entry.userId,
    'points_awarded',
    `You earned ${entry.points} points`,
    `حصلت على ${pointsAr(entry.points)}`,
    amount > 0
      ? `Thanks for your report. When other drivers in the same area confirm it, ${formatShekels(amount)} is added to your wallet.`
      : 'Thanks for your report.',
    amount > 0
      ? `شكراً على بلاغك. عندما يؤكده سائقون آخرون في نفس المنطقة، تُضاف ${formatShekels(amount)} إلى محفظتك.`
      : 'شكراً على بلاغك.',
    '/profile/points',
    `points-awarded:${entry.id}`,
  );
  await event(tx, 'trust.updated', {}, entry.userId);
  // Returned with the report so the app can show it at once, without waiting on the socket.
  return notification ?? null;
}

/**
 * Moves a pending entry to verified or revoked exactly once. Verified points are
 * paid into the wallet and announced with a second notification in the same
 * transaction, so the money and its note always arrive together.
 */
export async function settlePoints(tx: Tx, entry: PointsEntry, verified: boolean, now = new Date()) {
  const changed = await tx.pointsEntry.updateMany({
    where: { id: entry.id, state: 'pending' },
    data: { state: verified ? 'verified' : 'revoked', verifiedAt: now },
  });
  if (changed.count === 0) return;

  if (verified) {
    const amount = entry.points * rewardPerPoint();
    if (amount > 0) {
      await post(tx, entry.userId, {
        amount,
        type: 'reward',
        title: 'Points reward',
        titleAr: 'مكافأة نقاط',
        subtitle: `${entry.points} points`,
        subtitleAr: pointsAr(entry.points),
        reference: `points-reward:${entry.id}`,
      });
      await notify(
        tx,
        entry.userId,
        'reward_paid',
        `${formatShekels(amount)} added to your wallet`,
        `تمت إضافة ${formatShekels(amount)} إلى محفظتك`,
        `Your report was confirmed and your ${entry.points} points were paid out.`,
        `تم تأكيد بلاغك وتحويل ${pointsAr(entry.points)} إلى رصيد.`,
        '/wallet',
        `reward-paid:${entry.id}`,
      );
    }
  }
  await event(tx, 'trust.updated', {}, entry.userId);
}
