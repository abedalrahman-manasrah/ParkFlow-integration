import { createHash, randomBytes } from 'node:crypto';
import jwt from 'jsonwebtoken';
import type { ParkingVisit, ParkingZone, ParkingOperator, Role } from '@prisma/client';
import { env } from '../../config/env';
import { db, atomic, lock, type Tx } from '../../database/client';
import { ApiError, assert, requireValue } from '../../utils/errors';
import { notify } from '../notifications/service';
import * as sessions from '../sessions/service';

/**
 * Gates record when a car enters and leaves a lot — from a plate camera, a QR
 * scan at the gate, or an operator typing the plate. The overstay checker then
 * compares each car still inside against the parking it paid for.
 */

export type GateSource = 'camera' | 'qr' | 'manual';
export interface Staff { userId: string; role: Role }

const GATE_PASS_TTL_SECONDS = 120;
/** Paying for parking shortly before driving in still covers the visit. */
const PREPAY_WINDOW_MS = 2 * 3_600_000;
const VIOLATION_DUE_DAYS = 14;

export const normalizePlate = (plate: string) => plate.replace(/[^0-9]/g, '');
const hashKey = (key: string) => createHash('sha256').update(key).digest('hex');

/* ── Who may do what ───────────────────────────────────────────────────── */

/** Admins everywhere; operators only at their own lots; officers check any lot. */
async function zoneFor(staff: Staff, zoneId: string, allowOfficer = false) {
  const zone = requireValue(await db.parkingZone.findUnique({ where: { id: zoneId }, include: { operator: true } }), 'Parking location not found');
  if (staff.role === 'ADMIN' || (allowOfficer && staff.role === 'ENFORCEMENT_OFFICER')) return zone;
  assert(staff.role === 'PARKING_OPERATOR', 'FORBIDDEN', 'You do not have permission', 403);
  const link = await db.operatorUser.findUnique({ where: { operatorId_userId: { operatorId: zone.operatorId, userId: staff.userId } } });
  assert(link, 'FORBIDDEN', 'This lot belongs to another operator', 403);
  return zone;
}

/* ── Driver gate pass (the QR the gate scanner reads) ───────────────────── */

/** A short-lived signed QR, so a screenshot shared with a friend stops working within minutes. */
export async function gatePass(userId: string, vehicleId: string) {
  const link = await db.userVehicle.findFirst({ where: { userId, vehicleId, unlinkedAt: null }, include: { vehicle: true } });
  assert(link, 'NOT_FOUND', 'Vehicle not found', 404);
  const token = jwt.sign({ sub: userId, vid: vehicleId, kind: 'gate' }, env.JWT_ACCESS_SECRET, {
    algorithm: 'HS256', expiresIn: GATE_PASS_TTL_SECONDS, issuer: 'parkflow', audience: 'parkflow-gate',
  });
  return {
    value: `parkflow://gate/${token}`,
    plateNumber: link.vehicle.plateNumber,
    expiresAt: new Date(Date.now() + GATE_PASS_TTL_SECONDS * 1000).toISOString(),
  };
}

function readGatePass(value: string) {
  const token = value.startsWith('parkflow://gate/') ? value.slice('parkflow://gate/'.length) : value;
  try {
    const claims = jwt.verify(token, env.JWT_ACCESS_SECRET, { algorithms: ['HS256'], issuer: 'parkflow', audience: 'parkflow-gate' }) as jwt.JwtPayload;
    assert(claims.kind === 'gate' && typeof claims.sub === 'string' && typeof claims.vid === 'string', 'INVALID_GATE_PASS', 'This QR code is not a ParkFlow gate pass', 400);
    return { userId: claims.sub, vehicleId: claims.vid as string };
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError(400, 'INVALID_GATE_PASS', 'This gate pass expired or is not valid. Ask the driver to refresh it.');
  }
}

/* ── Entry and exit ────────────────────────────────────────────────────── */

async function owners(tx: Tx | typeof db, vehicleId: string) {
  return (await tx.userVehicle.findMany({ where: { vehicleId, unlinkedAt: null }, select: { userId: true } })).map((l) => l.userId);
}

interface GateEvent { zoneId: string; plate?: string; pass?: string; source: GateSource; deviceId?: string; at?: Date }

