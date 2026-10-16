import type {
  ParkingMode,
  ParkingSession,
  RateSnapshot,
  SessionCostBreakdown,
  Tariff,
} from '@/types';
import { secondsBetween } from './time';

/**
 * Cost is a pure function of (rate snapshot, elapsed seconds).
 *
 * The client renders this every second for a live feel, but the value is fully
 * reproducible from `startedAt` alone — nothing depends on the device having
 * stayed awake, so a cold start recovers the exact same number.
 */
export function computeCost(rate: RateSnapshot, elapsedSeconds: number): number {
  const elapsedMinutes = elapsedSeconds / 60;
  if (elapsedMinutes <= rate.freeMinutes) return 0;

  const chargeable = elapsedMinutes - rate.freeMinutes;
  const increment = Math.max(1, rate.incrementMinutes);
  const billedMinutes = Math.ceil(chargeable / increment) * increment;

  const raw = Math.round((billedMinutes / 60) * rate.hourlyRate);
  const withMinimum = Math.max(raw, rate.minimumCharge);
  return rate.dailyCap != null ? Math.min(withMinimum, rate.dailyCap) : withMinimum;
}

/** Minutes that will actually be billed, for the receipt breakdown. */
function billedMinutesFor(rate: RateSnapshot, elapsedSeconds: number): number {
  const elapsedMinutes = elapsedSeconds / 60;
  if (elapsedMinutes <= rate.freeMinutes) return 0;
  const increment = Math.max(1, rate.incrementMinutes);
  return Math.ceil((elapsedMinutes - rate.freeMinutes) / increment) * increment;
}

/**
 * Everything the active-parking screen needs, derived at render time.
 * `at` is injectable so tests and the receipt can compute historical values.
 */
export function computeSessionBreakdown(
  session: ParkingSession,
  at: Date = new Date(),
): SessionCostBreakdown {
  const endBoundary = session.stoppedAt ? new Date(session.stoppedAt) : at;
  const elapsedSeconds = secondsBetween(session.startedAt, endBoundary);
  const rate = session.rateSnapshot;

  if (session.parkingMode === 'prepaid' && session.endsAt) {
    const totalSeconds = secondsBetween(session.startedAt, session.endsAt);
    const remainingSeconds = Math.max(
      0,
      Math.floor((new Date(session.endsAt).getTime() - endBoundary.getTime()) / 1000),
    );
    return {
      elapsedSeconds,
      billableMinutes: Math.round(totalSeconds / 60),
      // Prepaid is bought up front: the price never moves while parked.
      cost: session.finalCost ?? session.currentCost,
      isCapped: false,
      remainingSeconds,
      isOverstay: remainingSeconds === 0 && !session.stoppedAt,
    };
  }

  const cost = computeCost(rate, elapsedSeconds);
  const billableMinutes = billedMinutesFor(rate, elapsedSeconds);
  const isCapped = rate.dailyCap != null && cost >= rate.dailyCap;
  const isOverstay =
    rate.maxStayMinutes != null && elapsedSeconds / 60 > rate.maxStayMinutes;

  const remainingSeconds =
    rate.maxStayMinutes != null
      ? Math.max(0, rate.maxStayMinutes * 60 - elapsedSeconds)
      : undefined;

  return { elapsedSeconds, billableMinutes, cost, isCapped, remainingSeconds, isOverstay };
}

/** Prepaid price for a chosen duration, using the live tariff. */
export function estimatePrepaidCost(tariff: Tariff, minutes: number): number {
  const raw = Math.round((minutes / 60) * tariff.hourlyRate);
  const withMinimum = Math.max(raw, tariff.minimumCharge);
  return tariff.dailyCap != null ? Math.min(withMinimum, tariff.dailyCap) : withMinimum;
}

/** The tariff with a loyalty discount applied to every money field. */
export function discountTariff(tariff: Tariff, percent: number): Tariff {
  if (!percent) return tariff;
  const cut = (minor: number) => Math.round(minor * (1 - percent / 100));
  return {
    ...tariff,
    hourlyRate: cut(tariff.hourlyRate),
    minimumCharge: cut(tariff.minimumCharge),
    dailyCap: tariff.dailyCap != null ? cut(tariff.dailyCap) : undefined,
  };
}

/** Freeze the tariff onto a session so later price changes cannot rewrite it. */
export function snapshotTariff(
  tariff: Tariff,
  capturedAt: string,
  loyaltyDiscountPercent?: number,
): RateSnapshot {
  return {
    loyaltyDiscountPercent,
    tariffId: tariff.id,
    hourlyRate: tariff.hourlyRate,
    currency: tariff.currency,
    incrementMinutes: tariff.incrementMinutes,
    freeMinutes: tariff.freeMinutes,
    minimumCharge: tariff.minimumCharge,
    dailyCap: tariff.dailyCap,
    maxStayMinutes: tariff.maxStayMinutes,
    capturedAt,
  };
}

export const PREPAID_DURATION_OPTIONS: { minutes: number; labelKey: string }[] = [
  { minutes: 30, labelKey: '30min' },
  { minutes: 60, labelKey: '1hour' },
  { minutes: 120, labelKey: '2hours' },
  { minutes: 180, labelKey: '3hours' },
];

export function modeSupportsExtension(mode: ParkingMode): boolean {
  return mode === 'prepaid';
}
