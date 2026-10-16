import type { ParkingReservationStatus } from '@prisma/client';
import { db, atomic, json, lock, type Tx } from '../../database/client';
import { assert, requireValue } from '../../utils/errors';
import type { Actor } from '../admin/service';
import { zonePermission as scopedZonePermission } from '../management/permissions';
import {
  AVAILABILITY_STALE_SECONDS,
  buildAvailabilityProvenance,
} from '../parking/service';

const activeReservationStatuses: ParkingReservationStatus[] = ['confirmed', 'checked_in'];

/**
 * Resolve a zone only when the actor is allowed to operate it. Keeping this
 * check in one transaction-scoped helper makes it difficult for a new query or
 * mutation to accidentally forget operator membership.
 */
export async function operatorZonePermission(tx: Tx | typeof db, actor: Actor, zoneId: string) {
  return scopedZonePermission(tx,actor,zoneId,'operate');
}

type Snapshot = {
  id: string;
  zoneId: string;
  availability: 'available' | 'limited' | 'full' | 'unknown';
  availableSpaces: number | null;
  occupiedSpaces: number | null;
  source: string;
  confidence: number;
  recordedAt: Date;
};

type CrowdReport = {
  availability: 'available' | 'limited' | 'full' | 'unknown';
  reportedAt: Date;
};

function ageSeconds(at: Date | null, now: Date) {
  return at ? Math.max(0, Math.floor((now.getTime() - at.getTime()) / 1000)) : null;
}

function buildFeedHealth(snapshot: Snapshot | null, crowd: CrowdReport | null, now: Date) {
  const snapshotAge = ageSeconds(snapshot?.recordedAt ?? null, now);
  const crowdAge = ageSeconds(crowd?.reportedAt ?? null, now);
  const stale = snapshotAge == null || snapshotAge > AVAILABILITY_STALE_SECONDS;
  const conflict = Boolean(
    snapshot && crowd
      && snapshot.source.toLowerCase() === 'operator'
      && snapshot.availability !== crowd.availability
      && snapshotAge !== null
      && crowdAge !== null,
  );
  return {
    stale,
    conflict,
    snapshotAgeSeconds: snapshotAge,
    crowdAgeSeconds: crowdAge,
    signals: {
      operator: snapshot
        ? { availability: snapshot.availability, recordedAt: snapshot.recordedAt.toISOString(), confidence: snapshot.confidence }
        : null,
      crowd: crowd
        ? { availability: crowd.availability, reportedAt: crowd.reportedAt.toISOString() }
        : null,
    },
  };
}