export async function enter(event: GateEvent) {
  const at = event.at ?? new Date();
  const pass = event.pass ? readGatePass(event.pass) : undefined;
  const vehicle = pass
    ? requireValue(await db.vehicle.findUnique({ where: { id: pass.vehicleId } }), 'Vehicle not found')
    : await db.vehicle.findUnique({ where: { plateNumber_region: { plateNumber: normalizePlate(event.plate ?? ''), region: 'PS' } } });
  const plateNumber = vehicle?.plateNumber ?? normalizePlate(event.plate ?? '');
  assert(plateNumber.length >= 4, 'VALIDATION', 'Enter a valid plate number');
  if (pass) assert((await owners(db, vehicle!.id)).includes(pass.userId), 'INVALID_GATE_PASS', 'This driver is no longer linked to that vehicle', 400);

  const zone = requireValue(await db.parkingZone.findUnique({ where: { id: event.zoneId } }), 'Parking location not found');
  const visit = await atomic(async (tx) => {
    await lock(tx, `plate:${plateNumber}`);
    const open = await tx.parkingVisit.findFirst({ where: { plateNumber, exitedAt: null } });
    if (open?.parkingZoneId === zone.id) return open; // A camera firing twice is the same entry.
    // A car cannot be in two lots at once — a missed exit elsewhere is closed now.
    if (open) await tx.parkingVisit.update({ where: { id: open.id }, data: { exitedAt: at > open.enteredAt ? at : open.enteredAt, exitSource: 'inferred' } });
    return tx.parkingVisit.create({
      data: { parkingZoneId: zone.id, plateNumber, vehicleId: vehicle?.id, enteredAt: at, entrySource: event.source, entryDeviceId: event.deviceId },
    });
  });

  // A QR scan is the driver checking in, so it starts pay-as-you-go parking when the lot supports it.
  let session: { id: string } | undefined;
  if (pass && !visit.sessionId && zone.supportedModes.includes('start_stop') && zone.supportedEntryMethods.includes('qr')) {
    const active = await db.parkingSession.findFirst({ where: { vehicleId: pass.vehicleId, status: 'ACTIVE' } });
    session = active ?? await sessions.start(pass.userId, { vehicleId: pass.vehicleId, zoneId: zone.id, mode: 'start_stop', entryMethod: 'qr' }, `gate-entry:${visit.id}`);
    await db.parkingVisit.update({ where: { id: visit.id }, data: { sessionId: session.id } });
  } else if (vehicle) {
    const covered = await coverage({ ...visit, vehicleId: vehicle.id }, zone, at);
    if (!covered.covered) {
      await atomic(async (tx) => {
        for (const userId of await owners(tx, vehicle.id)) {
          await notify(tx, userId, 'gate_entry', `You entered ${zone.name}`, `دخلت ${zone.nameAr}`,
            `Start parking in the app within ${zone.overstayGraceMinutes} minutes to avoid a violation.`,
            `ابدأ الوقوف في التطبيق خلال ${zone.overstayGraceMinutes} دقائق لتجنب المخالفة.`,
            `/parking/start?zoneId=${zone.id}`, `gate-entry:${visit.id}:${userId}`);
        }
      });
    }
  }
  // Status is read after any session above started, so a QR check-in shows as covered.
  return visitView(await db.parkingVisit.findUniqueOrThrow({ where: { id: visit.id } }), zone, new Date(Math.max(at.getTime(), Date.now())), session?.id);
}

export async function exit(event: GateEvent) {
  const at = event.at ?? new Date();
  const pass = event.pass ? readGatePass(event.pass) : undefined;
  const plateNumber = pass
    ? requireValue(await db.vehicle.findUnique({ where: { id: pass.vehicleId } }), 'Vehicle not found').plateNumber
    : normalizePlate(event.plate ?? '');
  const zone = requireValue(await db.parkingZone.findUnique({ where: { id: event.zoneId } }), 'Parking location not found');
  // Settle any overstay up to the moment of leaving before the visit closes.
  await checkOverstays(at);
  const visit = await atomic(async (tx) => {
    await lock(tx, `plate:${plateNumber}`);
    const open = await tx.parkingVisit.findFirst({ where: { plateNumber, exitedAt: null, parkingZoneId: zone.id } });
    assert(open, 'NOT_INSIDE', 'This car has no recorded entry at this lot', 404);
    return tx.parkingVisit.update({ where: { id: open.id }, data: { exitedAt: at, exitSource: event.source, exitDeviceId: event.deviceId } });
  });
  // Leaving ends pay-as-you-go parking, so nobody pays for time after they drove out.
  if (visit.vehicleId) {
    const active = await db.parkingSession.findFirst({ where: { vehicleId: visit.vehicleId, parkingZoneId: zone.id, status: 'ACTIVE', parkingMode: 'start_stop' } });
    if (active) await sessions.stop(active.userId, active.id, `gate-exit:${visit.id}`);
  }
  return visitView(visit, zone, at);
}

