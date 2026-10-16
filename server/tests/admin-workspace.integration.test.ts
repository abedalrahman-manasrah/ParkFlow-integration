import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { db } from '../src/database/client';
import { redis } from '../src/database/redis';
import * as auth from '../src/modules/auth/service';
import { emailProvider } from '../src/providers/email';

const app = createApp();
let administrator: Awaited<ReturnType<typeof auth.verifyOtp>>;
let driver: Awaited<ReturnType<typeof auth.verifyOtp>>;

async function signIn(email: string) {
  const challenge = await auth.requestOtp({ email });
  const code = vi.mocked(emailProvider.sendOtp).mock.calls.at(-1)![1];
  return auth.verifyOtp({ challengeId: challenge.challengeId, code }, {});
}

async function createAppeal(status: 'submitted' | 'under_review' | 'more_info' | 'approved' | 'rejected' = 'submitted') {
  const violation = await db.violation.create({ data: {
    vehicleId: 'admin-test-vehicle', plateNumber: '4455667', type: 'expired_parking',
    status: 'appealed', amount: 2500, locationName: 'Test zone', locationNameAr: 'منطقة تجريبية',
    latitude: 31.9, longitude: 35.2, dueAt: new Date(Date.now() + 86400000),
    reason: 'The parking time expired', reasonAr: 'انتهى وقت الوقوف',
    issuingAuthority: 'Test authority', issuingAuthorityAr: 'جهة تجريبية',
  } });
  return db.appeal.create({ data: {
    userId: driver.user.id, violationId: violation.id, reason: 'technical_issue',
    notes: 'The parking payment was not recognized.', status,
  } });
}

