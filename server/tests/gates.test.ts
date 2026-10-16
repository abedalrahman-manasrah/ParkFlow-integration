import { beforeEach, describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { createApp } from '../src/app';
import { db, atomic } from '../src/database/client';
import * as database from '../src/database/client';
import { redis } from '../src/database/redis';
import { env } from '../src/config/env';
import * as gates from '../src/modules/gates/service';
import * as sessions from '../src/modules/sessions/service';
import { post } from '../src/modules/wallet/ledger';

const app = createApp();
const minutes = (n: number) => new Date(Date.now() - n * 60_000);
let driver: string, vehicleId: string;
const operator: gates.Staff = { userId: '', role: 'PARKING_OPERATOR' };
const officer: gates.Staff = { userId: '', role: 'ENFORCEMENT_OFFICER' };

async function person(role: 'USER' | 'PARKING_OPERATOR' | 'ENFORCEMENT_OFFICER' = 'USER') {
  const user = await db.user.create({ data: { email: `${randomUUID()}@example.com`, emailVerifiedAt: new Date(), fullName: 'Test Person', role, wallet: { create: {} } } });
  return user.id;
}

async function zone(id: string, operatorId: string, operatorType: string) {
  await db.parkingOperator.upsert({ where: { id: operatorId }, create: { id: operatorId, name: `${operatorId} operator`, type: operatorType }, update: {} });
  await db.parkingZone.create({
    data: {
      id, operatorId, code: id.toUpperCase(), name: `${id} lot`, nameAr: 'موقف', city: 'Ramallah', cityAr: 'رام الله', latitude: 31.9, longitude: 35.2,
      kind: 'lot', defaultMode: 'start_stop', supportedModes: ['start_stop', 'prepaid'], supportedEntryMethods: ['qr', 'manual', 'anpr'],
      overstayGraceMinutes: 10, overstayFee: 5000, overstayRepeatMinutes: 60, overstayMaxPerStay: 12000,
      tariffs: { create: { id: `${id}-rate`, name: 'Test', hourlyRate: 600, incrementMinutes: 15, freeMinutes: 0, minimumCharge: 100, maxStayMinutes: 600, validFrom: new Date('2020-01-01') } },
      operatingHours: { create: Array.from({ length: 7 }, (_, weekday) => ({ weekday, opensAt: '00:00', closesAt: '00:00' })) },
    },
  });
}

beforeEach(async () => {
  const tables = await db.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> '_prisma_migrations'`;
  await db.$executeRawUnsafe('TRUNCATE ' + tables.map((t) => '"' + t.tablename.replace(/"/g, '""') + '"').join(',') + ' CASCADE');
  await redis.flushdb();
  await zone('city-lot', 'city', 'municipality');
  await zone('mall-lot', 'mall', 'mall');
  operator.userId = await person('PARKING_OPERATOR');
  officer.userId = await person('ENFORCEMENT_OFFICER');
  await db.operatorUser.create({ data: { operatorId: 'city', userId: operator.userId } });
  driver = await person();
  await atomic((tx) => post(tx, driver, { amount: 10000, type: 'adjustment', title: 'Test credit', titleAr: 'رصيد اختبار' }));
  const vehicle = await db.vehicle.create({ data: { plateNumber: '1234567' } });
  await db.userVehicle.create({ data: { userId: driver, vehicleId: vehicle.id, verifiedAt: new Date() } });
  vehicleId = vehicle.id;
});

const violations = () => db.violation.findMany({ where: { vehicleId }, include: { evidence: true }, orderBy: { issuedAt: 'asc' } });

describe('QR gate', () => {
  it('starts pay-as-you-go parking on entry and stops and charges it on exit', async () => {
    const pass = await gates.gatePass(driver, vehicleId);
    const entered = await gates.staffEnter(operator, { zoneId: 'city-lot', pass: pass.value });
    expect(entered).toMatchObject({ status: 'covered', plateNumber: '1234567', entrySource: 'qr' });
    const session = await db.parkingSession.findUniqueOrThrow({ where: { id: entered.sessionId! } });
    expect(session).toMatchObject({ status: 'ACTIVE', parkingMode: 'start_stop' });

    await db.parkingSession.update({ where: { id: session.id }, data: { startedAt: minutes(59) } }); // billed in 15-minute steps → 1 hour
    await gates.checkOverstays();
    expect(await violations()).toHaveLength(0);

    const left = await gates.staffExit(operator, { zoneId: 'city-lot', pass: (await gates.gatePass(driver, vehicleId)).value });
    expect(left.status).toBe('left');
    expect((await db.parkingSession.findUniqueOrThrow({ where: { id: session.id } })).status).toBe('COMPLETED');
    expect((await db.wallet.findUniqueOrThrow({ where: { userId: driver } })).balance).toBe(10000 - 600);
  });

  it('rejects expired, forged and unlinked passes', async () => {
    const expired = jwt.sign({ sub: driver, vid: vehicleId, kind: 'gate', exp: Math.floor(Date.now() / 1000) - 10 }, env.JWT_ACCESS_SECRET, { issuer: 'parkflow', audience: 'parkflow-gate' });
    await expect(gates.staffEnter(operator, { zoneId: 'city-lot', pass: `parkflow://gate/${expired}` })).rejects.toMatchObject({ code: 'INVALID_GATE_PASS' });
    const forged = jwt.sign({ sub: driver, vid: vehicleId, kind: 'gate' }, 'not-the-secret', { issuer: 'parkflow', audience: 'parkflow-gate' });
    await expect(gates.staffEnter(operator, { zoneId: 'city-lot', pass: forged })).rejects.toMatchObject({ code: 'INVALID_GATE_PASS' });
    await expect(gates.gatePass(await person(), vehicleId)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('only lets an operator run the gate at their own lots', async () => {
    await expect(gates.staffEnter(operator, { zoneId: 'mall-lot', plate: '1234567' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(gates.staffEnter({ userId: driver, role: 'USER' }, { zoneId: 'city-lot', plate: '1234567' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

describe('integration gate authorization and privacy', () => {
  it('allows attendants to operate gates but reserves rule and device changes for managers', async () => {
    await db.operatorUser.update({ where: { operatorId_userId: { operatorId: 'city', userId: operator.userId } }, data: { memberRole: 'attendant' } });
    expect((await gates.staffEnter(operator, { zoneId: 'city-lot', plate: '1234567' })).plateNumber).toBe('1234567');
    await expect(gates.rules(operator, 'city-lot', { overstayGraceMinutes: 5, overstayFee: 100, overstayRepeatMinutes: 60, overstayMaxPerStay: 1000 })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(gates.createDevice(operator, 'city-lot', { name: 'Gate', kind: 'camera' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it.each(['visits', 'patrol'] as const)('limits %s overstay refreshes to the authorized lot while the worker still covers all lots', async (action) => {
    await db.operatorUser.update({ where: { operatorId_userId: { operatorId: 'city', userId: operator.userId } }, data: { memberRole: 'attendant' } });
    const otherVehicle = await db.vehicle.create({ data: { plateNumber: '7654321' } });
    await db.userVehicle.create({ data: { userId: driver, vehicleId: otherVehicle.id, verifiedAt: new Date() } });
    await db.parkingVisit.createMany({ data: [
      { parkingZoneId: 'city-lot', vehicleId, plateNumber: '1234567', enteredAt: minutes(11), entrySource: 'manual' },
      { parkingZoneId: 'mall-lot', vehicleId: otherVehicle.id, plateNumber: '7654321', enteredAt: minutes(11), entrySource: 'manual' },
    ] });
    if (action === 'visits') await gates.visits(operator, 'city-lot');
    else await gates.patrolCheck(operator, 'city-lot', '1234567');
    expect(await db.violation.count({ where: { parkingZoneId: 'city-lot' } })).toBe(1);
    expect(await db.violation.count({ where: { parkingZoneId: 'mall-lot' } })).toBe(0);
    expect(await db.notification.count({ where: { userId: driver, type: 'violation_issued' } })).toBe(1);
    await gates.checkOverstays();
    expect(await db.violation.count({ where: { parkingZoneId: 'mall-lot' } })).toBe(1);
    expect(await db.violation.count({ where: { parkingZoneId: 'city-lot' } })).toBe(1);
  });

  it('does not disclose gate activity or enforcement records to an unverified plate link', async () => {
    const observer = await person();
    await db.userVehicle.create({ data: { userId: observer, vehicleId } });
    await gates.staffEnter(operator, { zoneId: 'city-lot', plate: '1234567' });
    await gates.checkOverstays(new Date(Date.now() + 11 * 60_000));
    expect(await db.notification.count({ where: { userId: observer, type: { in: ['gate_entry', 'overstay_warning', 'violation_issued'] } } })).toBe(0);
    expect(await db.notification.count({ where: { userId: driver, type: 'violation_issued' } })).toBe(1);
  });

  it('prevents a linked driver from using QR entry or exit to control another account session', async () => {
    const intruder = await person();
    await db.userVehicle.create({ data: { userId: intruder, vehicleId } });
    const ownPass = await gates.gatePass(driver, vehicleId);
    const entered = await gates.staffEnter(operator, { zoneId: 'city-lot', pass: ownPass.value });
    const otherPass = await gates.gatePass(intruder, vehicleId);
    await expect(gates.staffEnter(operator, { zoneId: 'city-lot', pass: otherPass.value })).rejects.toMatchObject({ code: 'ACTIVE_SESSION_EXISTS' });
    await expect(gates.staffExit(operator, { zoneId: 'city-lot', pass: otherPass.value })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect((await db.parkingSession.findUniqueOrThrow({ where: { id: entered.sessionId! } })).status).toBe('ACTIVE');
    expect(await db.parkingVisit.count({ where: { exitedAt: null } })).toBe(1);
    await db.userVehicle.update({ where: { userId_vehicleId: { userId: driver, vehicleId } }, data: { unlinkedAt: new Date() } });
    await expect(gates.staffExit(operator, { zoneId: 'city-lot', pass: ownPass.value })).rejects.toMatchObject({ code: 'INVALID_GATE_PASS' });
  });

  it('does not attach an active session from another lot during QR entry', async () => {
    const active = await sessions.start(driver, { vehicleId, zoneId: 'mall-lot', mode: 'start_stop', entryMethod: 'qr' }, randomUUID());
    await expect(gates.staffEnter(operator, { zoneId: 'city-lot', pass: (await gates.gatePass(driver, vehicleId)).value })).rejects.toMatchObject({ code: 'ACTIVE_SESSION_EXISTS' });
    expect((await db.parkingSession.findUniqueOrThrow({ where: { id: active.id } })).parkingZoneId).toBe('mall-lot');
  });

  it('serializes simultaneous patrol tickets for the same car and lot', async () => {
    const attempts = await Promise.allSettled([
      gates.patrolIssue(officer, 'city-lot', '1234567'),
      gates.patrolIssue(officer, 'city-lot', '1234567'),
    ]);
    expect(attempts.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(await violations()).toHaveLength(1);
  });
});

describe('plate cameras and the overstay checker', () => {
  it('authenticates cameras by device key', async () => {
    const device = await gates.createDevice(operator, 'city-lot', { name: 'North gate', kind: 'camera' });
    expect((await request(app).post('/api/v1/gate/camera-events').set('X-Gate-Key', 'wrong').send({ plate: '1234567', direction: 'entry' })).status).toBe(401);
    const ok = await request(app).post('/api/v1/gate/camera-events').set('X-Gate-Key', device.key).send({ plate: '12-345-67', direction: 'entry' });
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ plateNumber: '1234567', entrySource: 'camera', status: 'grace' });
    const again = await request(app).post('/api/v1/gate/camera-events').set('X-Gate-Key', device.key).send({ plate: '1234567', direction: 'entry' });
    expect(again.body.id).toBe(ok.body.id);
    expect(await db.notification.count({ where: { userId: driver, type: 'gate_entry' } })).toBe(1);
  });

  it('charges unpaid stays after the grace period, once per hour, up to the cap, and stops at exit', async () => {
    const device = await gates.createDevice(operator, 'city-lot', { name: 'Gate', kind: 'camera' });
    await gates.cameraEvent(device.key, { plate: '1234567', direction: 'entry' });
    await gates.checkOverstays();
    expect(await violations()).toHaveLength(0);

    await db.parkingVisit.updateMany({ data: { enteredAt: minutes(15) } });
    await gates.checkOverstays();
    await gates.checkOverstays();
    let issued = await violations();
    expect(issued).toHaveLength(1);
    expect(issued[0]).toMatchObject({ type: 'no_active_parking', amount: 5000, reason: 'Parked without paying' });
    expect(issued[0]!.evidence).toMatchObject({ detectionSource: 'fixed_camera', detectedPlate: '1234567' });

    await db.parkingVisit.updateMany({ data: { enteredAt: minutes(200) } });
    await gates.checkOverstays();
    issued = await violations();
    expect(issued.map((v) => v.amount)).toEqual([5000, 5000, 2000]); // capped at ₪120 for the stay

    await gates.cameraEvent(device.key, { plate: '1234567', direction: 'exit' });
    await db.parkingVisit.updateMany({ data: { enteredAt: minutes(500) } });
    await gates.checkOverstays();
    expect(await violations()).toHaveLength(3);
  });

  it('warns when prepaid time ends, then charges an overstay; extending restarts the clock', async () => {
    await gates.staffEnter(operator, { zoneId: 'city-lot', plate: '1234567' });
    const s = await sessions.start(driver, { vehicleId, zoneId: 'city-lot', mode: 'prepaid', durationMinutes: 30, entryMethod: 'qr' }, randomUUID());
    await gates.checkOverstays();
    expect(await violations()).toHaveLength(0);

    await db.parkingSession.update({ where: { id: s.id }, data: { startedAt: minutes(35), endsAt: minutes(5) } });
    await db.parkingVisit.updateMany({ data: { enteredAt: minutes(36) } });
    await gates.checkOverstays();
    expect(await db.notification.count({ where: { userId: driver, type: 'overstay_warning' } })).toBe(1);
    expect(await violations()).toHaveLength(0);

    await db.parkingSession.update({ where: { id: s.id }, data: { startedAt: minutes(45), endsAt: minutes(15) } });
    await db.parkingVisit.updateMany({ data: { enteredAt: minutes(46) } });
    await gates.checkOverstays();
    const issued = await violations();
    expect(issued).toHaveLength(1);
    expect(issued[0]).toMatchObject({ type: 'expired_parking', reason: 'Parking time ended and the car stayed' });

    // Paying again covers the car; nothing new is issued while covered.
    await sessions.expireSessions();
    await sessions.start(driver, { vehicleId, zoneId: 'city-lot', mode: 'prepaid', durationMinutes: 60, entryMethod: 'qr' }, randomUUID());
    await gates.checkOverstays();
    expect(await violations()).toHaveLength(1);
  });

  it('labels private lots as fees and only flags unregistered plates', async () => {
    await db.operatorUser.create({ data: { operatorId: 'mall', userId: operator.userId } });
    await gates.staffEnter(operator, { zoneId: 'mall-lot', plate: '1234567' });
    const stranger = await gates.staffEnter(operator, { zoneId: 'mall-lot', plate: '7654321' });
    expect(stranger.registered).toBe(false);
    await db.parkingVisit.updateMany({ data: { enteredAt: minutes(15) } });
    await gates.checkOverstays();
    const issued = await violations();
    expect(issued).toHaveLength(1);
    expect(issued[0]!.reason).toBe('Unpaid parking fee charged by mall operator');
    expect(await db.violation.count({ where: { plateNumber: '7654321' } })).toBe(0);
    const visits = await gates.visits(operator, 'mall-lot');
    expect(visits.find((v) => v.plateNumber === '7654321')?.status).toBe('unregistered');
    expect(visits.find((v) => v.plateNumber === '1234567')).toMatchObject({ status: 'overstaying', violationCount: 1 });
  });
});

describe('reviewed gate coverage and transaction guarantees', () => {
  const permit = (zoneId: string, validTo: Date) => db.permit.create({ data: {
    userId: driver, vehicleId, type: 'resident', issuer: 'Municipality', status: 'active',
    validFrom: minutes(120), validTo, zones: { create: { zoneId } },
  } });

  it('honors a valid permit at its lot for gate entry, overstay checks and patrol', async () => {
    await permit('city-lot', new Date(Date.now() + 60 * 60_000));
    const entered = await gates.staffEnter(operator, { zoneId: 'city-lot', plate: '1234567' });
    expect(entered.status).toBe('covered');
    await db.parkingVisit.update({ where: { id: entered.id }, data: { enteredAt: minutes(30) } });
    await gates.checkOverstays();
    expect(await violations()).toHaveLength(0);
    expect(await db.notification.count({ where: { userId: driver, type: 'gate_entry' } })).toBe(0);
    expect(await gates.patrolCheck(officer, 'city-lot', '1234567')).toMatchObject({ allowed: true, reason: 'permit' });
  });

  it('does not start or charge metered parking for a valid permit holder entering by QR', async () => {
    await permit('city-lot', new Date(Date.now() + 60 * 60_000));
    const balance = (await db.wallet.findUniqueOrThrow({ where: { userId: driver } })).balance;
    const pass = await gates.gatePass(driver, vehicleId);
    const entered = await gates.staffEnter(operator, { zoneId: 'city-lot', pass: pass.value });
    const replayed = await gates.staffEnter(operator, { zoneId: 'city-lot', pass: pass.value });
    expect(entered).toMatchObject({ status: 'covered', entrySource: 'qr' });
    expect(replayed.id).toBe(entered.id);
    expect(entered.sessionId).toBeUndefined();
    expect(await db.parkingSession.count({ where: { vehicleId } })).toBe(0);
    await gates.staffExit(operator, { zoneId: 'city-lot', pass: pass.value });
    expect((await db.wallet.findUniqueOrThrow({ where: { userId: driver } })).balance).toBe(balance);
    expect(await db.walletTransaction.count({ where: { type: 'parking_payment' } })).toBe(0);
    expect(await violations()).toHaveLength(0);
  });

  it('keeps a long-running metered session covered when the driver enters later by QR', async () => {
    const session = await sessions.start(driver, { vehicleId, zoneId: 'city-lot', mode: 'start_stop', entryMethod: 'qr' }, randomUUID());
    await db.parkingSession.update({ where: { id: session.id }, data: { startedAt: minutes(180) } });
    const entered = await gates.staffEnter(operator, { zoneId: 'city-lot', pass: (await gates.gatePass(driver, vehicleId)).value });
    expect(entered).toMatchObject({ status: 'covered', sessionId: session.id });
    await db.parkingVisit.update({ where: { id: entered.id }, data: { enteredAt: minutes(20) } });
    await gates.checkOverstays();
    expect(await violations()).toHaveLength(0);
    expect((await gates.visits(operator, 'city-lot'))[0]!.status).toBe('covered');
  });

  it('keeps long prepaid parking covered when a camera records entry more than two hours after payment', async () => {
    const session = await sessions.start(driver, { vehicleId, zoneId: 'city-lot', mode: 'prepaid', durationMinutes: 240, entryMethod: 'qr' }, randomUUID());
    await db.parkingSession.update({ where: { id: session.id }, data: { startedAt: minutes(180), endsAt: new Date(Date.now() + 60 * 60_000) } });
    const entered = await gates.enter({ zoneId: 'city-lot', plate: '1234567', source: 'camera' });
    expect(entered.status).toBe('covered');
    await db.parkingVisit.update({ where: { id: entered.id }, data: { enteredAt: minutes(20) } });
    await gates.checkOverstays(new Date(Date.now() + 45 * 60_000));
    expect(await violations()).toHaveLength(0);
    expect(await db.notification.count({ where: { userId: driver, type: 'gate_entry' } })).toBe(0);
  });

  it('uses the actual stop time of an old metered session for grace after entry', async () => {
    const session = await sessions.start(driver, { vehicleId, zoneId: 'city-lot', mode: 'start_stop', entryMethod: 'qr' }, randomUUID());
    await db.parkingSession.update({ where: { id: session.id }, data: { startedAt: minutes(240) } });
    const entered = await gates.enter({ zoneId: 'city-lot', plate: '1234567', source: 'camera' });
    await db.parkingVisit.update({ where: { id: entered.id }, data: { enteredAt: minutes(30) } });
    await sessions.stop(driver, session.id, randomUUID());
    const stopped = await db.parkingSession.findUniqueOrThrow({ where: { id: session.id } });
    await gates.checkOverstays(new Date(stopped.stoppedAt!.getTime() + 5 * 60_000));
    expect(await violations()).toHaveLength(0);
    const grace = (await gates.visits(operator, 'city-lot'))[0]!;
    expect(grace.status).toBe('grace');
    expect(new Date(grace.graceEndsAt!).getTime()).toBe(stopped.stoppedAt!.getTime() + 10 * 60_000);
    await gates.checkOverstays(new Date(stopped.stoppedAt!.getTime() + 11 * 60_000));
    expect((await violations())[0]).toMatchObject({ type: 'expired_parking', amount: 5000 });
  });

  it.each(['start_stop', 'prepaid'] as const)('excludes a %s session that ended before this visit', async mode => {
    const session = await sessions.start(driver, { vehicleId, zoneId: 'city-lot', mode, ...(mode === 'prepaid' ? { durationMinutes: 30 } : {}), entryMethod: 'qr' }, randomUUID());
    await db.parkingSession.update({ where: { id: session.id }, data: {
      startedAt: minutes(180), stoppedAt: minutes(30), endsAt: minutes(30),
      status: mode === 'prepaid' ? 'EXPIRED' : 'COMPLETED',
    } });
    const entered = await gates.enter({ zoneId: 'city-lot', plate: '1234567', source: 'camera' });
    expect(entered.status).toBe('grace');
    await db.parkingVisit.update({ where: { id: entered.id }, data: { enteredAt: minutes(15) } });
    await gates.checkOverstays();
    expect((await violations())[0]).toMatchObject({ type: 'no_active_parking', amount: 5000 });
  });

  it('starts the grace period from permit expiry and warns before issuing an expired-parking violation', async () => {
    const permission = await permit('city-lot', minutes(5));
    await db.permit.update({ where: { id: permission.id }, data: { status: 'expired' } });
    await gates.staffEnter(operator, { zoneId: 'city-lot', plate: '1234567' });
    await db.parkingVisit.updateMany({ data: { enteredAt: minutes(60) } });
    await gates.checkOverstays();
    expect(await violations()).toHaveLength(0);
    expect(await db.notification.count({ where: { userId: driver, type: 'overstay_warning' } })).toBe(1);
    const grace = (await gates.visits(operator, 'city-lot'))[0]!;
    expect(grace.status).toBe('grace');
    expect(new Date(grace.graceEndsAt!).getTime()).toBe(permission.validTo.getTime() + 10 * 60_000);
    await gates.checkOverstays(new Date(permission.validTo.getTime() + 11 * 60_000));
    expect((await violations())[0]).toMatchObject({ type: 'expired_parking', amount: 5000 });
  });

  it('does not apply another lot permit to an unpaid stay', async () => {
    await permit('mall-lot', new Date(Date.now() + 60 * 60_000));
    await gates.staffEnter(operator, { zoneId: 'city-lot', plate: '1234567' });
    await db.parkingVisit.updateMany({ data: { enteredAt: minutes(15) } });
    await gates.checkOverstays();
    expect((await violations())[0]).toMatchObject({ type: 'no_active_parking', amount: 5000 });
  });

  it('rechecks an exited visit after the worker collected an open-visit snapshot', async () => {
    const entered = await gates.staffEnter(operator, { zoneId: 'city-lot', plate: '1234567' });
    await db.parkingVisit.update({ where: { id: entered.id }, data: { enteredAt: minutes(20) } });
    const snapshot = await db.parkingVisit.findMany({ where: { id: entered.id }, include: { zone: { include: { operator: true } } } });
    await db.parkingVisit.update({ where: { id: entered.id }, data: { exitedAt: new Date(), exitSource: 'camera' } });
    const scan = vi.spyOn(db.parkingVisit, 'findMany').mockResolvedValueOnce(snapshot);
    try { await gates.checkOverstays(); } finally { scan.mockRestore(); }
    expect(await violations()).toHaveLength(0);
  });

  it('rechecks newly started coverage when a session commits before the overstay transaction', async () => {
    await gates.staffEnter(operator, { zoneId: 'city-lot', plate: '1234567' });
    await db.parkingVisit.updateMany({ data: { enteredAt: minutes(20) } });
    const original = database.atomic;
    const boundary = vi.spyOn(database, 'atomic').mockImplementationOnce(async fn => {
      await sessions.start(driver, { vehicleId, zoneId: 'city-lot', mode: 'start_stop', entryMethod: 'qr' }, randomUUID());
      return original(fn);
    });
    try { await gates.checkOverstays(); expect(boundary).toHaveBeenCalled(); } finally { boundary.mockRestore(); }
    expect(await violations()).toHaveLength(0);
  });

  it('rechecks an extension committed before charging and uses the new paid end for grace', async () => {
    await gates.staffEnter(operator, { zoneId: 'city-lot', plate: '1234567' });
    const session = await sessions.start(driver, { vehicleId, zoneId: 'city-lot', mode: 'prepaid', durationMinutes: 30, entryMethod: 'qr' }, randomUUID());
    const original = database.atomic;
    const boundary = vi.spyOn(database, 'atomic').mockImplementationOnce(async fn => {
      await sessions.extend(driver, session.id, 60, randomUUID());
      return original(fn);
    });
    try { await gates.checkOverstays(new Date(session.endsAt!.getTime() + 15 * 60_000)); expect(boundary).toHaveBeenCalled(); } finally { boundary.mockRestore(); }
    expect(await violations()).toHaveLength(0);
    const extended = await db.parkingSession.findUniqueOrThrow({ where: { id: session.id } });
    await gates.checkOverstays(new Date(extended.endsAt!.getTime() + 5 * 60_000));
    expect(await violations()).toHaveLength(0);
    await gates.checkOverstays(new Date(extended.endsAt!.getTime() + 11 * 60_000));
    expect(await violations()).toHaveLength(1);
  });

  it.each(['closure', 'hours', 'tariff'] as const)('rolls back a QR visit when session start fails because of %s', async failure => {
    if (failure === 'closure') await db.parkingClosure.create({ data: { zoneId: 'city-lot', startsAt: minutes(1), endsAt: new Date(Date.now() + 60 * 60_000), reason: 'Closed' } });
    if (failure === 'hours') await db.operatingHour.updateMany({ where: { zoneId: 'city-lot' }, data: { closed: true } });
    if (failure === 'tariff') await db.parkingTariff.deleteMany({ where: { zoneId: 'city-lot' } });
    const expected = failure === 'closure' ? 'PARKING_CLOSED' : failure === 'hours' ? 'ZONE_CLOSED' : 'NOT_FOUND';
    await expect(gates.staffEnter(operator, { zoneId: 'city-lot', pass: (await gates.gatePass(driver, vehicleId)).value })).rejects.toMatchObject({ code: expected });
    expect(await db.parkingVisit.count()).toBe(0);
    expect(await db.parkingSession.count()).toBe(0);
    await gates.checkOverstays(new Date(Date.now() + 30 * 60_000));
    expect(await violations()).toHaveLength(0);
  });

  it('preserves a camera visit at another lot when a QR session cannot start', async () => {
    const recorded = await gates.enter({ zoneId: 'mall-lot', plate: '1234567', source: 'camera' });
    await db.parkingClosure.create({ data: { zoneId: 'city-lot', startsAt: minutes(1), endsAt: new Date(Date.now() + 60 * 60_000), reason: 'Closed' } });
    await expect(gates.staffEnter(operator, { zoneId: 'city-lot', pass: (await gates.gatePass(driver, vehicleId)).value })).rejects.toMatchObject({ code: 'PARKING_CLOSED' });
    expect(await db.parkingVisit.count()).toBe(1);
    expect(await db.parkingVisit.findUniqueOrThrow({ where: { id: recorded.id } })).toMatchObject({ parkingZoneId: 'mall-lot', entrySource: 'camera', exitedAt: null });
  });
});

describe('officer patrol', () => {
  it('gives gate-tracked cars their grace period and never double-charges them', async () => {
    await gates.staffEnter(operator, { zoneId: 'city-lot', plate: '1234567' });
    expect(await gates.patrolCheck(officer, 'city-lot', '1234567')).toMatchObject({ allowed: false, reason: 'grace', gateTracked: true });
    await expect(gates.patrolIssue(officer, 'city-lot', '1234567')).rejects.toMatchObject({ code: 'IN_GRACE_PERIOD' });
    await db.parkingVisit.updateMany({ data: { enteredAt: minutes(11) } });
    expect(await gates.patrolCheck(officer, 'city-lot', '1234567')).toMatchObject({ reason: 'unpaid', gateTracked: true });
    await expect(gates.patrolIssue(officer, 'city-lot', '1234567')).rejects.toMatchObject({ code: 'GATE_TRACKED' });
    expect(await violations()).toHaveLength(1); // the one the overstay checker issued
  });

  it('checks a plate and issues one violation for a car without valid parking', async () => {
    // Street parking with no gate: the officer is the only check.
    expect(await gates.patrolCheck(officer, 'city-lot', '1234567')).toMatchObject({ registered: true, allowed: false, reason: 'unpaid', gateTracked: false });
    const issued = await gates.patrolIssue(officer, 'city-lot', '1234567');
    expect(issued).toMatchObject({ type: 'no_active_parking', amount: 5000 });
    await expect(gates.patrolIssue(officer, 'city-lot', '1234567')).rejects.toMatchObject({ code: 'ALREADY_ISSUED' });
    await expect(gates.patrolIssue(officer, 'city-lot', '9999999')).rejects.toMatchObject({ code: 'UNREGISTERED_PLATE' });

    await sessions.start(driver, { vehicleId, zoneId: 'city-lot', mode: 'start_stop', entryMethod: 'qr' }, randomUUID());
    expect(await gates.patrolCheck(officer, 'city-lot', '1234567')).toMatchObject({ allowed: true, reason: 'paid' });
    expect((await violations())[0]!.evidence).toMatchObject({ detectionSource: 'inspector', officerId: officer.userId });
  });
});
