import { createHash, randomBytes } from 'node:crypto';
import jwt from 'jsonwebtoken';
import type { ParkingVisit, ParkingZone, ParkingOperator, Role } from '@prisma/client';
import { env } from '../../config/env';
import { db, atomic, lock, type Tx } from '../../database/client';
import { ApiError, assert, requireValue } from '../../utils/errors';
import { notify } from '../notifications/service';
import * as sessions from '../sessions/service';
import { operatorPermission, type ManagementAction } from '../management/permissions';

/**
 * Gates record when a car enters and leaves a lot — from a plate camera, a QR
 * scan at the gate, or an operator typing the plate. The overstay checker then
 * compares each car still inside against the parking it paid for.
 */

export type GateSource = 'camera' | 'qr' | 'manual';
export interface Staff { userId: string; role: Role }

const GATE_PASS_TTL_SECONDS = 120;
const VIOLATION_DUE_DAYS = 14;

export const normalizePlate = (plate: string) => plate.replace(/[^0-9]/g, '');
const hashKey = (key: string) => createHash('sha256').update(key).digest('hex');

/* ── Who may do what ───────────────────────────────────────────────────── */

/** Admins everywhere; operators only at their own lots; officers check any lot. */
async function zoneFor(staff: Staff, zoneId: string, allowOfficer = false, action: ManagementAction = 'operate') {
  const zone = requireValue(await db.parkingZone.findUnique({ where: { id: zoneId }, include: { operator: true } }), 'Parking location not found');
  if (staff.role === 'ADMIN' || (allowOfficer && staff.role === 'ENFORCEMENT_OFFICER')) return zone;
  await operatorPermission(db, staff, zone.operatorId, action);
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
  return (await tx.userVehicle.findMany({ where: { vehicleId, unlinkedAt: null, verifiedAt: { not: null } }, select: { userId: true } })).map((l) => l.userId);
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
  const result = await atomic(async (tx) => {
    // Match sessions.start/extend: zone precedes vehicle, plate and visit locks.
    await lock(tx, `zone:${event.zoneId}`);
    if (vehicle) await lock(tx, `vehicle:${vehicle.id}`);
    await lock(tx, `plate:${plateNumber}`);
    const zone = requireValue(await tx.parkingZone.findUnique({ where: { id: event.zoneId } }), 'Parking location not found');
    if (pass) assert(await tx.userVehicle.findFirst({ where: { userId: pass.userId, vehicleId: pass.vehicleId, unlinkedAt: null } }), 'INVALID_GATE_PASS', 'This driver is no longer linked to that vehicle', 400);
    const active = pass ? await tx.parkingSession.findFirst({ where: { vehicleId: pass.vehicleId, status: 'ACTIVE' } }) : null;
    assert(!active || (active.userId === pass!.userId && active.parkingZoneId === event.zoneId), 'ACTIVE_SESSION_EXISTS', 'This vehicle already has an active parking session', 409);
    const open = await tx.parkingVisit.findFirst({ where: { plateNumber, exitedAt: null } });
    if (open) await lock(tx, `visit:${open.id}`);
    let visit = open;
    if (open?.parkingZoneId !== zone.id) {
      // A missed exit elsewhere is inferred only if the new entry fully succeeds.
      if (open) await tx.parkingVisit.update({ where: { id: open.id }, data: { exitedAt: at > open.enteredAt ? at : open.enteredAt, exitSource: 'inferred' } });
      visit = await tx.parkingVisit.create({
        data: { parkingZoneId: zone.id, plateNumber, vehicleId: vehicle?.id, enteredAt: at, entrySource: event.source, entryDeviceId: event.deviceId },
      });
    }
    const recorded = requireValue(visit);
    let session: { id: string } | undefined;
    const covered = await coverage(recorded, zone, at, tx);
    // A QR identifies the permit holder; it must not opt them into an extra fare.
    if (pass && !covered.permit && zone.supportedModes.includes('start_stop') && zone.supportedEntryMethods.includes('qr')) {
      // Reuse the same validation/locks as the public idempotent start wrapper.
      // A closure, missing tariff or closed hours rolls back both visit changes.
      session = active ?? await sessions.startInTransaction(tx, pass.userId, { vehicleId: pass.vehicleId, zoneId: zone.id, mode: 'start_stop', entryMethod: 'qr' });
      visit = await tx.parkingVisit.update({ where: { id: recorded.id }, data: { sessionId: session.id } });
    } else if (vehicle) {
      if (!covered.covered) {
        for (const userId of await owners(tx, vehicle.id)) {
          await notify(tx, userId, 'gate_entry', `You entered ${zone.name}`, `دخلت ${zone.nameAr}`,
            `Start parking in the app within ${zone.overstayGraceMinutes} minutes to avoid a violation.`,
            `ابدأ الوقوف في التطبيق خلال ${zone.overstayGraceMinutes} دقائق لتجنب المخالفة.`,
            `/parking/start?zoneId=${zone.id}`, `gate-entry:${recorded.id}:${userId}`);
        }
      }
    }
    return { visit: requireValue(visit), zone, session };
  });
  return visitView(result.visit, result.zone, new Date(Math.max(at.getTime(), Date.now())), result.session?.id);
}

