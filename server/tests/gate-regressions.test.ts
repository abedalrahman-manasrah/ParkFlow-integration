import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db, atomic } from '../src/database/client';
import * as database from '../src/database/client';
import * as gates from '../src/modules/gates/service';
import * as admin from '../src/modules/admin/service';
import * as sessions from '../src/modules/sessions/service';
import * as ledger from '../src/modules/wallet/ledger';
import * as vehicles from '../src/modules/vehicles/service';

function requireTestDatabase() {
  const url = process.env.DATABASE_URL;
  if (!url || !new URL(url).pathname.endsWith('_test')) {
    throw new Error('Refusing to run money audit probes outside a dedicated *_test database');
  }
}

beforeEach(async () => {
  requireTestDatabase();
  vi.restoreAllMocks();
  const tables = await db.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> '_prisma_migrations'`;
  await db.$executeRawUnsafe('TRUNCATE ' + tables.map(t => '"' + t.tablename.replace(/"/g, '""') + '"').join(',') + ' CASCADE');
});

async function person(name: string, credit = 0, role: 'USER' | 'ADMIN' = 'USER') {
  const user = await db.user.create({ data: {
    email: `${randomUUID()}@audit.example.com`, emailVerifiedAt: new Date(),
    fullName: name, role, wallet: { create: {} },
  } });
  if (credit) await atomic(tx => ledger.post(tx, user.id, {
    amount: credit, type: 'adjustment', title: 'Audit fixture credit', titleAr: 'Audit fixture credit',
  }));
  return user.id;
}

async function zoneFixture(operatorId?: string) {
  const operator = operatorId ?? (await db.parkingOperator.create({ data: { name: `Audit municipality ${randomUUID()}` } })).id;
  return db.parkingZone.create({ data: {
    operatorId: operator, code: `AUDIT-${randomUUID()}`, name: 'Audit lot', nameAr: 'Audit lot',
    city: 'Ramallah', cityAr: 'Ramallah', latitude: 31.9, longitude: 35.2, kind: 'lot',
    defaultMode: 'start_stop', supportedModes: ['start_stop', 'prepaid'], supportedEntryMethods: ['manual', 'qr'],
    overstayGraceMinutes: 10, overstayFee: 5000, overstayRepeatMinutes: 60, overstayMaxPerStay: 12000,
    tariffs: { create: { name: 'Audit rate', hourlyRate: 600, incrementMinutes: 15, freeMinutes: 0, minimumCharge: 100, validFrom: new Date('2020-01-01') } },
    operatingHours: { create: Array.from({ length: 7 }, (_, weekday) => ({ weekday, opensAt: '00:00', closesAt: '00:00' })) },
  } });
}

async function gateFixture() {
  const staffId = await person('Audit Administrator', 0, 'ADMIN');
  const driverId = await person('Audit Driver', 10000);
  const zone = await zoneFixture();
  const plateNumber = '98' + randomUUID().replace(/\D/g, '').slice(0, 8).padEnd(8, '0');
  const vehicle = await db.vehicle.create({ data: { plateNumber } });
  await db.userVehicle.create({ data: { userId: driverId, vehicleId: vehicle.id, role: 'owner', verifiedAt: new Date() } });
  return { staff: { userId: staffId, role: 'ADMIN' as const }, driverId, zone, vehicle };
}

describe('gate settlement and enforcement regressions', () => {
  it('keeps the physical visit recoverable if settling the metered exit fails', async () => {
    const { staff, driverId, zone, vehicle } = await gateFixture();
    const pass = (await gates.gatePass(driverId, vehicle.id)).value;
    const entered = await gates.staffEnter(staff, { zoneId: zone.id, pass });
    const failedPost = vi.spyOn(ledger, 'post').mockRejectedValueOnce(new Error('Injected exit settlement failure'));

    await expect(gates.staffExit(staff, { zoneId: zone.id, pass })).rejects.toThrow('Injected exit settlement failure');
    expect((await db.parkingSession.findUniqueOrThrow({ where: { id: entered.sessionId! } })).status).toBe('ACTIVE');
    expect((await db.parkingVisit.findUniqueOrThrow({ where: { id: entered.id } })).exitedAt).toBeNull();
    expect((await db.wallet.findUniqueOrThrow({ where: { userId: driverId } })).balance).toBe(10000);
    expect(await db.walletTransaction.count({ where: { type: 'parking_payment' } })).toBe(0);

    failedPost.mockRestore();
    await gates.staffExit(staff, { zoneId: zone.id, pass });
    expect((await db.parkingSession.findUniqueOrThrow({ where: { id: entered.sessionId! } })).status).toBe('COMPLETED');
    expect((await db.parkingVisit.findUniqueOrThrow({ where: { id: entered.id } })).exitedAt).not.toBeNull();
    expect(await db.walletTransaction.count({ where: { type: 'parking_payment' } })).toBe(1);
  });

  it('rechecks parking started after patrol preflight before issuing a ticket', async () => {
    const { staff, driverId, zone, vehicle } = await gateFixture();
    const originalAtomic = database.atomic;
    const boundary = vi.spyOn(database, 'atomic').mockImplementationOnce(async fn => {
      await sessions.start(driverId, { vehicleId: vehicle.id, zoneId: zone.id, mode: 'start_stop', entryMethod: 'manual' }, randomUUID());
      return originalAtomic(fn);
    });

    await expect(gates.patrolIssue(staff, zone.id, vehicle.plateNumber)).rejects.toMatchObject({ code: 'PARKING_VALID' });

    expect(boundary).toHaveBeenCalled();
    expect(await db.parkingSession.count({ where: { vehicleId: vehicle.id, status: 'ACTIVE' } })).toBe(1);
    expect(await db.violation.count({ where: { vehicleId: vehicle.id, parkingZoneId: zone.id } })).toBe(0);
  });

  it('does not let one camera future timestamp fine a freshly arrived car in another lot', async () => {
    const { staff, zone, vehicle } = await gateFixture();
    const otherZone = await zoneFixture(zone.operatorId);
    const device = await gates.createDevice(staff, otherZone.id, { name: 'Other lot camera', kind: 'camera' });
    await gates.staffEnter(staff, { zoneId: zone.id, plate: vehicle.plateNumber });

    await expect(gates.cameraEvent(device.key, {
      plate: '1234000000', direction: 'exit', at: new Date(Date.now() + 14 * 60_000).toISOString(),
    })).rejects.toMatchObject({ code: 'NOT_INSIDE' });

    expect(await db.violation.count({ where: { vehicleId: vehicle.id, parkingZoneId: zone.id } })).toBe(0);
  });

  it('does not fine parking committed while patrol waits for the shared zone lock', async () => {
    const { staff, driverId, zone, vehicle } = await gateFixture();
    let release!: () => void, locked!: () => void;
    const hold = new Promise<void>(resolve => { release = resolve; });
    const acquired = new Promise<void>(resolve => { locked = resolve; });
    const blocker = atomic(async tx => {
      await database.lock(tx, 'zone:' + zone.id);
      locked();
      await hold;
      await sessions.startInTransaction(tx, driverId, { vehicleId: vehicle.id, zoneId: zone.id, mode: 'start_stop', entryMethod: 'manual' });
    });
    await acquired;
    const issued = gates.patrolIssue(staff, zone.id, vehicle.plateNumber);
    void issued.catch(() => undefined);
    try {
      // Observe PostgreSQL's actual lock wait before letting the new session commit.
      const deadline = Date.now() + 5000;
      let blocked = false;
      while (!blocked && Date.now() < deadline) {
        const rows = await db.$queryRawUnsafe<Array<{ blocked: boolean }>>(
          "SELECT EXISTS (SELECT 1 FROM pg_locks WHERE locktype='advisory' AND NOT granted AND database=(SELECT oid FROM pg_database WHERE datname=current_database())) AS blocked",
        );
        blocked = rows[0]!.blocked;
        if (!blocked) await new Promise(resolve => setTimeout(resolve, 10));
      }
      expect(blocked).toBe(true);
      release();
      await blocker;
      await expect(issued).rejects.toMatchObject({ code: 'PARKING_VALID' });
      expect(await db.violation.count()).toBe(0);
      expect(await db.parkingSession.count({ where: { vehicleId: vehicle.id, status: 'ACTIVE' } })).toBe(1);
    } finally {
      release();
      await blocker;
      await issued.catch(() => undefined);
    }
  });

  it('rechecks prepaid parking committed after patrol preflight', async () => {
    const { staff, driverId, zone, vehicle } = await gateFixture();
    const originalAtomic = database.atomic;
    vi.spyOn(database, 'atomic').mockImplementationOnce(async fn => {
      await sessions.start(driverId, { vehicleId: vehicle.id, zoneId: zone.id, mode: 'prepaid', durationMinutes: 30, entryMethod: 'manual' }, randomUUID());
      return originalAtomic(fn);
    });
    await expect(gates.patrolIssue(staff, zone.id, vehicle.plateNumber)).rejects.toMatchObject({ code: 'PARKING_VALID' });
    expect(await db.violation.count()).toBe(0);
  });

  it('rechecks a gate entry after patrol preflight and preserves its grace', async () => {
    const { staff, zone, vehicle } = await gateFixture();
    const originalAtomic = database.atomic;
    vi.spyOn(database, 'atomic').mockImplementationOnce(async fn => {
      await gates.staffEnter(staff, { zoneId: zone.id, plate: vehicle.plateNumber });
      return originalAtomic(fn);
    });
    await expect(gates.patrolIssue(staff, zone.id, vehicle.plateNumber)).rejects.toMatchObject({ code: 'IN_GRACE_PERIOD' });
    expect(await db.parkingVisit.count({ where: { vehicleId: vehicle.id, exitedAt: null } })).toBe(1);
    expect(await db.violation.count()).toBe(0);
  });

  it('preserves tolerated future camera history without bringing a valid exit past grace', async () => {
    const { staff, zone, vehicle } = await gateFixture();
    const device = await gates.createDevice(staff, zone.id, { name: 'Lot camera', kind: 'camera' });
    const entered = await gates.staffEnter(staff, { zoneId: zone.id, plate: vehicle.plateNumber });
    const timestamp = new Date(Date.now() + 14 * 60_000).toISOString();
    const left = await gates.cameraEvent(device.key, { plate: vehicle.plateNumber, direction: 'exit', at: timestamp });
    expect(left).toMatchObject({ id: entered.id, status: 'left', exitedAt: timestamp, violationCount: 0 });
    expect(await db.violation.count()).toBe(0);
  });

  it('does not issue unrelated overdue charges when an exit has no recorded entry', async () => {
    const { staff, zone, vehicle } = await gateFixture();
    const entered = await gates.staffEnter(staff, { zoneId: zone.id, plate: vehicle.plateNumber });
    await db.parkingVisit.update({ where: { id: entered.id }, data: { enteredAt: new Date(Date.now() - 20 * 60_000) } });
    await expect(gates.staffExit(staff, { zoneId: zone.id, plate: '1234000000' })).rejects.toMatchObject({ code: 'NOT_INSIDE' });
    expect(await db.violation.count()).toBe(0);
  });

  it('charges a delayed camera exit only through its historical departure time', async () => {
    const { staff, driverId, zone, vehicle } = await gateFixture();
    const entered = await gates.staffEnter(staff, { zoneId: zone.id, pass: (await gates.gatePass(driverId, vehicle.id)).value });
    const clock = Date.now();
    await db.parkingSession.update({ where: { id: entered.sessionId! }, data: { startedAt: new Date(clock - 24 * 60_000) } });
    await db.parkingVisit.update({ where: { id: entered.id }, data: { enteredAt: new Date(clock - 24 * 60_000) } });
    const timestamp = new Date(clock - 10 * 60_000).toISOString();
    const device = await gates.createDevice(staff, zone.id, { name: 'Lot camera', kind: 'camera' });
    await gates.cameraEvent(device.key, { plate: vehicle.plateNumber, direction: 'exit', at: timestamp });
    expect(await db.parkingSession.findUniqueOrThrow({ where: { id: entered.sessionId! } })).toMatchObject({ status: 'COMPLETED', stoppedAt: new Date(timestamp), finalCost: 150 });
    expect((await db.wallet.findUniqueOrThrow({ where: { userId: driverId } })).balance).toBe(9850);
    expect(await db.violation.count()).toBe(0);
  });

  it('closes an insufficient-funds exit with one debt and no active metered session', async () => {
    const { staff, driverId, zone, vehicle } = await gateFixture();
    await db.wallet.update({ where: { userId: driverId }, data: { balance: 0 } });
    const pass = (await gates.gatePass(driverId, vehicle.id)).value;
    const entered = await gates.staffEnter(staff, { zoneId: zone.id, pass });
    await db.parkingSession.update({ where: { id: entered.sessionId! }, data: { startedAt: new Date(Date.now() - 59 * 60_000) } });
    const left = await gates.staffExit(staff, { zoneId: zone.id, pass });
    expect(left.status).toBe('left');
    expect(await db.parkingSession.findUniqueOrThrow({ where: { id: entered.sessionId! } })).toMatchObject({ status: 'PAYMENT_FAILED', paymentStatus: 'failed', finalCost: 600 });
    expect(await db.sessionDebt.findUniqueOrThrow({ where: { sessionId: entered.sessionId! } })).toMatchObject({ amount: 600, settledAt: null });
    await expect(gates.staffExit(staff, { zoneId: zone.id, pass })).rejects.toMatchObject({ code: 'NOT_INSIDE' });
    expect(await db.walletTransaction.count({ where: { type: 'parking_payment' } })).toBe(1);
    expect(await db.sessionDebt.count()).toBe(1);
  });

  it('rechecks a permit granted after patrol preflight before issuing a ticket', async () => {
    const { staff, driverId, zone, vehicle } = await gateFixture();
    const originalAtomic = database.atomic;
    vi.spyOn(database, 'atomic').mockImplementationOnce(async fn => {
      await admin.permit(staff, { userId: driverId, vehicleId: vehicle.id, type: 'resident', zoneIds: [zone.id], validFrom: new Date(Date.now() - 60_000).toISOString(), validTo: new Date(Date.now() + 60 * 60_000).toISOString(), status: 'active', issuer: 'Municipality' });
      return originalAtomic(fn);
    });
    await expect(gates.patrolIssue(staff, zone.id, vehicle.plateNumber)).rejects.toMatchObject({ code: 'PARKING_VALID' });
    expect(await db.permit.count({ where: { vehicleId: vehicle.id, status: 'active' } })).toBe(1);
    expect(await db.violation.count()).toBe(0);
  });

  it('does not start a QR session after unlink committed between its link read and session insert', async () => {
    const { staff, driverId, zone, vehicle } = await gateFixture();
    const pass = (await gates.gatePass(driverId, vehicle.id)).value;
    const originalAccess = vehicles.vehicleAccess;
    let unlinkBeforeInsert = true;
    vi.spyOn(vehicles, 'vehicleAccess').mockImplementation(async (tx, userId, vehicleId) => {
      const linked = await originalAccess(tx, userId, vehicleId);
      if (unlinkBeforeInsert && userId === driverId && vehicleId === vehicle.id) {
        unlinkBeforeInsert = false;
        // Commit the real unlink while gate entry has read the link but not inserted a session.
        await vehicles.unlink(driverId, vehicle.id);
      }
      return linked;
    });

    await expect(gates.staffEnter(staff, { zoneId: zone.id, pass })).rejects.toMatchObject({ code: 'INVALID_GATE_PASS' });

    expect((await db.userVehicle.findUniqueOrThrow({ where: { userId_vehicleId: { userId: driverId, vehicleId: vehicle.id } } })).unlinkedAt).not.toBeNull();
    expect(await db.parkingSession.count({ where: { vehicleId: vehicle.id, status: 'ACTIVE' } })).toBe(0);
    expect(await db.parkingVisit.count({ where: { vehicleId: vehicle.id } })).toBe(0);
  });
});
