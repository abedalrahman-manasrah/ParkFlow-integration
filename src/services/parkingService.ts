import type { ParkingService, StartSessionInput } from './types';
import type { ParkingSession, ParkingZone } from '@/types';
import { AppError } from '@/utils/errors';
import { createId } from '@/utils/id';
import { networkDelay } from '@/utils/async';
import { addMinutes, nowIso, secondsBetween } from '@/utils/time';
import { computeCost, discountTariff, estimatePrepaidCost, snapshotTariff } from '@/utils/pricing';
import { distanceMeters } from '@/utils/geo';
import { FACILITIES, ZONES } from './mock/catalog';
import { getDb, mutate, type MockDatabase } from './mock/db';
import { needsZoneSeed, seedZoneReports, withCrowd } from './mock/community';
import { computeTrust } from './mock/trust';
import { assertSufficientBalance, makeReference, postTransaction, requireWallet } from './mock/ledger';

/**
 * Parking rules enforced here (they belong to the backend, not the UI):
 *  - one ACTIVE session per VEHICLE, never per account;
 *  - the tariff is snapshotted at start so later price changes cannot re-price
 *    a running session;
 *  - cost is derived from timestamps, so a cold start recovers exactly;
 *  - if payment fails on stop, the session still closes and the debt is tracked
 *    separately — parking data is never lost because a card declined.
 */

/** Recently used idempotency keys -> session id, to absorb double taps. */
const startKeys = new Map<string, string>();

function zoneOrThrow(zoneId: string): ParkingZone {
  const zone = ZONES.find((z) => z.id === zoneId);
  if (!zone) throw new AppError('not_found', 'Parking zone not found');
  return zone;
}

/** The shared DB, with the demo's "other drivers" reports seeded if the feed has gone quiet. */
async function dbWithZoneReports(): Promise<MockDatabase> {
  const db = await getDb();
  if (needsZoneSeed(db)) await mutate(seedZoneReports);
  return db;
}

function sessionOrThrow(db: MockDatabase, sessionId: string): ParkingSession {
  const session = db.sessions.find((s) => s.id === sessionId);
  if (!session) throw new AppError('not_found', 'Parking session not found');
  return session;
}

/**
 * Charges the wallet for a finished session, tolerating a shortfall.
 * Returns whether the money was actually collected.
 */
function settle(db: MockDatabase, session: ParkingSession, amount: number): boolean {
  const zoneName = session.pricingRulesSnapshot.zoneName;
  const zoneNameAr = session.pricingRulesSnapshot.zoneNameAr;

  if (amount <= 0) {
    session.paymentStatus = 'paid';
    session.status = 'COMPLETED';
    return true;
  }

  try {
    assertSufficientBalance(db, session.userId, amount);
  } catch {
    // Edge case: the parking is over but we cannot collect. Keep the session,
    // record the failure, and let the user settle it from the receipt.
    session.paymentStatus = 'failed';
    session.status = 'PAYMENT_FAILED';
    postTransaction(db, session.userId, {
      type: 'parking_payment',
      amount: -amount,
      status: 'failed',
      failureReason: 'Insufficient wallet balance',
      title: 'Parking',
      titleAr: 'وقوف',
      subtitle: zoneName,
      subtitleAr: zoneNameAr,
      parkingSessionId: session.id,
      vehicleId: session.vehicleId,
      reference: makeReference('PRK'),
    });
    return false;
  }

  const transaction = postTransaction(db, session.userId, {
    type: 'parking_payment',
    amount: -amount,
    title: 'Parking',
    titleAr: 'وقوف',
    subtitle: zoneName,
    subtitleAr: zoneNameAr,
    parkingSessionId: session.id,
    vehicleId: session.vehicleId,
    reference: makeReference('PRK'),
  });

  session.paymentStatus = 'paid';
  session.paymentTransactionId = transaction.id;
  session.status = 'COMPLETED';
  return true;
}

type LegacyMockParkingService = Omit<
  ParkingService,
  | 'getLayout'
  | 'createReservation'
  | 'listReservations'
  | 'getReservation'
  | 'cancelReservation'
  | 'validateReservationQr'
>;