function reservationDto(row: {
  id: string;
  parkingZoneId: string;
  userId: string;
  spotId: string | null;
  startTime: Date;
  endTime: Date;
  durationMinutes: number;
  hourlyRateSnapshot: number;
  estimatedTotalPriceSnapshot: number;
  currency: string;
  priceIsDemo: boolean;
  isDemoReservation: boolean;
  status: ParkingReservationStatus;
  publicCode: string;
  qrToken: string;
  createdAt: Date;
  updatedAt: Date;
  checkedInAt?: Date | null;
  operatorResolution?: 'none' | 'alternative' | 'refund_requested';
  operatorResolutionNote?: string | null;
  user?: { id: string; fullName: string; phone: string | null; email: string | null } | null;
}) {
  return {
    ...row,
    startTime: row.startTime.toISOString(),
    endTime: row.endTime.toISOString(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    checkedInAt: row.checkedInAt?.toISOString() ?? null,
    operatorResolution: row.operatorResolution ?? 'none',
    operatorResolutionNote: row.operatorResolutionNote ?? null,
    qrValue: `parkflow://reservation/${row.qrToken}`,
    user: row.user ?? undefined,
  };
}

async function zoneHealth(tx: Tx | typeof db, zoneId: string, now: Date) {
  const [snapshot, crowd, activeReservationCount] = await Promise.all([
    tx.availabilitySnapshot.findFirst({ where: { zoneId }, orderBy: { recordedAt: 'desc' } }),
    tx.parkingReport.findFirst({ where: { zoneId }, orderBy: { reportedAt: 'desc' } }),
    tx.parkingReservation.count({ where: { parkingZoneId: zoneId, status: { in: activeReservationStatuses }, endTime: { gt: now } } }),
  ]);
  const provenance = buildAvailabilityProvenance(snapshot, crowd ? {
    availability: crowd.availability,
    minutesSinceReport: Math.max(0, (now.getTime() - crowd.reportedAt.getTime()) / 60000),
    reportCount: 1,
  } : undefined, now);
  return {
    latestProvenance: provenance,
    activeReservationCount,
    feedHealth: buildFeedHealth(snapshot, crowd, now),
  };
}

async function scopedZones(tx: Tx | typeof db, actor: Actor) {
  return tx.parkingZone.findMany({
    where: actor.role === 'ADMIN' ? {} : { operator: { users: { some: { userId: actor.userId } } } },
    orderBy: { name: 'asc' },
    take: 200,
  });
}

export async function summary(actor: Actor) {
  const now = new Date();
  const zones = await scopedZones(db, actor);
  const assignedZones = await Promise.all(zones.map(async (zone) => {
      await operatorZonePermission(db, actor, zone.id);
      return {
      id: zone.id,
      code: zone.code,
      name: zone.name,
      nameAr: zone.nameAr,
      city: zone.city,
      cityAr: zone.cityAr,
      capacity: zone.capacity,
      active: zone.active,
      ...(await zoneHealth(db, zone.id, now)),
      };
    }));
  return {
    zones: assignedZones,
    assignedZones,
    assignedZoneCount: zones.length,
  };
}

export async function availability(
  actor: Actor,
  zoneId: string,
  input: {
    availability: 'available' | 'limited' | 'full' | 'unknown';
    availableSpaces?: number;
    occupiedSpaces?: number;
    source?: string;
    confidence: number;
    reason?: string;
  },
) {
  return atomic(async (tx) => {
    const zone = await operatorZonePermission(tx, actor, zoneId);
    assert(input.availableSpaces === undefined || !zone.capacity || input.availableSpaces <= zone.capacity, 'VALIDATION', 'Available spaces exceed capacity');
    assert(input.occupiedSpaces === undefined || !zone.capacity || input.occupiedSpaces <= zone.capacity, 'VALIDATION', 'Occupied spaces exceed capacity');
    const { reason: _reason, source: _source, ...values } = input;
    const snapshot = await tx.availabilitySnapshot.create({
      data: { zoneId, ...values, source: actor.role === 'ADMIN' ? 'ADMIN' : 'OPERATOR' },
    });
    await tx.auditLog.create({
      data: {
        actorUserId: actor.userId,
        action: 'create',
        resourceType: 'availability',
        resourceId: snapshot.id,
        before: undefined,
        after: json({ ...snapshot, reason: _reason ?? null }),
        ip: actor.ip,
        userAgent: actor.userAgent,
      },
    });
    return { ...snapshot, recordedAt: snapshot.recordedAt.toISOString(), reason: _reason ?? null };
  });
}

export async function reservations(actor: Actor, zoneId: string) {
  await operatorZonePermission(db, actor, zoneId);
  const include = { user: { select: { id: true, fullName: true, phone: true, email: true } } } as const;
  const activeWhere = { parkingZoneId: zoneId, status: { in: activeReservationStatuses }, endTime: { gt: new Date() } };
  // Old bookings must not push the reservations staff can still operate out of the list.
  const active = await db.parkingReservation.findMany({
    where: activeWhere,
    include,
    orderBy: [{ startTime: 'asc' }, { id: 'asc' }],
    take: 200,
  });
  const history = active.length < 200 ? await db.parkingReservation.findMany({
    where: { parkingZoneId: zoneId, NOT: activeWhere, id: { notIn: active.map(row => row.id) } },
    include,
    orderBy: [{ startTime: 'desc' }, { id: 'desc' }],
    take: 200 - active.length,
  }) : [];
  return [...active, ...history].map(reservationDto);
}

export async function checkIn(actor: Actor, reservationId: string, input: { qrToken?: string } = {}) {
  return atomic(async (tx) => {
    await lock(tx, 'reservation-check-in:' + reservationId);
    const reservation = requireValue(await tx.parkingReservation.findUnique({
      where: { id: reservationId },
      include: { user: { select: { id: true, fullName: true, phone: true, email: true } } },
    }), 'Reservation not found');
    await operatorZonePermission(tx, actor, reservation.parkingZoneId);
    if (input.qrToken) {
      const prefix = 'parkflow://reservation/';
      const token = input.qrToken.startsWith(prefix) ? input.qrToken.slice(prefix.length) : input.qrToken;
      assert(token === reservation.qrToken, 'QR_INVALID', 'This QR code does not match the reservation', 409);
    }
    const now = new Date();
    assert(reservation.status === 'confirmed', 'RESERVATION_NOT_CHECK_INABLE', 'Only a confirmed reservation can be checked in', 409);
    assert(reservation.startTime <= now && reservation.endTime > now, 'RESERVATION_OUTSIDE_WINDOW', 'Reservation is outside its check-in window', 409);
    const updated = await tx.parkingReservation.update({
      where: { id: reservation.id },
      data: { status: 'checked_in', checkedInAt: now },
      include: { user: { select: { id: true, fullName: true, phone: true, email: true } } },
    });
    await tx.auditLog.create({
      data: {
        actorUserId: actor.userId,
        action: 'check_in',
        resourceType: 'parking-reservation',
        resourceId: updated.id,
        before: json(reservation),
        after: json(updated),
        ip: actor.ip,
        userAgent: actor.userAgent,
      },
    });
    return reservationDto(updated);
  });
}

export async function resolveReservation(actor: Actor, reservationId: string, input: { resolution: 'alternative' | 'refund_requested'; note?: string }) {
  return atomic(async (tx) => {
    const reservation = requireValue(await tx.parkingReservation.findUnique({ where: { id: reservationId } }), 'Reservation not found');
    await scopedZonePermission(tx, actor, reservation.parkingZoneId,'edit');
    const updated = await tx.parkingReservation.update({
      where: { id: reservation.id },
      data: { operatorResolution: input.resolution, operatorResolutionNote: input.note?.trim() || null },
      include: { user: { select: { id: true, fullName: true, phone: true, email: true } } },
    });
    await tx.auditLog.create({
      data: {
        actorUserId: actor.userId,
        action: 'reservation_recovery',
        resourceType: 'parking-reservation',
        resourceId: updated.id,
        before: json(reservation),
        after: json(updated),
        ip: actor.ip,
        userAgent: actor.userAgent,
      },
    });
    return reservationDto(updated);
  });
}

export async function feedHealth(actor: Actor) {
  const now = new Date();
  const zones = await scopedZones(db, actor);
  const healthZones = await Promise.all(zones.map(async (zone) => {
      await operatorZonePermission(db, actor, zone.id);
      return {
      zoneId: zone.id,
      code: zone.code,
      name: zone.name,
      ...(await zoneHealth(db, zone.id, now)),
      };
    }));
  return {
    zones: healthZones,
    staleZones: healthZones.filter((zone) => zone.feedHealth.stale).map((zone) => zone.zoneId),
    conflictingZones: healthZones.filter((zone) => zone.feedHealth.conflict).map((zone) => zone.zoneId),
  };
}
