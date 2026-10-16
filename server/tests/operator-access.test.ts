import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { db } from '../src/database/client';
import * as operator from '../src/modules/operator/service';

const suffix = randomUUID();
const operatorUserId = `operator-${suffix}`;
const otherUserId = `other-${suffix}`;
const adminUserId = `admin-${suffix}`;
const parkingOperatorId = `parking-operator-${suffix}`;
const otherParkingOperatorId = `other-parking-operator-${suffix}`;
const assignedZoneId = `assigned-zone-${suffix}`;
const otherZoneId = `other-zone-${suffix}`;
const assignedReservationId = `assigned-reservation-${suffix}`;
const otherReservationId = `other-reservation-${suffix}`;

const baseZone = (id: string, operatorId = parkingOperatorId) => ({
  id,
  operatorId,
  code: id.slice(0, 16).toUpperCase(),
  name: id,
  nameAr: id,
  city: 'Ramallah',
  cityAr: 'رام الله',
  latitude: 31.9,
  longitude: 35.2,
  kind: 'garage',
  defaultMode: 'start_stop' as const,
  supportedModes: ['start_stop' as const],
  supportedEntryMethods: ['manual'],
});

describe('operator access and feed health', () => {
  beforeAll(async () => {
    await db.user.createMany({ data: [
      { id: operatorUserId, email: `${operatorUserId}@example.com`, role: 'PARKING_OPERATOR' },
      { id: otherUserId, email: `${otherUserId}@example.com`, role: 'PARKING_OPERATOR' },
      { id: adminUserId, email: `${adminUserId}@example.com`, role: 'ADMIN' },
    ] });
    await db.parkingOperator.createMany({ data: [{ id: parkingOperatorId, name: 'Operator access test' }, { id: otherParkingOperatorId, name: 'Other operator' }] });
    await db.parkingZone.createMany({ data: [baseZone(assignedZoneId), baseZone(otherZoneId, otherParkingOperatorId)] });
    await db.operatorUser.create({ data: { operatorId: parkingOperatorId, userId: operatorUserId } });
    await db.availabilitySnapshot.create({ data: {
      zoneId: assignedZoneId,
      availability: 'full',
      source: 'OPERATOR',
      confidence: 0.9,
      recordedAt: new Date(Date.now() - 3 * 60 * 60 * 1000),
    } });
    await db.parkingReport.create({ data: {
      userId: otherUserId,
      zoneId: assignedZoneId,
      availability: 'available',
      reportedAt: new Date(),
    } });
    const startTime = new Date(Date.now() - 5 * 60 * 1000);
    const endTime = new Date(Date.now() + 60 * 60 * 1000);
    await db.parkingReservation.createMany({ data: [
      {
        id: assignedReservationId,
        parkingZoneId: assignedZoneId,
        userId: operatorUserId,
        startTime,
        endTime,
        durationMinutes: 60,
        hourlyRateSnapshot: 500,
        estimatedTotalPriceSnapshot: 500,
        publicCode: `ASSIGNED-${suffix.slice(0, 20)}`,
        qrToken: `assigned-qr-${suffix}`,
      },
      {
        id: otherReservationId,
        parkingZoneId: otherZoneId,
        userId: operatorUserId,
        startTime,
        endTime,
        durationMinutes: 60,
        hourlyRateSnapshot: 500,
        estimatedTotalPriceSnapshot: 500,
        publicCode: `OTHER-${suffix.slice(0, 20)}`,
        qrToken: `other-qr-${suffix}`,
      },
    ] });
  });

  afterAll(async () => {
    await db.parkingReservation.deleteMany({ where: { parkingZoneId: { in: [assignedZoneId, otherZoneId] } } });
    await db.parkingReport.deleteMany({ where: { zoneId: { in: [assignedZoneId, otherZoneId] } } });
    await db.availabilitySnapshot.deleteMany({ where: { zoneId: { in: [assignedZoneId, otherZoneId] } } });
    await db.operatorUser.deleteMany({ where: { operatorId: parkingOperatorId } });
    await db.parkingZone.deleteMany({ where: { id: { in: [assignedZoneId, otherZoneId] } } });
    await db.parkingOperator.deleteMany({ where: { id: { in: [parkingOperatorId, otherParkingOperatorId] } } });
    await db.idempotencyRecord.deleteMany({ where: { userId: { in: [operatorUserId, otherUserId, adminUserId] } } });
    await db.auditLog.deleteMany({ where: { actorUserId: { in: [operatorUserId, otherUserId, adminUserId] } } });
    await db.user.deleteMany({ where: { id: { in: [operatorUserId, otherUserId, adminUserId] } } });
  });

  it('scopes assigned operators and allows admins to read all zones', async () => {
    const assigned = await operator.summary({ userId: operatorUserId, role: 'PARKING_OPERATOR' });
    expect(assigned.zones.map((zone) => zone.id)).toContain(assignedZoneId);
    expect(assigned.zones.map((zone) => zone.id)).not.toContain(otherZoneId);
    const admin = await operator.summary({ userId: adminUserId, role: 'ADMIN' });
    expect(admin.zones.map((zone) => zone.id)).toEqual(expect.arrayContaining([assignedZoneId, otherZoneId]));
  });

  it('rejects another operator and reports stale/conflicting signals without mutation', async () => {
    await expect(operator.availability(
      { userId: otherUserId, role: 'PARKING_OPERATOR' },
      assignedZoneId,
      { availability: 'available', source: 'OPERATOR', confidence: 0.8 },
    )).rejects.toMatchObject({ status: 403 });
    const health = await operator.feedHealth({ userId: operatorUserId, role: 'PARKING_OPERATOR' });
    expect(health.zones[0]?.feedHealth).toMatchObject({ stale: true, conflict: true });
    expect(await db.availabilitySnapshot.findFirst({ where: { zoneId: assignedZoneId } })).toMatchObject({ availability: 'full' });
    expect(await db.parkingReport.findFirst({ where: { zoneId: assignedZoneId } })).toMatchObject({ availability: 'available' });
  });

  it('keeps current and upcoming reservations visible after more than 200 past bookings without exposing another organization', async () => {
    const now = Date.now();
    await db.parkingReservation.createMany({ data: Array.from({ length: 205 }, (_, index) => ({
      id: `history-${suffix}-${index}`, parkingZoneId: assignedZoneId, userId: operatorUserId,
      startTime: new Date(now - (206 - index) * 3_600_000), endTime: new Date(now - (205 - index) * 3_600_000),
      durationMinutes: 60, hourlyRateSnapshot: 500, estimatedTotalPriceSnapshot: 500, status: 'completed' as const,
      publicCode: `H-${suffix.slice(0, 20)}-${index}`, qrToken: `history-token-${suffix}-${index}`,
    })) });
    const upcoming = await db.parkingReservation.create({ data: {
      parkingZoneId: assignedZoneId, userId: operatorUserId,
      startTime: new Date(now + 3_600_000), endTime: new Date(now + 7_200_000),
      durationMinutes: 60, hourlyRateSnapshot: 500, estimatedTotalPriceSnapshot: 500,
      publicCode: `UPCOMING-${suffix.slice(0, 20)}`, qrToken: `upcoming-token-${suffix}`,
    } });
    try {
      const listed = await operator.reservations({ userId: operatorUserId, role: 'PARKING_OPERATOR' }, assignedZoneId);
      expect(listed).toHaveLength(200);
      expect(listed.slice(0, 2).map(row => row.id)).toEqual([assignedReservationId, upcoming.id]);
      expect(listed[2]?.id).toBe(`history-${suffix}-204`);
      expect(listed.some(row => row.id === otherReservationId)).toBe(false);
      expect(await db.parkingReservation.count({ where: { parkingZoneId: assignedZoneId } })).toBe(207);
    } finally {
      await db.parkingReservation.deleteMany({ where: { parkingZoneId: assignedZoneId, id: { not: assignedReservationId } } });
    }
  });

  it('allows an assigned operator to update availability, list scoped reservations, and check in a valid reservation', async () => {
    const updated = await operator.availability(
      { userId: operatorUserId, role: 'PARKING_OPERATOR' },
      assignedZoneId,
      { availability: 'limited', availableSpaces: 4, occupiedSpaces: 12, source: 'OPERATOR', confidence: 0.95, reason: 'Event traffic' },
    );
    expect(updated).toMatchObject({ zoneId: assignedZoneId, availability: 'limited', availableSpaces: 4, occupiedSpaces: 12, reason: 'Event traffic' });
    expect(await db.availabilitySnapshot.findFirst({ where: { id: updated.id } })).toMatchObject({ source: 'OPERATOR', availability: 'limited' });

    const scopedReservations = await operator.reservations({ userId: operatorUserId, role: 'PARKING_OPERATOR' }, assignedZoneId);
    expect(scopedReservations.map((reservation) => reservation.id)).toEqual([assignedReservationId]);

    const checkedIn = await operator.checkIn({ userId: operatorUserId, role: 'PARKING_OPERATOR' }, assignedReservationId);
    expect(checkedIn).toMatchObject({ id: assignedReservationId, status: 'checked_in' });
    expect(await db.parkingReservation.findUnique({ where: { id: assignedReservationId } })).toMatchObject({ status: 'checked_in' });
  });
});