export async function exit(event: GateEvent) {
  const at = event.at ?? new Date();
  const pass = event.pass ? readGatePass(event.pass) : undefined;
  const plateNumber = pass
    ? requireValue(await db.vehicle.findUnique({ where: { id: pass.vehicleId } }), 'Vehicle not found').plateNumber
    : normalizePlate(event.plate ?? '');
  const vehicle = await db.vehicle.findUnique({ where: { plateNumber_region: { plateNumber, region: 'PS' } }, select: { id: true } });
  const result = await atomic(async (tx) => {
    await lock(tx, 'zone:' + event.zoneId);
    if (vehicle) await lock(tx, 'vehicle:' + vehicle.id);
    await lock(tx, 'plate:' + plateNumber);
    const zone = requireValue(await tx.parkingZone.findUnique({ where: { id: event.zoneId }, include: { operator: true } }), 'Parking location not found');
    const open = await tx.parkingVisit.findFirst({ where: { plateNumber, exitedAt: null, parkingZoneId: zone.id }, include: { zone: { include: { operator: true } } } });
    assert(open, 'NOT_INSIDE', 'This car has no recorded entry at this lot', 404);
    await lock(tx, 'visit:' + open.id);
    if (open.vehicleId) await lockCoverageSessions(tx, open.vehicleId, zone.id);
    if (pass) {
      assert(await tx.userVehicle.findFirst({ where: { userId: pass.userId, vehicleId: pass.vehicleId, unlinkedAt: null } }), 'INVALID_GATE_PASS', 'This driver is no longer linked to that vehicle', 400);
      const active = await tx.parkingSession.findFirst({ where: { vehicleId: pass.vehicleId, parkingZoneId: zone.id, status: 'ACTIVE' } });
      assert(!active || active.userId === pass.userId, 'FORBIDDEN', 'This parking session belongs to another account', 403);
    }
    // Preserve tolerated camera history, but never use a future event to advance money.
    const evaluatedAt = new Date(Math.min(at.getTime(), Date.now()));
    await assessVisitOverstay(tx, open, evaluatedAt);
    if (open.vehicleId) {
      const active = await tx.parkingSession.findFirst({ where: { vehicleId: open.vehicleId, parkingZoneId: zone.id, status: 'ACTIVE', parkingMode: 'start_stop' } });
      if (active) await sessions.stopInTransaction(tx, pass?.userId ?? active.userId, active.id, evaluatedAt);
    }
    // A billing failure rolls back the physical departure as well, allowing a safe retry.
    const visit = await tx.parkingVisit.update({ where: { id: open.id }, data: { exitedAt: at, exitSource: event.source, exitDeviceId: event.deviceId } });
    return { visit, zone, evaluatedAt };
  }, 'ReadCommitted');
  return visitView(result.visit, result.zone, result.evaluatedAt);
}

/* ── Coverage and the overstay checker ─────────────────────────────────── */

interface Coverage { covered: boolean; until?: Date; hasSession: boolean; permit?: boolean }