beforeEach(async () => {
  vi.restoreAllMocks();
  // OTP delivery is the only external side effect; auth and authorization remain real.
  vi.spyOn(emailProvider, 'sendOtp').mockResolvedValue();
  const tables = await db.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> '_prisma_migrations'`;
  await db.$executeRawUnsafe('TRUNCATE ' + tables.map((table) => '"' + table.tablename.replace(/"/g, '""') + '"').join(',') + ' CASCADE');
  await redis.flushdb();
  administrator = await signIn('admin-workspace@example.com');
  driver = await signIn('driver-workspace@example.com');
  await db.user.update({ where: { id: administrator.user.id }, data: { role: 'ADMIN', fullName: 'Test Administrator' } });
  await db.user.update({ where: { id: driver.user.id }, data: { fullName: 'Test Driver' } });
  await db.vehicle.create({ data: { id: 'admin-test-vehicle', plateNumber: '4455667', users: { create: { userId: driver.user.id } } } });
  await db.roadCheckpoint.create({ data: { id: 'admin-test-checkpoint', nameEn: 'North entrance', nameAr: 'المدخل الشمالي', latitude: 31.9, longitude: 35.2 } });
});

describe('admin workspace API', () => {
  it('does not expose the administrative summary to anonymous or ordinary users', async () => {
    expect((await request(app).get('/api/v1/admin/summary')).status).toBe(401);
    expect((await request(app).get('/api/v1/admin/summary').auth(driver.session.accessToken, { type: 'bearer' })).status).toBe(403);
  });

  it('counts the whole database rather than a capped list page', async () => {
    await db.user.createMany({ data: Array.from({ length: 205 }, (_, index) => ({ email: `summary-active-${index}@example.com` })) });
    await db.user.createMany({ data: Array.from({ length: 3 }, (_, index) => ({ email: `summary-suspended-${index}@example.com`, status: 'SUSPENDED' as const })) });
    await db.parkingOperator.create({ data: { id: 'admin-test-operator', name: 'Test Operator' } });
    await db.parkingZone.createMany({ data: [true, true, false].map((active, index) => ({
      id: `admin-test-zone-${index}`, code: `ADMIN-TEST-${index}`, operatorId: 'admin-test-operator',
      name: 'Test zone', nameAr: 'منطقة تجريبية', city: 'Ramallah', cityAr: 'رام الله',
      latitude: 31.9, longitude: 35.2, kind: 'lot', active,
      defaultMode: 'start_stop' as const, supportedModes: ['start_stop' as const], supportedEntryMethods: ['manual'],
    })) });
    await db.checkpointReport.createMany({ data: [false, false, true].map((hidden) => ({ userId: driver.user.id, checkpointId: 'admin-test-checkpoint', status: 'open' as const, hidden })) });
    for (const status of ['submitted', 'under_review', 'more_info', 'approved', 'rejected'] as const) await createAppeal(status);
    await db.parkingReservation.createMany({ data: (['confirmed', 'cancelled', 'expired', 'checked_in', 'completed'] as const).map((status, index) => ({
      parkingZoneId: 'admin-test-zone-0', userId: driver.user.id,
      startTime: new Date(), endTime: new Date(Date.now() + 3600000), durationMinutes: 60,
      hourlyRateSnapshot: 500, estimatedTotalPriceSnapshot: 500, status,
      publicCode: `ADMIN-RES-${index}`, qrToken: `admin-reservation-token-${index}`,
    })) });

    const response = await request(app).get('/api/v1/admin/summary').auth(administrator.session.accessToken, { type: 'bearer' });
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ activeUsers: 207, suspendedUsers: 3, activeZones: 2, visibleReports: 2, openAppeals: 3, totalReservations: 5, checkedInReservations: 2 });
  });

  it('provides email addresses for identifying users in administration', async () => {
    const response = await request(app).get('/api/v1/admin/users').auth(administrator.session.accessToken, { type: 'bearer' });
    expect(response.status).toBe(200);
    expect(response.body).toEqual(expect.arrayContaining([expect.objectContaining({ id: driver.user.id, email: 'driver-workspace@example.com' })]));
  });

  it('finds older accounts by email, name, phone, or ID beyond the latest 200 users', async () => {
    await db.user.update({ where: { id: driver.user.id }, data: { fullName: 'Older Parking Owner', phone: '+970599000123', createdAt: new Date('2020-01-01T00:00:00Z') } });
    await db.user.createMany({ data: Array.from({ length: 205 }, (_, index) => ({ email: `recent-search-${index}@example.com`, createdAt: new Date('2026-10-16T12:00:00Z') })) });
    const latest = await request(app).get('/api/v1/admin/users').auth(administrator.session.accessToken, { type: 'bearer' });
    expect(latest.body).toHaveLength(200);
    expect(latest.body.some((entry: { id: string }) => entry.id === driver.user.id)).toBe(false);
    for (const query of ['DRIVER-WORKSPACE@EXAMPLE.COM', 'older parking', '+970599000123', driver.user.id]) {
      const response = await request(app).get('/api/v1/admin/users').query({ query }).auth(administrator.session.accessToken, { type: 'bearer' });
      expect(response.status).toBe(200);
      expect(response.body).toEqual([expect.objectContaining({ id: driver.user.id })]);
    }
    expect((await request(app).get('/api/v1/admin/users').query({ query: 'x'.repeat(201) }).auth(administrator.session.accessToken, { type: 'bearer' })).status).toBe(400);
    expect((await request(app).get('/api/v1/admin/users').query({ query: 'owner' }).auth(driver.session.accessToken, { type: 'bearer' })).status).toBe(403);
  });
  it('persists a permission change, revokes sessions, and identifies the audit actor', async () => {
    const response = await request(app).patch(`/api/v1/admin/users/${driver.user.id}`).auth(administrator.session.accessToken, { type: 'bearer' }).send({ role: 'PARKING_OPERATOR', status: 'SUSPENDED' });
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ id: driver.user.id, role: 'PARKING_OPERATOR', status: 'SUSPENDED' });
    expect((await request(app).get('/api/v1/auth/me').auth(driver.session.accessToken, { type: 'bearer' })).status).toBe(401);
    const audit = await request(app).get('/api/v1/admin/audit-logs').auth(administrator.session.accessToken, { type: 'bearer' });
    expect(audit.body).toEqual(expect.arrayContaining([expect.objectContaining({
      action: 'permissions', resourceId: driver.user.id,
      actor: expect.objectContaining({ fullName: 'Test Administrator', email: 'admin-workspace@example.com' }),
      before: { role: 'USER', status: 'ACTIVE' }, after: { role: 'PARKING_OPERATOR', status: 'SUSPENDED' },
    })]));
  });

  it('rejects self-permission changes without revoking the current admin session', async () => {
    const response = await request(app).patch(`/api/v1/admin/users/${administrator.user.id}`).auth(administrator.session.accessToken, { type: 'bearer' }).send({ role: 'USER', status: 'SUSPENDED' });
    expect(response.status).toBe(400);
    expect((await request(app).get('/api/v1/admin/summary').auth(administrator.session.accessToken, { type: 'bearer' })).status).toBe(200);
    expect(await db.auditLog.count()).toBe(0);
  });

  it('gives context for a report and persists moderation with point revocation', async () => {
    const report = await db.checkpointReport.create({ data: { checkpointId: 'admin-test-checkpoint', userId: driver.user.id, status: 'closed', points: { create: { userId: driver.user.id, points: 5, reason: 'road_report', state: 'verified', placeId: 'admin-test-checkpoint' } } } });
    const list = await request(app).get('/api/v1/admin/road-reports').auth(administrator.session.accessToken, { type: 'bearer' });
    expect(list.body[0]).toMatchObject({ id: report.id, checkpoint: { nameEn: 'North entrance', nameAr: 'المدخل الشمالي' }, user: { fullName: 'Test Driver' } });
    const hidden = await request(app).patch(`/api/v1/admin/road-reports/${report.id}`).auth(administrator.session.accessToken, { type: 'bearer' }).send({ hidden: true });
    expect(hidden.status).toBe(200);
    expect((await db.checkpointReport.findUniqueOrThrow({ where: { id: report.id } })).hidden).toBe(true);
    expect((await db.pointsEntry.findFirstOrThrow({ where: { roadReportId: report.id } })).state).toBe('revoked');
    expect(await db.auditLog.count({ where: { resourceId: report.id, action: 'moderate' } })).toBe(1);
    const restored = await request(app).patch(`/api/v1/admin/road-reports/${report.id}`).auth(administrator.session.accessToken, { type: 'bearer' }).send({ hidden: false });
    expect(restored.body.hidden).toBe(false);
  });

  it('shows the appellant and violation details before a decision', async () => {
    const appeal = await createAppeal();
    const response = await request(app).get('/api/v1/admin/appeals').auth(administrator.session.accessToken, { type: 'bearer' });
    expect(response.status).toBe(200);
    expect(response.body[0]).toMatchObject({
      id: appeal.id, notes: 'The parking payment was not recognized.',
      user: { fullName: 'Test Driver', email: 'driver-workspace@example.com' },
      violation: { plateNumber: '4455667', reason: 'The parking time expired', reasonAr: 'انتهى وقت الوقوف', amount: 2500, status: 'appealed' },
    });
  });

  it('applies one final appeal decision and refuses a stale second decision', async () => {
    const appeal = await createAppeal();
    const first = await request(app).patch(`/api/v1/admin/appeals/${appeal.id}`).auth(administrator.session.accessToken, { type: 'bearer' }).send({ status: 'approved', decisionNote: 'Payment evidence accepted.' });
    expect(first.status).toBe(200);
    expect(first.body.status).toBe('approved');
    const stale = await request(app).patch(`/api/v1/admin/appeals/${appeal.id}`).auth(administrator.session.accessToken, { type: 'bearer' }).send({ status: 'rejected', decisionNote: 'Another stale decision.' });
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe('APPEAL_ALREADY_DECIDED');
    expect((await db.violation.findUniqueOrThrow({ where: { id: appeal.violationId } })).status).toBe('cancelled');
    expect(await db.notification.count({ where: { userId: driver.user.id, type: 'appeal_updated' } })).toBe(1);
    expect(await db.auditLog.count({ where: { resourceId: appeal.id, action: 'decide' } })).toBe(1);
  });

  it('allows only one competing terminal decision to commit', async () => {
    const appeal = await createAppeal();
    const results = await Promise.all((['approved', 'rejected'] as const).map((status) => request(app).patch(`/api/v1/admin/appeals/${appeal.id}`).auth(administrator.session.accessToken, { type: 'bearer' }).send({ status, decisionNote: 'Concurrent review decision.' })));
    expect(results.map((result) => result.status).sort()).toEqual([200, 409]);
    expect(await db.auditLog.count({ where: { resourceId: appeal.id, action: 'decide' } })).toBe(1);
  });

  it('restores overdue status after rejecting an appeal past the due date', async () => {
    const appeal = await createAppeal();
    await db.violation.update({ where: { id: appeal.violationId }, data: { dueAt: new Date(Date.now() - 86400000) } });
    const result = await request(app).patch(`/api/v1/admin/appeals/${appeal.id}`).auth(administrator.session.accessToken, { type: 'bearer' }).send({ status: 'rejected', decisionNote: 'The original violation is valid.' });
    expect(result.status).toBe(200);
    expect((await db.violation.findUniqueOrThrow({ where: { id: appeal.violationId } })).status).toBe('overdue');
  });

  it.each(['approved', 'rejected'] as const)('does not overwrite a paid violation when an appeal is %s', async (status) => {
    const appeal = await createAppeal();
    const paidAt = new Date();
    await db.violation.update({ where: { id: appeal.violationId }, data: { status: 'paid', paidAt, paymentTransactionId: 'payment-reference' } });
    const result = await request(app).patch(`/api/v1/admin/appeals/${appeal.id}`).auth(administrator.session.accessToken, { type: 'bearer' }).send({ status, decisionNote: 'Review after payment.' });
    expect(result.status).toBe(409);
    expect(result.body.error.code).toBe('APPEAL_VIOLATION_STATE_CHANGED');
    expect((await db.appeal.findUniqueOrThrow({ where: { id: appeal.id } })).status).toBe('submitted');
    expect(await db.violation.findUniqueOrThrow({ where: { id: appeal.violationId } })).toMatchObject({ status: 'paid', paidAt, paymentTransactionId: 'payment-reference' });
    expect(await db.auditLog.count()).toBe(0);
    expect(await db.notification.count()).toBe(0);
  });
});