/* ── Coverage and the overstay checker ─────────────────────────────────── */

interface Coverage { covered: boolean; until?: Date; hasSession: boolean }

/** How long a car inside has paid for: forever while pay-as-you-go runs, else the latest paid end. */
async function coverage(visit: Pick<ParkingVisit, 'vehicleId' | 'enteredAt' | 'parkingZoneId'>, zone: Pick<ParkingZone, 'id'>, now: Date): Promise<Coverage> {
  if (!visit.vehicleId) return { covered: false, until: visit.enteredAt, hasSession: false };
  const rows = await db.parkingSession.findMany({
    where: {
      vehicleId: visit.vehicleId, parkingZoneId: zone.id,
      startedAt: { gte: new Date(visit.enteredAt.getTime() - PREPAY_WINDOW_MS), lte: now },
      OR: [{ stoppedAt: null }, { stoppedAt: { gte: visit.enteredAt } }],
    },
  });
  if (rows.some((s) => s.status === 'ACTIVE' && s.parkingMode === 'start_stop')) return { covered: true, hasSession: true };
  const ends = rows.map((s) => (s.parkingMode === 'prepaid' ? s.endsAt : s.stoppedAt)).filter((d): d is Date => Boolean(d));
  const until = new Date(Math.max(visit.enteredAt.getTime(), ...ends.map((d) => d.getTime())));
  return { covered: until > now, until, hasSession: rows.length > 0 };
}

type ZoneWithOperator = ParkingZone & { operator: ParkingOperator };

/** Municipal lots issue official violations; a private lot can only charge an overstay fee. */
function wording(zone: ZoneWithOperator, hasSession: boolean) {
  const municipal = zone.operator.type === 'municipality';
  if (municipal) {
    return hasSession
      ? { reason: 'Parking time ended and the car stayed', reasonAr: 'انتهى وقت الوقوف وبقيت السيارة' }
      : { reason: 'Parked without paying', reasonAr: 'وقوف دون دفع' };
  }
  return hasSession
    ? { reason: `Overstay fee charged by ${zone.operator.name}`, reasonAr: `رسوم تجاوز الوقت من ${zone.operator.name}` }
    : { reason: `Unpaid parking fee charged by ${zone.operator.name}`, reasonAr: `رسوم وقوف غير مدفوع من ${zone.operator.name}` };
}

/**
 * For every car still inside: warn once when its paid time runs out, then after
 * the lot's grace period issue one charge per repeat period, up to the lot's cap
 * for the stay. Paying again (extending) restarts the count from the new end.
 * Cars whose plate is not in ParkFlow are only flagged to the operator.
 */
