import { randomBytes } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { db, lock } from '../../database/client';
import { assert, requireValue } from '../../utils/errors';
import { idempotent } from '../../utils/idempotency';
import { assertOpen } from '../parking/pricing';
import { getConfiguredSpot } from '../parking/layouts';

const include = {
  zone: { select: { id: true, code: true, name: true, nameAr: true, latitude: true, longitude: true } },
} as const;
type ReservationRow = Prisma.ParkingReservationGetPayload<{ include: typeof include }>;

function dto(row: ReservationRow) {
  const { qrToken, zone, ...reservation } = row;
  return {
    ...reservation,
    spotCode: row.spotId?.split(':').pop(),
    startTime: row.startTime.toISOString(),
    endTime: row.endTime.toISOString(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    qrValue: `parkflow://reservation/${qrToken}`,
    zone: {
      id: zone.id,
      code: zone.code,
      name: zone.name,
      nameAr: zone.nameAr,
      location: { latitude: zone.latitude, longitude: zone.longitude },
    },
  };
}

async function expireDue(now = new Date()) {
  await db.parkingReservation.updateMany({
    where: { status: 'confirmed', endTime: { lte: now } },
    data: { status: 'expired' },
  });
}

async function owned(userId: string, id: string) {
  return requireValue(
    await db.parkingReservation.findFirst({ where: { id, userId }, include }),
    'Reservation not found',
  );
}

export async function create(
  userId: string,
  input: { zoneId: string; spotId: string; startTime: string; durationMinutes: number },
  key: string,
) {
  return idempotent(userId, 'reservation:create', key, input, async (tx) => {
  const startTime = new Date(input.startTime);
  const now = new Date();
  assert(startTime.getTime() >= now.getTime(), 'RESERVATION_IN_PAST', 'Start time cannot be in the past');
  assert(
    input.durationMinutes >= 30 && input.durationMinutes <= 480 && input.durationMinutes % 30 === 0,
    'INVALID_DURATION',
    'Choose 30-minute increments from 30 minutes to 8 hours',
  );
  const endTime = new Date(startTime.getTime() + input.durationMinutes * 60_000);
  assert(endTime > startTime, 'INVALID_TIME_RANGE', 'End time must be after start time');

  const spot = getConfiguredSpot(input.zoneId, input.spotId);
  assert(spot, 'UNKNOWN_PARKING_SPOT', 'Parking space was not found', 404);
  assert(spot.state !== 'out_of_service', 'SPOT_OUT_OF_SERVICE', 'This parking space is out of service', 409);
  assert(spot.state !== 'occupied', 'SPOT_OCCUPIED', 'This demo parking space is occupied', 409);
  await lock(tx, `parking-spot:${input.spotId}`);
  const overlap = await tx.parkingReservation.findFirst({
    where: {
      spotId: input.spotId,
      status: { in: ['confirmed', 'checked_in'] },
      startTime: { lt: endTime },
      endTime: { gt: startTime },
    },
    select: { id: true },
  });
  assert(!overlap, 'SPOT_ALREADY_RESERVED', 'This parking space is already reserved for that time', 409);

  const zone = requireValue(await tx.parkingZone.findFirst({
    where: { id: input.zoneId, active: true },
    include: {
      operatingHours: true,
      tariffs: {
        where: { validFrom: { lte: now }, OR: [{ validTo: null }, { validTo: { gt: now } }] },
        orderBy: { validFrom: 'desc' },
        take: 1,
      },
    },
  }), 'Parking location not found');
  const tariff = requireValue(zone.tariffs[0], 'No current tariff configured');
  assert(zone.parkingAllowed, 'PARKING_RESTRICTED', 'This location is not available for normal public parking', 409);
  assert(!tariff.maxStayMinutes || input.durationMinutes <= tariff.maxStayMinutes, 'MAX_STAY', 'Maximum stay exceeded');
  assertOpen(zone.operatingHours, startTime, endTime);

  const hourlyRateSnapshot = tariff.hourlyRate;
  const estimatedTotalPriceSnapshot = Math.ceil(hourlyRateSnapshot * input.durationMinutes / 60);
  const row = await tx.parkingReservation.create({
    data: {
      parkingZoneId: zone.id,
      spotId: spot.id,
      userId,
      startTime,
      endTime,
      durationMinutes: input.durationMinutes,
      hourlyRateSnapshot,
      estimatedTotalPriceSnapshot,
      currency: tariff.currency,
      priceIsDemo: zone.prototypeData,
      isDemoReservation: true,
      publicCode: `PF-${randomBytes(6).toString('hex').toUpperCase()}`,
      qrToken: randomBytes(24).toString('base64url'),
    },
    include,
  });
  return dto(row);
  });
}

export async function list(userId: string) {
  await expireDue();
  return (await db.parkingReservation.findMany({
    where: { userId }, include, orderBy: { startTime: 'desc' }, take: 200,
  })).map(dto);
}

export async function get(userId: string, id: string) {
  await expireDue();
  return dto(await owned(userId, id));
}

export async function cancel(userId: string, id: string) {
  await expireDue();
  const row = await owned(userId, id);
  assert(row.status === 'confirmed', 'RESERVATION_NOT_CANCELLABLE', 'Only a confirmed reservation can be cancelled', 409);
  assert(row.startTime > new Date(), 'RESERVATION_NOT_CANCELLABLE', 'A reservation can only be cancelled before its start time', 409);
  return dto(await db.parkingReservation.update({
    where: { id: row.id }, data: { status: 'cancelled' }, include,
  }));
}

function tokenFromValue(value: string) {
  const prefix = 'parkflow://reservation/';
  return value.startsWith(prefix) ? value.slice(prefix.length) : value;
}

export async function validateQr(value: string) {
  await expireDue();
  const row = await db.parkingReservation.findUnique({ where: { qrToken: tokenFromValue(value) }, include });
  if (!row) return { valid: false, reason: 'not_found' as const };
  const valid = row.status === 'confirmed' || row.status === 'checked_in';
  return { valid, reason: valid ? undefined : row.status, reservation: dto(row) };
}
