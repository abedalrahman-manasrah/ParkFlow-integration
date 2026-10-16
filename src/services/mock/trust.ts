import type { TrustFactor, TrustSummary, TrustTier } from '@/types';
import type { MockDatabase } from './db';

/**
 * Driver trust score — the parking version of Wusool's Address Trust Score:
 * built from transparent factors, and it buys a cheaper rate, the way Wusool's
 * trusted addresses buy a cheaper delivery.
 */

export const TRUST_TIERS: { tier: TrustTier; min: number; discountPercent: number }[] = [
  { tier: 'bronze', min: 0, discountPercent: 0 },
  { tier: 'silver', min: 100, discountPercent: 5 },
  { tier: 'gold', min: 250, discountPercent: 10 },
  { tier: 'platinum', min: 500, discountPercent: 15 },
];

const POINTS = {
  verifiedPhone: 50,
  vehicle: 20,
  paidSession: 10,
  unpaidFine: -40,
} as const;

/** Past this many sessions, more parking alone stops raising the score. */
const MAX_COUNTED_SESSIONS = 30;

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

export function computeTrust(db: MockDatabase, userId: string): TrustSummary {
  const user = db.users.find((u) => u.id === userId);
  const vehicleIds = db.userVehicles
    .filter((link) => link.userId === userId && !link.unlinkedAt)
    .map((link) => link.vehicleId);

  const paidSessions = db.sessions.filter(
    (s) => s.userId === userId && s.status === 'COMPLETED' && s.paymentStatus === 'paid',
  ).length;
  const unpaidFines = db.violations.filter(
    (v) => vehicleIds.includes(v.vehicleId) && (v.status === 'unpaid' || v.status === 'overdue'),
  ).length;

  const ledger = db.pointsLedger.filter((entry) => entry.userId === userId);
  const verified = ledger.filter((entry) => entry.state === 'verified');

  const factors: TrustFactor[] = [
    { key: 'verified_phone', count: user ? 1 : 0, points: user ? POINTS.verifiedPhone : 0 },
    { key: 'vehicle', count: vehicleIds.length, points: vehicleIds.length ? POINTS.vehicle : 0 },
    {
      key: 'paid_sessions',
      count: paidSessions,
      points: Math.min(paidSessions, MAX_COUNTED_SESSIONS) * POINTS.paidSession,
    },
    { key: 'reports', count: verified.length, points: sum(verified.map((entry) => entry.points)) },
    { key: 'unpaid_fines', count: unpaidFines, points: unpaidFines * POINTS.unpaidFine },
  ];

  const score = Math.max(0, sum(factors.map((factor) => factor.points)));
  const current = [...TRUST_TIERS].reverse().find((tier) => score >= tier.min) ?? TRUST_TIERS[0]!;
  const next = TRUST_TIERS.find((tier) => tier.min > score);

  return {
    score,
    tier: current.tier,
    discountPercent: current.discountPercent,
    next: next ? { tier: next.tier, at: next.min, discountPercent: next.discountPercent } : undefined,
    pendingPoints: sum(ledger.filter((e) => e.state === 'pending').map((e) => e.points)),
    factors,
    recent: [...ledger].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 10),
  };
}