export async function checkOverstays(now = new Date()) {
  const open = await db.parkingVisit.findMany({
    where: { exitedAt: null, vehicleId: { not: null } },
    include: { zone: { include: { operator: true } } }, take: 1000,
  });
  for (const visit of open) {
    const zone = visit.zone;
    const cover = await coverage(visit, zone, now);
    if (cover.covered || !cover.until) continue;
    const graceEnds = new Date(cover.until.getTime() + zone.overstayGraceMinutes * 60_000);
    await atomic(async (tx) => {
      await lock(tx, `visit:${visit.id}`);
      const people = await owners(tx, visit.vehicleId!);
      if (now < graceEnds) {
        // Only warn about paid time that ran out — an unpaid entry was already told at the gate.
        if (cover.hasSession) {
          for (const userId of people) {
            await notify(tx, userId, 'overstay_warning', 'Your parking time ended', 'انتهى وقت الوقوف',
              `Extend or leave ${zone.name} within ${zone.overstayGraceMinutes} minutes to avoid a violation.`,
              `مدّد أو غادر ${zone.nameAr} خلال ${zone.overstayGraceMinutes} دقائق لتجنب المخالفة.`,
              '/(tabs)/map', `overstay-warning:${visit.id}:${cover.until!.getTime()}:${userId}`);
          }
        }
        return;
      }
      const due = 1 + Math.floor((now.getTime() - graceEnds.getTime()) / (zone.overstayRepeatMinutes * 60_000));
      const issued = await tx.violation.findMany({ where: { parkingVisitId: visit.id }, select: { amount: true, issuedAt: true } });
      const sinceCoverage = issued.filter((v) => v.issuedAt >= graceEnds).length;
      let total = issued.reduce((sum, v) => sum + v.amount, 0);
      const text = wording(zone, cover.hasSession);
      for (let n = sinceCoverage; n < due; n++) {
        const amount = Math.min(zone.overstayFee, zone.overstayMaxPerStay - total);
        if (amount <= 0) break;
        total += amount;
        const violation = await tx.violation.create({
          data: {
            vehicleId: visit.vehicleId!, plateNumber: visit.plateNumber,
            type: cover.hasSession ? 'expired_parking' : 'no_active_parking',
            amount, parkingZoneId: zone.id, parkingVisitId: visit.id,
            locationName: zone.name, locationNameAr: zone.nameAr, latitude: zone.latitude, longitude: zone.longitude,
            issuedAt: now, dueAt: new Date(now.getTime() + VIOLATION_DUE_DAYS * 86_400_000),
            ...text, issuingAuthority: zone.operator.name, issuingAuthorityAr: zone.operator.name,
          },
        });
        await tx.violationEvidence.create({
          data: {
            violationId: violation.id, detectedPlate: visit.plateNumber,
            detectionSource: visit.entrySource === 'camera' ? 'fixed_camera' : visit.entrySource === 'qr' ? 'gate_scan' : 'inspector',
            firstDetectionAt: visit.enteredAt, secondDetectionAt: now,
            latitude: zone.latitude, longitude: zone.longitude, deviceId: visit.entryDeviceId,
          },
        });
        for (const userId of people) {
          await notify(tx, userId, 'violation_issued', 'New parking violation', 'مخالفة وقوف جديدة',
            `${text.reason} at ${zone.name}.`, `${text.reasonAr} في ${zone.nameAr}.`, `/violations/${violation.id}`, `violation:${violation.id}:${userId}`);
        }
      }
    });
  }
}

/* ── What staff see ────────────────────────────────────────────────────── */

type VisitStatus = 'covered' | 'grace' | 'overstaying' | 'unregistered' | 'left';

async function visitView(visit: ParkingVisit, zone: ParkingZone, now: Date, sessionId?: string) {
  const cover = await coverage(visit, zone, now);
  const graceEnds = cover.until ? new Date(cover.until.getTime() + zone.overstayGraceMinutes * 60_000) : undefined;
  const status: VisitStatus = visit.exitedAt ? 'left'
    : cover.covered ? 'covered'
    : !visit.vehicleId ? 'unregistered'
    : graceEnds && now < graceEnds ? 'grace' : 'overstaying';
  const violations = await db.violation.findMany({ where: { parkingVisitId: visit.id }, select: { id: true, amount: true, issuedAt: true } });
  return {
    id: visit.id,
    plateNumber: visit.plateNumber,
    registered: Boolean(visit.vehicleId),
    enteredAt: visit.enteredAt.toISOString(),
    exitedAt: visit.exitedAt?.toISOString(),
    entrySource: visit.entrySource,
    status,
    paidUntil: cover.covered || !cover.hasSession ? undefined : cover.until?.toISOString(),
    graceEndsAt: status === 'grace' || status === 'overstaying' ? graceEnds?.toISOString() : undefined,
    sessionId: sessionId ?? visit.sessionId ?? undefined,
    violationCount: violations.length,
    violationTotal: violations.reduce((sum, v) => sum + v.amount, 0),
  };
}

export async function visits(staff: Staff, zoneId: string) {
  const zone = await zoneFor(staff, zoneId);
  await checkOverstays();
  const now = new Date();
  const rows = await db.parkingVisit.findMany({
    where: { parkingZoneId: zoneId, OR: [{ exitedAt: null }, { exitedAt: { gte: new Date(now.getTime() - 12 * 3_600_000) } }] },
    orderBy: { enteredAt: 'desc' }, take: 200,
  });
  return Promise.all(rows.map((row) => visitView(row, zone, now)));
}

