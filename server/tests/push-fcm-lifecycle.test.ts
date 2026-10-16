import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { atomic, db } from '../src/database/client';
import * as auth from '../src/modules/auth/service';
import * as notifications from '../src/modules/notifications/service';
import { deliverPush } from '../src/providers/push';

// OAuth and provider HTTP are the external boundaries. Every session, device
// registration, revocation, and queued notification uses real application/SQL.
const credential = vi.hoisted(() => ({ getAccessToken: vi.fn() }));
vi.mock('firebase-admin/app', () => ({
  getApps: () => [{ options: { projectId: 'test-only-project', credential } }],
  cert: () => credential,
  initializeApp: () => ({ options: { projectId: 'test-only-project', credential } }),
}));

const userIds: string[] = [];
const allowed = (operation: Promise<unknown>) => operation.then(() => true, () => false);
function barrier() {
  let release!: () => void;
  const promise = new Promise<void>(resolve => { release = resolve; });
  return { promise, release };
}
async function fixture() {
  const user = await db.user.create({ data: { email: `push-fcm-${randomUUID()}@example.com`, emailVerifiedAt: new Date(), locale: 'en' } });
  userIds.push(user.id);
  const session = await atomic(tx => auth.issue(tx, user, {}));
  const sid = auth.verifyAccess(session.accessToken).sid;
  await notifications.register(user.id, sid, { token: `test-only-fcm-${randomUUID()}`, provider: 'fcm', platform: 'android' });
  const notification = await db.notification.create({ data: {
    userId: user.id, type: 'parking_started', title: 'Private event', titleAr: 'Private event',
    body: 'Private test-only location', bodyAr: 'Private test-only location', href: '/parking/active/test-only',
  } });
  return { user, sid, notification };
}

beforeEach(() => { credential.getAccessToken.mockResolvedValue({ access_token: 'test-only-oauth-credential', expires_in: 3600 }); });
afterEach(async () => {
  try {
    await db.notification.deleteMany({ where: { userId: { in: userIds } } });
    await db.deviceToken.deleteMany({ where: { userId: { in: userIds } } });
    await db.refreshToken.deleteMany({ where: { userId: { in: userIds } } });
    await db.user.deleteMany({ where: { id: { in: userIds } } });
  } finally {
    userIds.length = 0;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    credential.getAccessToken.mockReset();
  }
});

