import { afterEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { createApp } from '../src/app';
import { env } from '../src/config/env';
import { atomic, db } from '../src/database/client';
import * as admin from '../src/modules/admin/service';
import * as management from '../src/modules/management/service';
import * as auth from '../src/modules/auth/service';
import * as notifications from '../src/modules/notifications/service';
import { deliverPush } from '../src/providers/push';

const app = createApp();
const userIds: string[] = [];
const operatorIds: string[] = [];
const registeredDevices = new Map<string, string>();
const dispatched: string[] = [];

function mockProvider() {
  vi.stubGlobal('fetch', async (_url: unknown, init: RequestInit) => {
    const payload = JSON.parse(String(init.body)) as { to: string };
    dispatched.push(registeredDevices.get(payload.to) ?? 'unknown-device');
    return new Response(JSON.stringify({ data: { status: 'ok', id: 'test-only-ticket' } }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  });
}

async function account(role: 'USER' | 'ADMIN' = 'USER') {
  const user = await db.user.create({ data: {
    email: `push-lifecycle-${randomUUID()}@example.com`, role,
    emailVerifiedAt: new Date(), locale: 'en',
  } });
  userIds.push(user.id);
  const session = await atomic(tx => auth.issue(tx, user, { device: 'test-only-native-device' }));
  return { user, session, sid: auth.verifyAccess(session.accessToken).sid };
}

async function register(session: auth.NativeSession, label: string, token = `ExpoPushToken[${randomUUID().replaceAll('-', '')}]`) {
  registeredDevices.set(token, label);
  const result = await request(app).post('/api/v1/notifications/device-tokens')
    .auth(session.accessToken, { type: 'bearer' }).send({ token, platform: 'android', provider: 'expo' });
  expect(result.status).toBe(200);
  return token;
}

async function notification(userId: string) {
  return db.notification.create({ data: {
    userId, type: 'parking_started', title: 'Private parking event', titleAr: 'Private parking event',
    body: 'Test-only private parking location.', bodyAr: 'Test-only private parking location.',
    href: '/parking/active/test-only-session',
  } });
}

const allowed = (operation: Promise<unknown>) => operation.then(() => true, () => false);
function barrier() {
  let release!: () => void;
  const promise = new Promise<void>(resolve => { release = resolve; });
  return { promise, release };
}

afterEach(async () => {
  try {
    await db.auditLog.deleteMany({ where: { actorUserId: { in: userIds } } });
    await db.notification.deleteMany({ where: { userId: { in: userIds } } });
    await db.deviceToken.deleteMany({ where: { userId: { in: userIds } } });
    await db.operatorUser.deleteMany({ where: { operatorId: { in: operatorIds } } });
    await db.parkingOperator.deleteMany({ where: { id: { in: operatorIds } } });
    await db.refreshToken.deleteMany({ where: { userId: { in: userIds } } });
    await db.user.deleteMany({ where: { id: { in: userIds } } });
  } finally {
    userIds.length = 0;
    operatorIds.length = 0;
    registeredDevices.clear();
    dispatched.length = 0;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  }
});

describe('session-bound native push delivery', () => {
  it('does not send queued private content after logout-all completes', async () => {
    mockProvider();
    const owner = await account();
    await register(owner.session, 'logged-out-device');
    const queued = await notification(owner.user.id);
    await auth.logout(owner.user.id, owner.sid, true);
    expect(await allowed(auth.authenticate(owner.session.accessToken))).toBe(false);
    await deliverPush(queued.id);
    expect(dispatched).toEqual([]);
    expect(Boolean((await db.notification.findUniqueOrThrow({ where: { id: queued.id } })).pushedAt)).toBe(true);
  });

  it('keeps legacy registrations dormant even while an unrelated login is active', async () => {
    mockProvider();
    const owner = await account();
    await db.deviceToken.create({ data: {
      userId: owner.user.id, token: `ExpoPushToken[${randomUUID()}]`, provider: 'expo', platform: 'android',
    } });
    await deliverPush((await notification(owner.user.id)).id);
    expect(dispatched).toEqual([]);
  });

  it('delivers only to the other offline device after a single family logs out', async () => {
    mockProvider();
    const owner = await account();
    const independent = await atomic(tx => auth.issue(tx, owner.user, { device: 'independent-offline-device' }));
    await register(owner.session, 'logged-out-device');
    await register(independent, 'active-offline-device');
    await auth.logout(owner.user.id, owner.sid);
    await deliverPush((await notification(owner.user.id)).id);
    expect(dispatched).toEqual(['active-offline-device']);
    expect(await allowed(auth.authenticate(independent.accessToken))).toBe(true);
  });

  it('keeps a registration eligible through refresh rotation without client registration', async () => {
    mockProvider();
    const owner = await account();
    await register(owner.session, 'rotated-device');
    const rotated = await auth.refresh(owner.session.refreshToken, {});
    expect(await allowed(auth.authenticate(owner.session.accessToken))).toBe(false);
    expect(await allowed(auth.authenticate(rotated.accessToken))).toBe(true);
    await deliverPush((await notification(owner.user.id)).id);
    expect(dispatched).toEqual(['rotated-device']);
  });

  it('uses an earlier authenticated sid to revoke its rotating family only', async () => {
    mockProvider();
    const owner = await account();
    const independent = await atomic(tx => auth.issue(tx, owner.user, {}));
    await register(owner.session, 'rotating-device');
    await register(independent, 'other-device');
    const rotated = await auth.refresh(owner.session.refreshToken, {});
    await auth.logout(owner.user.id, owner.sid);
    expect(await allowed(auth.authenticate(rotated.accessToken))).toBe(false);
    await deliverPush((await notification(owner.user.id)).id);
    expect(dispatched).toEqual(['other-device']);
  });

  it('does not revive a logged-out registration when the same account signs in again', async () => {
    mockProvider();
    const owner = await account();
    await register(owner.session, 'old-device');
    await auth.logout(owner.user.id, owner.sid, true);
    await atomic(tx => auth.issue(tx, owner.user, {}));
    await deliverPush((await notification(owner.user.id)).id);
    expect(dispatched).toEqual([]);
  });

  it('does not send when the bound refresh session expired', async () => {
    mockProvider();
    const owner = await account();
    await register(owner.session, 'expired-device');
    await db.refreshToken.update({ where: { id: owner.sid }, data: { expiresAt: new Date(Date.now() - 1000) } });
    await deliverPush((await notification(owner.user.id)).id);
    expect(dispatched).toEqual([]);
  });

  it('does not send to a suspended account with an otherwise live family', async () => {
    mockProvider();
    const owner = await account();
    await register(owner.session, 'suspended-device');
    await db.user.update({ where: { id: owner.user.id }, data: { status: 'SUSPENDED' } });
    await deliverPush((await notification(owner.user.id)).id);
    expect(dispatched).toEqual([]);
  });

  it('enforces the admin family absolute deadline using its revoked ancestor', async () => {
    mockProvider();
    const owner = await account('ADMIN');
    await register(owner.session, 'expired-admin-device');
    await auth.refresh(owner.session.refreshToken, {});
    await db.refreshToken.update({ where: { id: owner.sid }, data: { createdAt: new Date(Date.now() - 8 * 60 * 60_000) } });
    await deliverPush((await notification(owner.user.id)).id);
    expect(dispatched).toEqual([]);
    expect(await db.refreshToken.count({ where: { userId: owner.user.id, revokedAt: null } })).toBe(0);
  });

  it('does not send through a development login after its authentication mode is disabled', async () => {
    mockProvider();
    const owner = await account();
    const previous = { NODE_ENV: env.NODE_ENV, AUTH_LOGIN_METHOD: env.AUTH_LOGIN_METHOD, DEV_SKIP_EMAIL_OTP: env.DEV_SKIP_EMAIL_OTP };
    try {
      Object.assign(env, { NODE_ENV: 'development', AUTH_LOGIN_METHOD: 'email', DEV_SKIP_EMAIL_OTP: true });
      const development = await atomic(tx => auth.issue(tx, owner.user, {}, undefined, false, true));
      await register(development, 'disabled-development-device');
      Object.assign(env, { DEV_SKIP_EMAIL_OTP: false });
      await deliverPush((await notification(owner.user.id)).id);
      expect(dispatched).toEqual([]);
    } finally { Object.assign(env, previous); }
  });

  it('reassigns a physical token to the new account and ignores stale unregister from the previous account', async () => {
    mockProvider();
    const previous = await account();
    const next = await account();
    const token = await register(previous.session, 'reassigned-device');
    await register(next.session, 'reassigned-device', token);
    const removed = await request(app).delete('/api/v1/notifications/device-tokens')
      .auth(previous.session.accessToken, { type: 'bearer' }).send({ token });
    expect(removed.status).toBe(200);
    await deliverPush((await notification(previous.user.id)).id);
    expect(dispatched).toEqual([]);
    await deliverPush((await notification(next.user.id)).id);
    expect(dispatched).toEqual(['reassigned-device']);
  });

  it('does not let a stale family unregister a newer login of the same account', async () => {
    mockProvider();
    const owner = await account();
    const newer = await atomic(tx => auth.issue(tx, owner.user, {}));
    const token = await register(owner.session, 'newer-device');
    await register(newer, 'newer-device', token);
    const removed = await request(app).delete('/api/v1/notifications/device-tokens')
      .auth(owner.session.accessToken, { type: 'bearer' }).send({ token });
    expect(removed.status).toBe(200);
    await deliverPush((await notification(owner.user.id)).id);
    expect(dispatched).toEqual(['newer-device']);
  });
});


describe('push dispatch lifecycle ordering', () => {
  it('revalidates account ownership after a device selected for delivery is reassigned', async () => {
    mockProvider();
    const previous = await account();
    const next = await account();
    const token = await register(previous.session, 'reassigned-device');
    const queued = await notification(previous.user.id);
    const proceed = barrier();
    const originalLock = notifications.lockDeviceToken;
    let selected = false;
    vi.spyOn(notifications, 'lockDeviceToken').mockImplementationOnce(async (tx, value) => {
      selected = true;
      await proceed.promise;
      await originalLock(tx, value);
    });
    const pending = allowed(deliverPush(queued.id));
    try {
      await vi.waitFor(() => expect(selected).toBe(true), { timeout: 5000, interval: 20 });
      await notifications.register(next.user.id, next.sid, { token, platform: 'android', provider: 'expo' });
      proceed.release();
      expect(await pending).toBe(true);
      expect(dispatched).toEqual([]);
      await deliverPush((await notification(next.user.id)).id);
      expect(dispatched).toEqual(['reassigned-device']);
    } finally {
      proceed.release();
      await pending;
    }
  });

  it.each(['logout', 'suspend', 'reassign', 'membership'] as const)('serializes %s with a private provider request already dispatching', async transition => {
    const owner = await account();
    const administrator = transition === 'suspend' || transition === 'membership' ? await account('ADMIN') : undefined;
    const organization = transition === 'membership'
      ? await db.parkingOperator.create({ data: { name: 'Push lifecycle test organization' } }) : undefined;
    if (organization) operatorIds.push(organization.id);
    const next = transition === 'reassign' ? await account() : undefined;
    const token = await register(owner.session, 'original-device');
    const queued = await notification(owner.user.id);
    const proceed = barrier();
    const events: string[] = [];
    let providerEntered = false;
    let providerPid: number | undefined;
    const originalLock = notifications.lockDeviceToken;
    vi.spyOn(notifications, 'lockDeviceToken').mockImplementationOnce(async (tx, value) => {
      const rows = await tx.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid()::int AS pid`;
      providerPid = rows[0]?.pid;
      await originalLock(tx, value);
    });
    vi.stubGlobal('fetch', async () => {
      events.push('provider-dispatched');
      providerEntered = true;
      await proceed.promise;
      return new Response(JSON.stringify({ data: { status: 'ok', id: 'test-only-ticket' } }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      });
    });
    const delivery = allowed(deliverPush(queued.id));
    let changing: Promise<boolean> | undefined;
    try {
      await vi.waitFor(() => expect(providerEntered).toBe(true), { timeout: 5000, interval: 20 });
      expect(typeof providerPid).toBe('number');
      const operation = transition === 'suspend'
        ? admin.role({ userId: administrator!.user.id, role: 'ADMIN' }, owner.user.id, { status: 'SUSPENDED' })
        : transition === 'reassign'
          ? notifications.register(next!.user.id, next!.sid, { token, platform: 'android', provider: 'expo' })
          : transition === 'membership'
            ? management.assignMember({ userId: administrator!.user.id, role: 'ADMIN' }, organization!.id, { userId: owner.user.id, memberRole: 'manager' })
            : auth.logout(owner.user.id, owner.sid, true);
      changing = allowed(operation).then(result => { events.push('transition-completed'); return result; });
      await vi.waitFor(async () => {
        const rows = await db.$queryRaw<Array<{ count: number }>>`
          SELECT COUNT(*)::int AS count FROM pg_stat_activity
          WHERE datname = current_database() AND pid <> pg_backend_pid()
            AND state = 'active' AND wait_event_type = 'Lock'
            AND query ILIKE '%pg_advisory_xact_lock%'
            AND ${providerPid!}::int = ANY(pg_blocking_pids(pid))
        `;
        expect(Number(rows[0]?.count ?? 0)).toBe(1);
      }, { timeout: 5000, interval: 20 });
      proceed.release();
      expect(await Promise.all([delivery, changing])).toEqual([true, true]);
      await deliverPush((await notification(owner.user.id)).id);
      expect(events).toEqual(['provider-dispatched', 'transition-completed']);
      if (transition === 'membership')
        expect((await db.user.findUniqueOrThrow({ where: { id: owner.user.id } })).role).toBe('PARKING_OPERATOR');
    } finally {
      proceed.release();
      await Promise.allSettled([delivery, ...(changing ? [changing] : [])]);
    }
  });

  it('preserves a proven browser session family registration and revokes its delivery on browser logout', async () => {
    mockProvider();
    const owner = await account();
    const binding = { webApplication: 'customer' as const, webBrowserId: auth.digest(randomUUID()) };
    const browser = await atomic(tx => auth.issue(tx, owner.user, binding));
    const identity = await auth.authenticateWeb(browser.accessToken, binding);
    const token = `ExpoPushToken[${randomUUID().replaceAll('-', '')}]`;
    registeredDevices.set(token, 'browser-device');
    await notifications.register(owner.user.id, identity.sid, { token, platform: 'web', provider: 'expo' });
    await deliverPush((await notification(owner.user.id)).id);
    expect(dispatched).toEqual(['browser-device']);
    const record = await db.refreshToken.findUniqueOrThrow({ where: { id: identity.sid } });
    await auth.revokeSessionFamily(owner.user.id, record.familyId);
    await deliverPush((await notification(owner.user.id)).id);
    expect(dispatched).toEqual(['browser-device']);
  });
});


describe('legacy session metadata proof', () => {
  it('keeps legacy access valid and resumes bound push after a verified refresh', async () => {
    mockProvider();
    const owner = await account();
    await register(owner.session, 'legacy-verified-device');
    await db.refreshToken.update({ where: { id: owner.sid }, data: { metadataVersion: 0 } });
    expect(await allowed(auth.authenticate(owner.session.accessToken))).toBe(true);
    await deliverPush((await notification(owner.user.id)).id);
    expect(dispatched).toEqual([]);
    const refreshed = await auth.refresh(owner.session.refreshToken, {});
    expect(await allowed(auth.authenticate(refreshed.accessToken))).toBe(true);
    await deliverPush((await notification(owner.user.id)).id);
    expect(dispatched).toEqual(['legacy-verified-device']);
  });

  it('rejects legacy development registration until signed refresh proves its authentication mode', async () => {
    mockProvider();
    const owner = await account();
    const previous = { NODE_ENV: env.NODE_ENV, AUTH_LOGIN_METHOD: env.AUTH_LOGIN_METHOD, DEV_SKIP_EMAIL_OTP: env.DEV_SKIP_EMAIL_OTP };
    try {
      Object.assign(env, { NODE_ENV: 'development', AUTH_LOGIN_METHOD: 'email', DEV_SKIP_EMAIL_OTP: true });
      const development = await atomic(tx => auth.issue(tx, owner.user, {}, undefined, false, true));
      const sid = auth.verifyAccess(development.accessToken).sid;
      const token = await register(development, 'legacy-development-device');
      // Reproduce a row that received additive defaults rather than mode proof.
      await db.refreshToken.update({ where: { id: sid }, data: { metadataVersion: 0, developmentEmailLogin: false, developmentPhoneLogin: false } });
      expect(await allowed(auth.authenticate(development.accessToken))).toBe(true);
      expect(await allowed(notifications.register(owner.user.id, sid, { token, platform: 'android', provider: 'expo' }))).toBe(false);
      Object.assign(env, { DEV_SKIP_EMAIL_OTP: false });
      await deliverPush((await notification(owner.user.id)).id);
      expect(dispatched).toEqual([]);
      Object.assign(env, { DEV_SKIP_EMAIL_OTP: true });
      const refreshed = await auth.refresh(development.refreshToken, {});
      expect(await allowed(auth.authenticate(refreshed.accessToken))).toBe(true);
      await deliverPush((await notification(owner.user.id)).id);
      expect(dispatched).toEqual(['legacy-development-device']);
      Object.assign(env, { DEV_SKIP_EMAIL_OTP: false });
      await deliverPush((await notification(owner.user.id)).id);
      expect(dispatched).toEqual(['legacy-development-device']);
    } finally { Object.assign(env, previous); }
  });
});


describe('durable push recovery recipient age', () => {
  it('does not replay a failed private notification to a new login family', async () => {
    mockProvider();
    const epoch = Date.now() - 60_000;
    const owner = await account();
    const token = await register(owner.session, 'old-device');
    const queued = await notification(owner.user.id);
    // Hand-set ordering avoids relying on clock resolution at session creation.
    await db.notification.update({ where: { id: queued.id }, data: { createdAt: new Date(epoch + 10_000) } });
    await db.refreshToken.update({ where: { id: owner.sid }, data: { createdAt: new Date(epoch) } });
    await auth.logout(owner.user.id, owner.sid, true);
    const newer = await atomic(tx => auth.issue(tx, owner.user, {}));
    await db.refreshToken.update({ where: { id: auth.verifyAccess(newer.accessToken).sid }, data: { createdAt: new Date(epoch + 20_000) } });
    await register(newer, 'new-login-device', token);
    await deliverPush(queued.id);
    expect(dispatched).toEqual([]);
    expect(Boolean((await db.notification.findUniqueOrThrow({ where: { id: queued.id } })).pushedAt)).toBe(true);
  });

  it('keeps an existing family eligible when its current refresh successor is newer than the notification', async () => {
    mockProvider();
    const epoch = Date.now() - 60_000;
    const owner = await account();
    await register(owner.session, 'rotated-family-device');
    const queued = await notification(owner.user.id);
    await db.refreshToken.update({ where: { id: owner.sid }, data: { createdAt: new Date(epoch) } });
    await db.notification.update({ where: { id: queued.id }, data: { createdAt: new Date(epoch + 10_000) } });
    const successor = await auth.refresh(owner.session.refreshToken, {});
    await db.refreshToken.update({ where: { id: auth.verifyAccess(successor.accessToken).sid }, data: { createdAt: new Date(epoch + 20_000) } });
    await deliverPush(queued.id);
    expect(dispatched).toEqual(['rotated-family-device']);
  });
});