export async function staffEnter(staff: Staff, input: { zoneId: string; plate?: string; pass?: string }) {
  await zoneFor(staff, input.zoneId);
  return enter({ zoneId: input.zoneId, plate: input.plate, pass: input.pass, source: input.pass ? 'qr' : 'manual' });
}

export async function staffExit(staff: Staff, input: { zoneId: string; plate?: string; pass?: string }) {
  await zoneFor(staff, input.zoneId);
  return exit({ zoneId: input.zoneId, plate: input.plate, pass: input.pass, source: input.pass ? 'qr' : 'manual' });
}

export async function rules(staff: Staff, zoneId: string, input: { overstayGraceMinutes: number; overstayFee: number; overstayRepeatMinutes: number; overstayMaxPerStay: number }) {
  await zoneFor(staff, zoneId);
  return db.parkingZone.update({ where: { id: zoneId }, data: input, select: { id: true, overstayGraceMinutes: true, overstayFee: true, overstayRepeatMinutes: true, overstayMaxPerStay: true } });
}

/** Lots this person can run a gate for, with their overstay rules. */
export async function zones(staff: Staff) {
  return db.parkingZone.findMany({
    where: staff.role === 'ADMIN' || staff.role === 'ENFORCEMENT_OFFICER' ? { active: true } : { active: true, operator: { users: { some: { userId: staff.userId } } } },
    select: { id: true, code: true, name: true, nameAr: true, city: true, cityAr: true, overstayGraceMinutes: true, overstayFee: true, overstayRepeatMinutes: true, overstayMaxPerStay: true, operator: { select: { name: true, type: true } } },
    orderBy: { code: 'asc' }, take: 300,
  });
}

/* ── Cameras ───────────────────────────────────────────────────────────── */

/** The key is shown once; only its hash is stored. */
export async function createDevice(staff: Staff, zoneId: string, input: { name: string; kind: 'camera' | 'qr_scanner' }) {
  await zoneFor(staff, zoneId);
  const key = `pfg_${randomBytes(24).toString('base64url')}`;
  const device = await db.gateDevice.create({ data: { parkingZoneId: zoneId, name: input.name, kind: input.kind, keyHash: hashKey(key) } });
  return { id: device.id, name: device.name, kind: device.kind, key };
}

/** Called by a plate camera (or its vendor's system) for every car it reads. */
export async function cameraEvent(key: string, input: { plate: string; direction: 'entry' | 'exit'; at?: string }) {
  assert(key, 'UNAUTHORIZED', 'Send the gate device key in the X-Gate-Key header', 401);
  const device = await db.gateDevice.findUnique({ where: { keyHash: hashKey(key) } });
  assert(device && device.active, 'UNAUTHORIZED', 'Unknown or disabled gate device', 401);
  await db.gateDevice.update({ where: { id: device.id }, data: { lastSeenAt: new Date() } });
  const at = input.at ? new Date(input.at) : undefined;
  assert(!at || Math.abs(at.getTime() - Date.now()) < 15 * 60_000, 'VALIDATION', 'Event time is too far from now');
  const event = { zoneId: device.parkingZoneId, plate: input.plate, source: 'camera' as const, deviceId: device.id, at };
  return input.direction === 'entry' ? enter(event) : exit(event);
}

/* ── Officer patrol ────────────────────────────────────────────────────── */