describe('bounded FCM HTTP dispatch', () => {
  it('sends the private payload and string data through the authenticated HTTP v1 endpoint', async () => {
    const owner = await fixture();
    let requestShape: unknown;
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      const payload = JSON.parse(String(init.body));
      requestShape = {
        url, method: init.method, notification: payload.message.notification, data: payload.message.data,
        hasAuthorization: Boolean((init.headers as Record<string, string>).Authorization),
        cancellable: init.signal instanceof AbortSignal,
      };
      return new Response(JSON.stringify({ name: 'projects/test-only-project/messages/test-only-message' }), { status: 200 });
    });
    expect(await allowed(deliverPush(owner.notification.id))).toBe(true);
    expect(requestShape).toEqual({
      url: 'https://fcm.googleapis.com/v1/projects/test-only-project/messages:send', method: 'POST',
      notification: { title: 'Private event', body: 'Private test-only location' },
      data: { href: '/parking/active/test-only', notificationId: owner.notification.id },
      hasAuthorization: true, cancellable: true,
    });
    expect(Boolean((await db.notification.findUniqueOrThrow({ where: { id: owner.notification.id } })).pushedAt)).toBe(true);
  });

  it('rechecks logout after slow OAuth preparation before starting any FCM payload request', async () => {
    const owner = await fixture();
    const ready = barrier();
    let preparing = false;
    let dispatches = 0;
    credential.getAccessToken.mockImplementationOnce(async () => {
      preparing = true;
      await ready.promise;
      return { access_token: 'test-only-oauth-credential', expires_in: 3600 };
    });
    vi.stubGlobal('fetch', async () => { dispatches++; return new Response(JSON.stringify({ name: 'test-only-message' }), { status: 200 }); });
    const pending = allowed(deliverPush(owner.notification.id));
    try {
      await vi.waitFor(() => expect(preparing).toBe(true), { timeout: 5000, interval: 20 });
      await auth.logout(owner.user.id, owner.sid, true);
      ready.release();
      expect(await pending).toBe(true);
      expect(dispatches).toBe(0);
    } finally { ready.release(); await pending; }
  });

  it('cancels a pending HTTP dispatch and revalidates logout before the worker retries it', async () => {
    const owner = await fixture();
    const controller = new AbortController();
    let requestedBudget = 0;
    let dispatches = 0;
    let started = false;
    vi.spyOn(AbortSignal, 'timeout').mockImplementationOnce(milliseconds => {
      requestedBudget = milliseconds;
      return controller.signal;
    });
    vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
      dispatches++;
      started = true;
      return new Promise((_resolve, reject) => {
        init.signal!.addEventListener('abort', () => reject(new Error('test-only aborted request')), { once: true });
      });
    });
    const pending = allowed(deliverPush(owner.notification.id));
    try {
      await vi.waitFor(() => expect(started).toBe(true), { timeout: 5000, interval: 20 });
      expect(requestedBudget > 0 && requestedBudget <= 10000).toBe(true);
      controller.abort();
      expect(await pending).toBe(false);
      expect((await db.notification.findUniqueOrThrow({ where: { id: owner.notification.id } })).pushedAt).toBe(null);
      await auth.logout(owner.user.id, owner.sid, true);
      expect(await allowed(deliverPush(owner.notification.id))).toBe(true);
      expect(dispatches).toBe(1);
    } finally { controller.abort(); await pending; }
  });

  it.each([
    { status: 404, errorCode: 'UNREGISTERED', delivered: true, registrations: 0 },
    { status: 503, errorCode: 'UNAVAILABLE', delivered: false, registrations: 1 },
    { status: 400, errorCode: 'INVALID_ARGUMENT', delivered: false, registrations: 1 },
  ])('keeps correct registration and retry state for FCM $errorCode', async ({ status, errorCode, delivered, registrations }) => {
    const owner = await fixture();
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ error: {
      status: errorCode, details: [{ '@type': 'type.googleapis.com/google.firebase.fcm.v1.FcmError', errorCode }],
    } }), { status }));
    expect(await allowed(deliverPush(owner.notification.id))).toBe(delivered);
    expect(await db.deviceToken.count({ where: { userId: owner.user.id } })).toBe(registrations);
    expect(Boolean((await db.notification.findUniqueOrThrow({ where: { id: owner.notification.id } })).pushedAt)).toBe(delivered);
  });
});


describe('FCM notification preferences before credentials', () => {
  it('finishes opted-out reminders without attempting failed OAuth preparation', async () => {
    const owner = await fixture();
    await db.user.update({ where: { id: owner.user.id }, data: { notificationPreferences: { parkingReminders: false } } });
    await db.notification.update({ where: { id: owner.notification.id }, data: { type: 'parking_reminder' } });
    let preparations = 0;
    let dispatches = 0;
    credential.getAccessToken.mockImplementation(async () => { preparations++; throw new Error('Test-only OAuth unavailable'); });
    vi.stubGlobal('fetch', async () => { dispatches++; throw new Error('Test-only unexpected payload dispatch'); });
    const delivered = await allowed(deliverPush(owner.notification.id));
    const completed = Boolean((await db.notification.findUniqueOrThrow({ where: { id: owner.notification.id } })).pushedAt);
    expect({ delivered, completed, preparations, dispatches }).toEqual({ delivered: true, completed: true, preparations: 0, dispatches: 0 });
  });
});


describe('durable push attempt expiry', () => {
  it('completes an old queued notification before OAuth and keeps its in-app content', async () => {
    const owner = await fixture();
    await db.refreshToken.update({ where: { id: owner.sid }, data: { createdAt: new Date(Date.now() - 10 * 24 * 60 * 60_000) } });
    await db.notification.update({ where: { id: owner.notification.id }, data: { createdAt: new Date(Date.now() - 8 * 24 * 60 * 60_000) } });
    let preparations = 0, dispatches = 0;
    credential.getAccessToken.mockImplementation(async () => { preparations++; throw new Error('Test-only OAuth must not start for expired content'); });
    vi.stubGlobal('fetch', async () => { dispatches++; throw new Error('Test-only expired payload must not dispatch'); });
    expect(await allowed(deliverPush(owner.notification.id))).toBe(true);
    const saved = await db.notification.findUniqueOrThrow({ where: { id: owner.notification.id } });
    expect({ completed: Boolean(saved.pushedAt), body: saved.body, preparations, dispatches }).toEqual({
      completed: true, body: 'Private test-only location', preparations: 0, dispatches: 0,
    });
  });
});