/** Sessions and permits share one coverage end, including the grace after expiry. */
async function coverage(visit: Pick<ParkingVisit, 'vehicleId' | 'enteredAt' | 'parkingZoneId'>, zone: Pick<ParkingZone, 'id'>, now: Date, tx: Tx | typeof db = db): Promise<Coverage> {
  if (!visit.vehicleId) return { covered: false, until: visit.enteredAt, hasSession: false };
  const rows = await tx.parkingSession.findMany({
    where: {
      vehicleId: visit.vehicleId, parkingZoneId: zone.id,
      startedAt: { lte: now },
      // Coverage follows overlap with this physical visit, not session age.
      OR: [
        { parkingMode: 'start_stop', OR: [{ status: 'ACTIVE', stoppedAt: null }, { stoppedAt: { gte: visit.enteredAt } }] },
        { parkingMode: 'prepaid', endsAt: { gte: visit.enteredAt }, OR: [{ stoppedAt: null }, { stoppedAt: { gte: visit.enteredAt } }] },
      ],
    },
  });
  const permits = await tx.permit.findMany({
    where: {
      vehicleId: visit.vehicleId, validFrom: { lte: now }, validTo: { gt: visit.enteredAt },
      AND: [
        { OR: [{ status: 'active' }, { status: 'expired', validTo: { lte: now } }] },
        { OR: [{ zones: { some: { zoneId: zone.id } } }, { zones: { none: {} } }] },
      ],
    },
  });
  const permit = permits.some(p => p.status === 'active' && p.validTo > now);
  if (rows.some(s => s.status === 'ACTIVE' && s.parkingMode === 'start_stop')) return { covered: true, hasSession: true, permit };
  const ends = rows.map(s => s.parkingMode === 'prepaid' ? s.endsAt : s.stoppedAt).filter((d): d is Date => Boolean(d));
  ends.push(...permits.map(p => p.validTo));
  const until = new Date(Math.max(visit.enteredAt.getTime(), ...ends.map(d => d.getTime())));
  return { covered: permit || until > now, until, hasSession: rows.length > 0 || permits.length > 0, permit };
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

async function lockCoverageSessions(tx: Tx, vehicleId: string, zoneId: string) {
  // Start/extend share the zone lock; stop/expiry share the individual session lock.
  const sessions = await tx.parkingSession.findMany({ where: { vehicleId, parkingZoneId: zoneId }, select: { id: true }, orderBy: { id: 'asc' } });
  for (const session of sessions) await lock(tx, 'session:' + session.id);
}

async function assessVisitOverstay(tx: Tx, visit: ParkingVisit & { zone: ZoneWithOperator }, now: Date) {
  if (visit.exitedAt || !visit.vehicleId) return;
  const zone = visit.zone;
  const cover = await coverage(visit, zone, now, tx);
  if (cover.covered || !cover.until) return;
  const graceEnds = new Date(cover.until.getTime() + zone.overstayGraceMinutes * 60_000);
  const people = await owners(tx, visit.vehicleId);
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
}

/**
 * For every car still inside: warn once when its paid time runs out, then after
 * the lot's grace period issue one charge per repeat period, up to the lot's cap
 * for the stay. Paying again (extending) restarts the count from the new end.
 * Cars whose plate is not in ParkFlow are only flagged to the operator.
 */
export async function checkOverstays(evaluatedAt?: Date, scope?: { zoneId: string }) {
  const open = await db.parkingVisit.findMany({
    where: { exitedAt: null, vehicleId: { not: null }, ...(scope ? { parkingZoneId: scope.zoneId } : {}) },
    select: { id: true, parkingZoneId: true, vehicleId: true, plateNumber: true }, take: 1000,
  });
  for (const candidate of open) {
    await atomic(async (tx) => {
      await lock(tx, 'zone:' + candidate.parkingZoneId);
      await lock(tx, 'vehicle:' + candidate.vehicleId!);
      await lock(tx, 'plate:' + candidate.plateNumber);
      await lock(tx, 'visit:' + candidate.id);
      const visit = await tx.parkingVisit.findUnique({ where: { id: candidate.id }, include: { zone: { include: { operator: true } } } });
      if (!visit || visit.exitedAt || !visit.vehicleId) return;
      await lockCoverageSessions(tx, visit.vehicleId, visit.parkingZoneId);
      await assessVisitOverstay(tx, visit, evaluatedAt ?? new Date());
      // ReadCommitted sees coverage committed while an advisory lock was waiting.
    }, 'ReadCommitted');
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
  await checkOverstays(undefined, { zoneId });
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
  await zoneFor(staff, zoneId, false, 'edit');
  return db.parkingZone.update({ where: { id: zoneId }, data: input, select: { id: true, overstayGraceMinutes: true, overstayFee: true, overstayRepeatMinutes: true, overstayMaxPerStay: true } });
}

/** Lots this person can run a gate for, with their overstay rules. */
export async function zones(staff: Staff) {
  return db.parkingZone.findMany({
    where: staff.role === 'ADMIN' || staff.role === 'ENFORCEMENT_OFFICER' ? { active: true } : { active: true, operator: { users: { some: { userId: staff.userId, memberRole: { in: ['owner', 'manager', 'attendant'] } } } } },
    select: { id: true, code: true, name: true, nameAr: true, city: true, cityAr: true, overstayGraceMinutes: true, overstayFee: true, overstayRepeatMinutes: true, overstayMaxPerStay: true, operator: { select: { name: true, type: true } } },
    orderBy: { code: 'asc' }, take: 300,
  });
}

/* ── Cameras ───────────────────────────────────────────────────────────── */

/** The key is shown once; only its hash is stored. */
export async function createDevice(staff: Staff, zoneId: string, input: { name: string; kind: 'camera' | 'qr_scanner' }) {
  await zoneFor(staff, zoneId, false, 'edit');
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
  await checkOverstays(undefined, { zoneId });
  const plateNumber = normalizePlate(plate);
  const vehicle = await db.vehicle.findUnique({ where: { plateNumber_region: { plateNumber, region: 'PS' } } });
  const now = new Date();
  const visit = await db.parkingVisit.findFirst({ where: { plateNumber, parkingZoneId: zoneId, exitedAt: null } });
  const cover = await coverage(visit ?? { vehicleId: vehicle?.id ?? null, enteredAt: now, parkingZoneId: zoneId }, zone, now);
  // The same grace the gate gives: just arrived, or paid time ended only minutes ago.
  const inGrace = !cover.covered && (Boolean(visit) || cover.hasSession) && Boolean(cover.until)
    && now.getTime() < cover.until!.getTime() + zone.overstayGraceMinutes * 60_000;
  const today = new Date(now.getTime() - 12 * 3_600_000);
  const recent = vehicle ? await db.violation.count({ where: { vehicleId: vehicle.id, parkingZoneId: zoneId, issuedAt: { gte: today } } }) : 0;
  return {
    plateNumber,
    registered: Boolean(vehicle),
    allowed: cover.covered,
    reason: cover.permit ? 'permit' : cover.covered ? 'paid' : inGrace ? 'grace' : cover.hasSession ? 'expired' : 'unpaid',
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
  const check = await patrolCheck(staff, zoneId, plate);
  assert(check.registered, 'UNREGISTERED_PLATE', 'This plate is not in ParkFlow — issue a paper ticket instead', 409);
  assert(!check.allowed, 'PARKING_VALID', 'This car has valid parking right now', 409);
  assert(check.reason !== 'grace', 'IN_GRACE_PERIOD', 'This car is still within the grace period', 409);
  assert(!check.gateTracked, 'GATE_TRACKED', 'This car is tracked by the gate and is charged automatically', 409);
  const vehicle = requireValue(await db.vehicle.findUnique({ where: { plateNumber_region: { plateNumber: check.plateNumber, region: 'PS' } } }));
  // One officer ticket per car, lot and hour — tapping twice must not double-charge.
  return atomic(async (tx) => {
    // Match gate entry and session start/extend before deciding if a fine is valid.
    await lock(tx, 'zone:' + zoneId);
    await lock(tx, 'vehicle:' + vehicle.id);
    await lock(tx, 'plate:' + vehicle.plateNumber);
    const zone = requireValue(await tx.parkingZone.findUnique({ where: { id: zoneId }, include: { operator: true } }));
    const visit = await tx.parkingVisit.findFirst({ where: { plateNumber: vehicle.plateNumber, parkingZoneId: zoneId, exitedAt: null } });
    if (visit) await lock(tx, 'visit:' + visit.id);
    await lockCoverageSessions(tx, vehicle.id, zoneId);
    const now = new Date();
    const cover = await coverage(visit ?? { vehicleId: vehicle.id, enteredAt: now, parkingZoneId: zoneId }, zone, now, tx);
    const inGrace = !cover.covered && (Boolean(visit) || cover.hasSession) && Boolean(cover.until)
      && now.getTime() < cover.until!.getTime() + zone.overstayGraceMinutes * 60_000;
    assert(!cover.covered, 'PARKING_VALID', 'This car has valid parking right now', 409);
    assert(!inGrace, 'IN_GRACE_PERIOD', 'This car is still within the grace period', 409);
    assert(!visit, 'GATE_TRACKED', 'This car is tracked by the gate and is charged automatically', 409);
    await lock(tx, 'patrol:' + zoneId + ':' + vehicle.id);
    const duplicate = await tx.violation.findFirst({ where: { vehicleId: vehicle.id, parkingZoneId: zoneId, parkingVisitId: null, issuedAt: { gte: new Date(Date.now() - 3_600_000) } } });
    assert(!duplicate, 'ALREADY_ISSUED', 'A violation was already issued for this car in the last hour', 409);
    const text = wording(zone, cover.hasSession);
    const violation = await tx.violation.create({
      data: {
        vehicleId: vehicle.id, plateNumber: vehicle.plateNumber, type: cover.hasSession ? 'expired_parking' : 'no_active_parking',
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
  }, 'ReadCommitted');
}