/** "Is this car allowed to be here right now?" for an officer standing next to it. */
export async function patrolCheck(staff: Staff, zoneId: string, plate: string) {
  const zone = await zoneFor(staff, zoneId, true);
  await checkOverstays();
  const plateNumber = normalizePlate(plate);
  const vehicle = await db.vehicle.findUnique({ where: { plateNumber_region: { plateNumber, region: 'PS' } } });
  const now = new Date();
  const visit = await db.parkingVisit.findFirst({ where: { plateNumber, parkingZoneId: zoneId, exitedAt: null } });
  const cover = await coverage(visit ?? { vehicleId: vehicle?.id ?? null, enteredAt: now, parkingZoneId: zoneId }, zone, now);
  const permit = vehicle ? await db.permit.findFirst({
    where: { vehicleId: vehicle.id, status: 'active', validFrom: { lte: now }, validTo: { gt: now }, zones: { some: { zoneId } } },
  }) : null;
  // The same grace the gate gives: just arrived, or paid time ended only minutes ago.
  const inGrace = !cover.covered && (Boolean(visit) || cover.hasSession) && Boolean(cover.until)
    && now.getTime() < cover.until!.getTime() + zone.overstayGraceMinutes * 60_000;
  const today = new Date(now.getTime() - 12 * 3_600_000);
  const recent = vehicle ? await db.violation.count({ where: { vehicleId: vehicle.id, parkingZoneId: zoneId, issuedAt: { gte: today } } }) : 0;
  return {
    plateNumber,
    registered: Boolean(vehicle),
    allowed: cover.covered || Boolean(permit),
    reason: permit ? 'permit' : cover.covered ? 'paid' : inGrace ? 'grace' : cover.hasSession ? 'expired' : 'unpaid',
    paidUntil: cover.covered || !cover.hasSession ? undefined : cover.until?.toISOString(),
    graceEndsAt: inGrace ? new Date(cover.until!.getTime() + zone.overstayGraceMinutes * 60_000).toISOString() : undefined,
    insideSince: visit?.enteredAt.toISOString(),
    /** Cars recorded by a gate are charged by the overstay checker, never also by hand. */
    gateTracked: Boolean(visit),
    recentViolations: recent,
    fee: zone.overstayFee,
  };
}

/** An officer's on-the-spot violation for a car with no valid parking. */
export async function patrolIssue(staff: Staff, zoneId: string, plate: string) {
  const zone = requireValue(await db.parkingZone.findUnique({ where: { id: zoneId }, include: { operator: true } }));
  const check = await patrolCheck(staff, zoneId, plate);
  assert(check.registered, 'UNREGISTERED_PLATE', 'This plate is not in ParkFlow — issue a paper ticket instead', 409);
  assert(!check.allowed, 'PARKING_VALID', 'This car has valid parking right now', 409);
  assert(check.reason !== 'grace', 'IN_GRACE_PERIOD', 'This car is still within the grace period', 409);
  assert(!check.gateTracked, 'GATE_TRACKED', 'This car is tracked by the gate and is charged automatically', 409);
  const vehicle = requireValue(await db.vehicle.findUnique({ where: { plateNumber_region: { plateNumber: check.plateNumber, region: 'PS' } } }));
  // One officer ticket per car, lot and hour — tapping twice must not double-charge.
  const duplicate = await db.violation.findFirst({ where: { vehicleId: vehicle.id, parkingZoneId: zoneId, parkingVisitId: null, issuedAt: { gte: new Date(Date.now() - 3_600_000) } } });
  assert(!duplicate, 'ALREADY_ISSUED', 'A violation was already issued for this car in the last hour', 409);
  return atomic(async (tx) => {
    const now = new Date();
    const text = wording(zone, check.reason === 'expired');
    const violation = await tx.violation.create({
      data: {
        vehicleId: vehicle.id, plateNumber: vehicle.plateNumber, type: check.reason === 'expired' ? 'expired_parking' : 'no_active_parking',
        amount: zone.overstayFee, parkingZoneId: zone.id, locationName: zone.name, locationNameAr: zone.nameAr,
        latitude: zone.latitude, longitude: zone.longitude, issuedAt: now, dueAt: new Date(now.getTime() + VIOLATION_DUE_DAYS * 86_400_000),
        ...text, issuingAuthority: zone.operator.name, issuingAuthorityAr: zone.operator.name,
      },
    });
    await tx.violationEvidence.create({
      data: { violationId: violation.id, detectedPlate: vehicle.plateNumber, detectionSource: 'inspector', firstDetectionAt: now, latitude: zone.latitude, longitude: zone.longitude, officerId: staff.userId },
    });
    await tx.auditLog.create({ data: { actorUserId: staff.userId, action: 'issue', resourceType: 'violation', resourceId: violation.id, after: { plate: vehicle.plateNumber, zoneId } } });
    for (const userId of await owners(tx, vehicle.id)) {
      await notify(tx, userId, 'violation_issued', 'New parking violation', 'مخالفة وقوف جديدة',
        `${text.reason} at ${zone.name}.`, `${text.reasonAr} في ${zone.nameAr}.`, `/violations/${violation.id}`, `violation:${violation.id}:${userId}`);
    }
    return { id: violation.id, amount: violation.amount, type: violation.type };
  });
}