export const mockParkingService: LegacyMockParkingService = {
  async listZones(query) {
    await networkDelay(200, 480);
    let zones = [...ZONES];

    if (query?.search?.trim()) {
      const term = query.search.trim().toLowerCase();
      zones = zones.filter(
        (z) =>
          z.name.toLowerCase().includes(term) ||
          z.nameAr.includes(term) ||
          z.code.toLowerCase().includes(term) ||
          z.city.toLowerCase().includes(term),
      );
    }

    if (query?.near) {
      const origin = query.near;
      const radius = query.radiusMeters;
      zones = zones
        .filter((z) => (radius ? distanceMeters(origin, z.location) <= radius : true))
        .sort((a, b) => distanceMeters(origin, a.location) - distanceMeters(origin, b.location));
    }

    const db = await dbWithZoneReports();
    return zones.map((zone) => withCrowd(db, zone));
  },

  async getZone(zoneId) {
    await networkDelay(120, 260);
    const zone = zoneOrThrow(zoneId);
    return withCrowd(await dbWithZoneReports(), zone);
  },

  async getZoneByCode(code) {
    await networkDelay(160, 320);
    const zone = ZONES.find((z) => z.code.toLowerCase() === code.trim().toLowerCase());
    if (!zone) throw new AppError('not_found', 'No zone matches that code');
    return withCrowd(await dbWithZoneReports(), zone);
  },

  async getFacility(facilityId) {
    await networkDelay(120, 240);
    const facility = FACILITIES.find((f) => f.id === facilityId);
    if (!facility) throw new AppError('not_found', 'Facility not found');
    return facility;
  },

  async startSession(input: StartSessionInput) {
    await networkDelay();

    const existingId = startKeys.get(input.idempotencyKey);
    if (existingId) {
      const db = await getDb();
      return { ...sessionOrThrow(db, existingId) };
    }

    const zone = zoneOrThrow(input.zoneId);

    if (zone.parkingAllowed === false) {
      throw new AppError('conflict', 'This location is not available for normal public parking');
    }

    if (!zone.supportedModes.includes(input.mode)) {
      throw new AppError('validation', 'This zone does not support that parking mode');
    }
    if (input.mode === 'prepaid' && !input.durationMinutes) {
      throw new AppError('validation', 'Choose how long you want to park');
    }

    return mutate((db) => {
      // The rule that matters: one active session per vehicle, not per account.
      const clash = db.sessions.find(
        (s) => s.vehicleId === input.vehicleId && s.status === 'ACTIVE',
      );
      if (clash) {
        throw new AppError('conflict', 'This vehicle already has an active parking session', {
          sessionId: clash.id,
        });
      }

      const startedAt = nowIso();
      // The loyalty tier is read once at start and frozen with the rate, so a
      // tier change mid-session cannot re-price it either.
      const { discountPercent } = computeTrust(db, input.userId);
      const tariff = discountTariff(zone.tariff, discountPercent);
      const rateSnapshot = snapshotTariff(tariff, startedAt, discountPercent || undefined);

      let prepaidCost = 0;
      if (input.mode === 'prepaid') {
        prepaidCost = estimatePrepaidCost(tariff, input.durationMinutes!);
        assertSufficientBalance(db, input.userId, prepaidCost);
      }

      const session: ParkingSession = {
        id: createId('ses'),
        userId: input.userId,
        vehicleId: input.vehicleId,
        parkingZoneId: zone.id,
        parkingFacilityId: zone.facilityId,
        parkingMode: input.mode,
        startedAt,
        endsAt:
          input.mode === 'prepaid' ? addMinutes(startedAt, input.durationMinutes!) : undefined,
        rateSnapshot,
        pricingRulesSnapshot: {
          mode: input.mode,
          operatingHours: zone.operatingHours,
          entryMethod: input.entryMethod,
          zoneCode: zone.code,
          zoneName: zone.name,
          zoneNameAr: zone.nameAr,
          city: zone.city,
        },
        currentCost: prepaidCost,
        paymentStatus: input.mode === 'prepaid' ? 'paid' : 'unpaid',
        status: 'ACTIVE',
        createdAt: startedAt,
        updatedAt: startedAt,
      };

      if (input.mode === 'prepaid' && prepaidCost > 0) {
        const transaction = postTransaction(db, input.userId, {
          type: 'parking_payment',
          amount: -prepaidCost,
          title: 'Parking',
          titleAr: 'وقوف',
          subtitle: zone.name,
          subtitleAr: zone.nameAr,
          parkingSessionId: session.id,
          vehicleId: session.vehicleId,
          reference: makeReference('PRK'),
        });
        session.paymentTransactionId = transaction.id;
      }

      db.sessions.push(session);
      db.notifications.push({
        id: createId('ntf'),
        userId: input.userId,
        type: 'parking_started',
        title: 'Parking started',
        titleAr: 'بدأ الوقوف',
        body: `Your parking at ${zone.name} is now active.`,
        bodyAr: `وقوفك في ${zone.nameAr} نشط الآن.`,
        href: `/parking/active/${session.id}`,
        parkingSessionId: session.id,
        vehicleId: session.vehicleId,
        createdAt: startedAt,
      });

      startKeys.set(input.idempotencyKey, session.id);
      return { ...session };
    });
  },

  async stopSession(sessionId) {
    await networkDelay();

    return mutate((db) => {
      const session = sessionOrThrow(db, sessionId);
      if (session.status !== 'ACTIVE') {
        // Already stopped — return the settled record instead of erroring, so a
        // double tap on STOP is harmless.
        return { ...session };
      }

      const stoppedAt = nowIso();
      const elapsedSeconds = secondsBetween(session.startedAt, new Date(stoppedAt));

      const finalCost =
        session.parkingMode === 'prepaid'
          ? session.currentCost
          : computeCost(session.rateSnapshot, elapsedSeconds);

      session.stoppedAt = stoppedAt;
      session.endsAt = session.endsAt ?? stoppedAt;
      session.finalCost = finalCost;
      session.currentCost = finalCost;
      session.updatedAt = stoppedAt;

      let paid = true;
      if (session.parkingMode === 'prepaid') {
        // Already paid up front — nothing further to collect.
        session.status = 'COMPLETED';
      } else {
        paid = settle(db, session, finalCost);
      }

      const wallet = requireWallet(db, session.userId);
      db.notifications.push({
        id: createId('ntf'),
        userId: session.userId,
        type: paid ? 'parking_completed' : 'payment_failed',
        title: paid ? 'Parking completed' : 'Payment failed',
        titleAr: paid ? 'اكتمل الوقوف' : 'فشل الدفع',
        body: paid
          ? `Your parking at ${session.pricingRulesSnapshot.zoneName} ended.`
          : `Your parking at ${session.pricingRulesSnapshot.zoneName} ended but payment did not go through.`,
        bodyAr: paid
          ? `انتهى وقوفك في ${session.pricingRulesSnapshot.zoneNameAr}.`
          : `انتهى وقوفك في ${session.pricingRulesSnapshot.zoneNameAr} لكن الدفع لم يتم.`,
        href: `/parking/receipt/${session.id}`,
        parkingSessionId: session.id,
        vehicleId: session.vehicleId,
        createdAt: stoppedAt,
      });

      if (wallet.balance < wallet.autoTopUpThreshold) {
        db.notifications.push({
          id: createId('ntf'),
          userId: session.userId,
          type: 'low_balance',
          title: 'Low wallet balance',
          titleAr: 'رصيد المحفظة منخفض',
          body: 'Top up your wallet to keep parking without interruption.',
          bodyAr: 'اشحن محفظتك لمواصلة الوقوف دون انقطاع.',
          href: '/wallet',
          createdAt: stoppedAt,
        });
      }

      return { ...session };
    });
  },

  async extendSession(sessionId, additionalMinutes) {
    await networkDelay();

    return mutate((db) => {
      const session = sessionOrThrow(db, sessionId);
      if (session.status !== 'ACTIVE') {
        throw new AppError('conflict', 'This session is no longer active');
      }
      if (session.parkingMode !== 'prepaid') {
        throw new AppError('validation', 'Only prepaid sessions can be extended');
      }

      const zone = zoneOrThrow(session.parkingZoneId);
      const extraCost = estimatePrepaidCost(
        discountTariff(zone.tariff, session.rateSnapshot.loyaltyDiscountPercent ?? 0),
        additionalMinutes,
      );
      assertSufficientBalance(db, session.userId, extraCost);

      // Extending from the current expiry, not from now, so the driver never
      // loses time they already paid for.
      const base = session.endsAt ?? nowIso();
      session.endsAt = addMinutes(base, additionalMinutes);
      session.currentCost += extraCost;
      session.updatedAt = nowIso();

      postTransaction(db, session.userId, {
        type: 'parking_payment',
        amount: -extraCost,
        title: 'Parking extension',
        titleAr: 'تمديد وقوف',
        subtitle: session.pricingRulesSnapshot.zoneName,
        subtitleAr: session.pricingRulesSnapshot.zoneNameAr,
        parkingSessionId: session.id,
        vehicleId: session.vehicleId,
        reference: makeReference('PRK'),
      });

      return { ...session };
    });
  },

  async settleSession(sessionId) {
    await networkDelay();

    return mutate((db) => {
      const session = sessionOrThrow(db, sessionId);
      if (session.paymentStatus === 'paid') return { ...session };

      const amount = session.finalCost ?? session.currentCost;
      settle(db, session, amount);
      session.updatedAt = nowIso();
      return { ...session };
    });
  },

  async getSession(sessionId) {
    await networkDelay(100, 220);
    const db = await getDb();
    return { ...sessionOrThrow(db, sessionId) };
  },

  async listActiveSessions(userId) {
    // No artificial delay: this drives the persistent "you are parked" banner
    // and should feel instant on cold start.
    const db = await getDb();
    return db.sessions
      .filter((s) => s.userId === userId && s.status === 'ACTIVE')
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
      .map((s) => ({ ...s }));
  },

  async getActiveSessionForVehicle(vehicleId) {
    const db = await getDb();
    const session = db.sessions.find((s) => s.vehicleId === vehicleId && s.status === 'ACTIVE');
    return session ? { ...session } : undefined;
  },

  async listSessions({ userId, vehicleId, limit }) {
    await networkDelay(180, 400);
    const db = await getDb();
    const rows = db.sessions
      .filter((s) => s.userId === userId && (!vehicleId || s.vehicleId === vehicleId))
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
      .map((s) => ({ ...s }));
    return limit ? rows.slice(0, limit) : rows;
  },
};
