import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { spawn, type ChildProcess } from 'node:child_process';
import { resolve } from 'node:path';
import { Queue } from 'bullmq';
import { atomic, db } from '../src/database/client';
import { redis, redisConnection } from '../src/database/redis';
import * as auth from '../src/modules/auth/service';
import * as notifications from '../src/modules/notifications/service';
import { createHash } from 'node:crypto';
import * as walletService from '../src/modules/wallet/service';
import { maintenanceQueue, outboxQueue, dispatchQueue, financialQueue, pushQueue as configuredPushQueue } from '../src/jobs/queues';

let child: ChildProcess | undefined;
let providerUrl = '';
let paymentRequests: Array<{ id: string; amount: number; idempotencyKey?: string }> = [];
let failNextPayment = false;
let pushRequests = 0;
let holdPayments = false;
let pushAvailable = true;
const held: Array<() => void> = [];
const queues: Queue[] = [];
const provider = createServer(async (request, response) => {
  let body = '';
  for await (const chunk of request) body += chunk;
  response.setHeader('Content-Type', 'application/json');
  if (request.url === '/push') {
    pushRequests++;
    response.statusCode = pushAvailable ? 200 : 503;
    response.end(JSON.stringify(pushAvailable ? { data: { status: 'ok', id: 'test-only-ticket' } } : { error: 'test-only unavailable' }));
    return;
  }
  if (request.url === '/payments') {
    const payload = JSON.parse(body) as { id: string; amount: number };
    paymentRequests.push(payload);
    if (failNextPayment) { failNextPayment = false; response.statusCode = 503; response.end(JSON.stringify({ error: 'test-only ambiguous provider failure' })); return; }
    const reply = () => { if (!response.destroyed) response.end(JSON.stringify({ id: payload.id, amount: payload.amount, currency: 'ILS', status: 'completed' })); };
    if (holdPayments) held.push(reply); else reply();
    return;
  }
  if (request.method === 'GET' && request.url?.startsWith('/payments/')) {
    const id = decodeURIComponent(request.url.slice('/payments/'.length));
    paymentRequests.push({ id, amount: 5000 });
    response.end(JSON.stringify({ id, amount: 5000, currency: 'ILS', status: 'pending' }));
    return;
  }
  response.statusCode = 404;
  response.end(JSON.stringify({ error: 'Unexpected test-only provider request' }));
});

function queue(name: string) {
  const found = queues.find(queue => queue.name === 'parkflow-' + name);
  if (found) return found;
  const result = new Queue('parkflow-' + name, { connection: redisConnection() });
  queues.push(result);
  return result;
}
async function startWorker() {
  child = spawn(process.execPath, ['--import', 'tsx', resolve('tests/fixtures/worker-process.ts')], {
    cwd: process.cwd(), stdio: ['ignore', 'ignore', 'pipe'],
    env: { ...process.env, NODE_ENV: 'test', PAYMENT_PROVIDER: 'http', PAYMENT_API_URL: providerUrl,
      PAYMENT_API_KEY: 'test-only-provider-credential', PARKFLOW_TEST_PROVIDER_URL: providerUrl },
  });
  let errors = '';
  child.stderr?.on('data', value => { errors += String(value); });
  await vi.waitFor(async () => {
    if (child!.exitCode !== null) throw new Error('Worker exited before startup: ' + errors.slice(-1000));
    expect(await queueState('maintenance')).toBeGreaterThan(0);
  }, { timeout: 10000, interval: 50 });
}
async function queueState(name: string) {
  const connection = queue(name);
  const jobs = await connection.getJobSchedulers();
  return jobs.length;
}
async function walletFixture(id: string = randomUUID(), balance = 0) {
  const user = await db.user.create({ data: { id, email: id + '@worker.example.com', emailVerifiedAt: new Date() } });
  const method = await db.paymentMethod.create({ data: { userId: user.id, provider: 'http', providerMethodId: 'test-only-method', last4: '1234', brand: 'visa', expiryMonth: 12, expiryYear: 2030 } });
  // One insert preserves fixture order in both heap and index scans. Updating a
  // freshly inserted wallet can relocate its row ahead of the healthy page.
  return db.wallet.create({ data: { id: 'wallet-' + id, userId: user.id, balance, autoTopUpEnabled: true, defaultPaymentMethodId: method.id } });
}
beforeEach(async () => {
  if (!new URL(process.env.DATABASE_URL!).pathname.endsWith('_test')) throw new Error('Dedicated test database required');
  await redis.flushdb();
  const tables = await db.$queryRaw<Array<{ tablename: string }>>`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  await db.$executeRawUnsafe('TRUNCATE ' + tables.map(t => '"' + t.tablename.replace(/"/g, '""') + '"').join(',') + ' CASCADE');
  paymentRequests = []; pushRequests = 0; holdPayments = false; pushAvailable = true; failNextPayment = false;
  await new Promise<void>(resolve => provider.listen(0, '127.0.0.1', resolve));
  const address = provider.address();
  if (!address || typeof address === 'string') throw new Error('Missing local provider port');
  providerUrl = 'http://127.0.0.1:' + address.port;
});
afterEach(async () => {
  held.splice(0).forEach(release => release());
  if (child && child.exitCode === null) {
    const exited = new Promise<void>(resolve => child!.once('exit', () => resolve()));
    child.kill('SIGKILL');
    await exited;
  }
  child = undefined;
  await Promise.all(queues.splice(0).map(queue => queue.close()));
  provider.closeAllConnections();
  await new Promise<void>((resolve, reject) => provider.close(error => error ? reject(error) : resolve()));
  vi.restoreAllMocks();
});

describe('independent worker recovery', () => {
  // Reintroducing a provider call in the single maintenance/outbox processor
  // leaves this real outbox event undelivered while the provider is held.
  it('drains outbox events while a financial provider request is stalled', async () => {
    holdPayments = true;
    const wallet = await walletFixture();
    await startWorker();
    await vi.waitFor(() => expect(paymentRequests.length).toBeGreaterThan(0), { timeout: 10000, interval: 25 });
    const event = await db.outboxEvent.create({ data: { topic: 'parking.session.updated', userId: wallet.userId, payload: { id: 'test-only-session' } } });
    await vi.waitFor(async () => {
      expect((await db.outboxEvent.findUniqueOrThrow({ where: { id: event.id } })).deliveredAt).not.toBe(null);
    }, { timeout: 4000, interval: 25 });
  });

  // take:500 before the balance predicate excludes this eligible wallet forever.
  it('charges an eligible wallet behind 500 enabled wallets above threshold', async () => {
    const prefix = randomUUID();
    await db.user.createMany({ data: Array.from({ length: 500 }, (_, index) => ({ id: prefix + '-healthy-' + index, email: prefix + '-' + index + '@worker.example.com' })) });
    await db.wallet.createMany({ data: Array.from({ length: 500 }, (_, index) => ({ id: 'aaaa-healthy-wallet-' + String(index).padStart(3, '0'), userId: prefix + '-healthy-' + index, balance: 10000, autoTopUpEnabled: true })) });
    const wallet = await walletFixture('zzzz-low-' + prefix);
    await startWorker();
    await vi.waitFor(async () => expect((await db.wallet.findUniqueOrThrow({ where: { id: wallet.id } })).balance).toBe(5000), { timeout: 12000, interval: 50 });
    expect(await db.payment.count({ where: { method: { userId: wallet.userId } } })).toBe(1);
    expect(await db.walletTransaction.count({ where: { walletId: wallet.id, type: 'topup', status: 'completed' } })).toBe(1);
  });

  // Persistent pending responses must not keep the recovery scanner on its
  // first page while later payments never reach their provider.
  it('advances pending-payment recovery beyond the first provider page', async () => {
    const owner = await walletFixture();
    await db.wallet.update({ where: { id: owner.id }, data: { autoTopUpEnabled: false } });
    const payments = Array.from({ length: 105 }, (_, index) => ({
      id: 'fair-payment-' + String(index).padStart(3, '0'), paymentMethodId: owner.defaultPaymentMethodId!,
      provider: 'http', providerId: 'fair-provider-' + String(index).padStart(3, '0'), amount: 5000,
      idempotencyKey: owner.userId + ':fair-key-' + index,
    }));
    await db.payment.createMany({ data: payments });
    await db.idempotencyRecord.createMany({ data: payments.map((payment, index) => ({
      userId: owner.userId, scope: 'topup', key: 'fair-key-' + index,
      requestHash: createHash('sha256').update(JSON.stringify({ amount: 5000, paymentMethodId: owner.defaultPaymentMethodId })).digest('hex'),
      response: { id: payment.id },
    })) });
    await startWorker();
    await queue('dispatch').add('financial', {});
    await queue('dispatch').add('financial', {});
    await vi.waitFor(() => expect(new Set(paymentRequests.map(payment => payment.id)).has('fair-provider-104')).toBe(true), { timeout: 12000, interval: 25 });
    expect((await db.wallet.findUniqueOrThrow({ where: { id: owner.id } })).balance).toBe(0);
    expect(await db.walletTransaction.count({ where: { walletId: owner.id } })).toBe(0);
  });

  // A queued wallet snapshot may become ineligible before a worker consumes it.
  it('rechecks automatic top-up settings before creating a queued charge', async () => {
    const wallet = await walletFixture();
    await queue('financial').add('auto-topup', { walletId: wallet.id, version: wallet.updatedAt.toISOString() }, { jobId: 'stale-auto-' + wallet.id });
    await db.wallet.update({ where: { id: wallet.id }, data: { autoTopUpEnabled: false } });
    await startWorker();
    await vi.waitFor(async () => expect(await (await queue('financial').getJob('stale-auto-' + wallet.id))!.getState()).toBe('completed'), { timeout: 5000, interval: 25 });
    expect(paymentRequests).toEqual([]);
    expect(await db.payment.count()).toBe(0);
  });

  it('does not reserve another automatic charge while an earlier version is pending', async () => {
    holdPayments = true;
    const wallet = await walletFixture();
    await startWorker();
    await vi.waitFor(() => expect(paymentRequests).toHaveLength(1), { timeout: 10000, interval: 25 });
    const changed = await db.wallet.update({ where: { id: wallet.id }, data: { autoTopUpAmount: 6000 } });
    const financial = queue('financial');
    await financial.add('auto-topup', { walletId: wallet.id, version: changed.updatedAt.toISOString() }, { jobId: 'changed-auto-' + wallet.id });
    await vi.waitFor(async () => expect(await (await financial.getJob('changed-auto-' + wallet.id))!.getState()).toBe('completed'), { timeout: 5000, interval: 25 });
    expect(paymentRequests).toHaveLength(1);
    expect(await db.payment.count({ where: { method: { userId: wallet.userId } } })).toBe(1);
    held.splice(0).forEach(release => release());
    await vi.waitFor(async () => expect((await db.wallet.findUniqueOrThrow({ where: { id: wallet.id } })).balance).toBe(5000), { timeout: 5000, interval: 25 });
    expect(await db.walletTransaction.count({ where: { walletId: wallet.id, type: 'topup' } })).toBe(1);
  });

  // A terminal failed Bull job must be recovered from the durable notification,
  // even though its original outbox event is already acknowledged.
  it('redrives an exhausted push job with a delay and finishes delivery after provider recovery', async () => {
    const user = await db.user.create({ data: { email: randomUUID() + '@worker.example.com', emailVerifiedAt: new Date() } });
    const session = await atomic(tx => auth.issue(tx, user, {}));
    await notifications.register(user.id, auth.verifyAccess(session.accessToken).sid, { token: 'ExpoPushToken[' + randomUUID() + ']', provider: 'expo', platform: 'android' });
    const notification = await atomic(tx => notifications.notify(tx, user.id, 'parking_started', 'Private event', 'Private event', 'Test-only private content', 'Test-only private content'));
    const origin = await db.outboxEvent.findFirstOrThrow({ where: { userId: user.id, topic: 'notification.created' } });
    await db.outboxEvent.update({ where: { id: origin.id }, data: { deliveredAt: new Date() } });
    const pushes = queue('push');
    await pushes.add('deliver', { notificationId: notification!.id }, { jobId: origin.id, attempts: 1, removeOnFail: false });
    pushAvailable = false;
    // Keep startup reconciliation from racing observation of the first failure.
    await queue('dispatch').pause();
    await startWorker();
    await vi.waitFor(async () => expect(await (await pushes.getJob(origin.id))!.getState()).toBe('failed'), { timeout: 10000, interval: 25 });
    expect((await db.notification.findUniqueOrThrow({ where: { id: notification!.id } })).pushedAt).toBe(null);
    const dispatch = queue('dispatch');
    await dispatch.resume();
    await dispatch.add('reconcile-push', {});
    await vi.waitFor(async () => expect(await (await pushes.getJob(origin.id))!.getState()).toBe('delayed'), { timeout: 5000, interval: 25 });
    expect(pushRequests).toBe(1);
    pushAvailable = true;
    await (await pushes.getJob(origin.id))!.promote();
    await vi.waitFor(async () => expect((await db.notification.findUniqueOrThrow({ where: { id: notification!.id } })).pushedAt).not.toBe(null), { timeout: 5000, interval: 25 });
    expect(pushRequests).toBe(2);
    await dispatch.add('reconcile-push', {});
    await vi.waitFor(async () => expect(await dispatch.getActiveCount()).toBe(0), { timeout: 2000, interval: 25 });
    expect(pushRequests).toBe(2);
  });
});


afterAll(async () => { await Promise.all([maintenanceQueue, outboxQueue, dispatchQueue, financialQueue, configuredPushQueue].map(queue => queue.close())); });

describe('worker dispatch review regressions', () => {
  it.each(['disabled', 'default-method', 'suspended'] as const)('cancels an unsubmitted automatic reservation after its account becomes %s', async transition => {
    const wallet = await walletFixture();
    const paymentId = await walletService.prepareAutomaticTopup(wallet.id, wallet.updatedAt.toISOString());
    expect(typeof paymentId).toBe('string');
    if (transition === 'disabled') await walletService.autoTopup(wallet.userId, { enabled: false });
    else if (transition === 'suspended') await db.user.update({ where: { id: wallet.userId }, data: { status: 'SUSPENDED' } });
    else {
      const replacement = await db.paymentMethod.create({ data: { userId: wallet.userId, provider: 'http', providerMethodId: 'test-only-replacement', last4: '5678', brand: 'visa', expiryMonth: 12, expiryYear: 2030 } });
      await walletService.defaultMethod(wallet.userId, replacement.id);
    }
    await queue('dispatch').pause();
    const financial = queue('financial');
    await financial.add('payment', { paymentId }, { jobId: 'reserved-review-' + paymentId });
    await startWorker();
    await vi.waitFor(async () => expect(await (await financial.getJob('reserved-review-' + paymentId))!.getState()).toBe('completed'), { timeout: 8000, interval: 25 });
    expect(paymentRequests).toEqual([]);
    expect((await db.wallet.findUniqueOrThrow({ where: { id: wallet.id } })).balance).toBe(0);
    const cancelled = await db.payment.findUniqueOrThrow({ where: { id: paymentId! } });
    expect({ status: cancelled.status, providerId: cancelled.providerId, ledgerId: cancelled.ledgerId }).toEqual({ status: 'failed', providerId: null, ledgerId: null });
    expect(await db.walletTransaction.count({ where: { walletId: wallet.id } })).toBe(0);
    expect(await db.notification.count({ where: { userId: wallet.userId, type: 'payment_failed' } })).toBe(0);
  });

  it('retries a started automatic payment with the same authorization after later disablement', async () => {
    const wallet = await walletFixture();
    const paymentId = await walletService.prepareAutomaticTopup(wallet.id, wallet.updatedAt.toISOString());
    const expectedKey = wallet.userId + ':auto-' + wallet.id + '-' + wallet.updatedAt.getTime();
    await queue('dispatch').pause();
    failNextPayment = true;
    const financial = queue('financial');
    await financial.add('payment', { paymentId }, { jobId: 'started-review-' + paymentId, attempts: 1, removeOnFail: false });
    await startWorker();
    await vi.waitFor(async () => expect(await (await financial.getJob('started-review-' + paymentId))!.getState()).toBe('failed'), { timeout: 8000, interval: 25 });
    expect(paymentRequests).toHaveLength(1);
    expect((await db.payment.findUniqueOrThrow({ where: { id: paymentId! } })).providerId).toBe(null);
    await walletService.autoTopup(wallet.userId, { enabled: false });
    await (await financial.getJob('started-review-' + paymentId))!.retry('failed', { resetAttemptsMade: true, resetAttemptsStarted: true });
    await vi.waitFor(async () => expect((await db.wallet.findUniqueOrThrow({ where: { id: wallet.id } })).balance).toBe(5000), { timeout: 8000, interval: 25 });
    expect(paymentRequests.map(request => ({ id: request.id, key: request.idempotencyKey }))).toEqual([
      { id: paymentId, key: expectedKey }, { id: paymentId, key: expectedKey },
    ]);
    expect(await db.payment.count({ where: { method: { userId: wallet.userId } } })).toBe(1);
    expect(await db.walletTransaction.count({ where: { walletId: wallet.id, type: 'topup', status: 'completed' } })).toBe(1);
  });

  it('preserves same-key recovery for a legacy ambiguous automatic payment without dispatch proof', async () => {
    const wallet = await walletFixture();
    const key = wallet.userId + ':auto-' + wallet.id + '-' + wallet.updatedAt.getTime();
    const payment = await db.payment.create({ data: { paymentMethodId: wallet.defaultPaymentMethodId!, amount: 5000, provider: 'http', idempotencyKey: key } });
    await walletService.autoTopup(wallet.userId, { enabled: false });
    await queue('dispatch').pause();
    await queue('financial').add('payment', { paymentId: payment.id });
    await startWorker();
    await vi.waitFor(async () => expect((await db.wallet.findUniqueOrThrow({ where: { id: wallet.id } })).balance).toBe(5000), { timeout: 8000, interval: 25 });
    expect(paymentRequests.map(request => ({ id: request.id, key: request.idempotencyKey }))).toEqual([{ id: payment.id, key }]);
    expect(await db.walletTransaction.count({ where: { walletId: wallet.id, type: 'topup', status: 'completed' } })).toBe(1);
  });

  it('retains recent exhausted push evidence after more than 1000 failures', async () => {
    await queue('dispatch').pause();
    // Fail one job first, ensuring it is the oldest recent failure regardless
    // of the concurrent completion order of the following 1001 jobs.
    await configuredPushQueue.add('deliver', { notificationId: 'test-only-absent-0' }, { jobId: 'retention-review-0', attempts: 1 });
    await startWorker();
    await vi.waitFor(async () => expect(await (await configuredPushQueue.getJob('retention-review-0'))!.getState()).toBe('failed'), { timeout: 8000, interval: 25 });
    const jobs = Array.from({ length: 1001 }, (_, offset) => ({
      name: 'deliver', data: { notificationId: 'test-only-absent-' + (offset + 1) }, opts: { jobId: 'retention-review-' + (offset + 1), attempts: 1 },
    }));
    // Use the production producer's default policy with real failed jobs.
    await configuredPushQueue.addBulk(jobs);
    await vi.waitFor(async () => {
      expect(await configuredPushQueue.getWaitingCount()).toBe(0);
      expect(await configuredPushQueue.getActiveCount()).toBe(0);
      expect(await configuredPushQueue.getFailedCount()).toBeGreaterThanOrEqual(1000);
    }, { timeout: 25000, interval: 50 });
    const first = await configuredPushQueue.getJob('retention-review-0');
    expect(await first?.getState()).toBe('failed');
    const retention = first!.opts.removeOnFail;
    expect(typeof retention === 'object' && 'age' in retention && Number(retention.age) >= 300 && retention.count === undefined).toBe(true);
  }, 40000);

  it('processes a colon-containing provider webhook without poisoning later events', async () => {
    const wallet = await walletFixture();
    await walletService.autoTopup(wallet.userId, { enabled: false });
    const payment = await db.payment.create({ data: { paymentMethodId: wallet.defaultPaymentMethodId!, amount: 5000, provider: 'http', providerId: 'test-only-webhook-payment', idempotencyKey: wallet.userId + ':webhook-review' } });
    await db.paymentWebhook.createMany({ data: [
      { id: 'a:provider:event:001', provider: 'http', payload: { paymentId: payment.providerId! } },
      { id: 'z-normal-provider-event', provider: 'http', payload: { paymentId: payment.providerId! } },
    ] });
    await startWorker();
    await queue('dispatch').add('financial', {});
    await vi.waitFor(async () => expect(await db.paymentWebhook.count({ where: { processedAt: { not: null } } })).toBe(2), { timeout: 8000, interval: 25 });
    expect(paymentRequests.some(request => request.id === 'test-only-webhook-payment')).toBe(true);
    expect((await db.wallet.findUniqueOrThrow({ where: { id: wallet.id } })).balance).toBe(0);
  });
});


describe('automatic payment cancellation epochs', () => {
  it('resumes automatic top-up with one fresh authorization after a suspended reservation is cancelled and the account reactivates', async () => {
    const wallet = await walletFixture();
    const cancelledId = await walletService.prepareAutomaticTopup(wallet.id, wallet.updatedAt.toISOString());
    expect(typeof cancelledId).toBe('string');
    await db.user.update({ where: { id: wallet.userId }, data: { status: 'SUSPENDED' } });
    const dispatch = queue('dispatch');
    await dispatch.pause();
    const financial = queue('financial');
    await financial.add('payment', { paymentId: cancelledId }, { jobId: 'suspended-epoch-' + cancelledId });
    await startWorker();
    await vi.waitFor(async () => expect(await (await financial.getJob('suspended-epoch-' + cancelledId))!.getState()).toBe('completed'), { timeout: 8000, interval: 25 });
    expect(paymentRequests).toEqual([]);
    expect((await db.payment.findUniqueOrThrow({ where: { id: cancelledId! } })).status).toBe('failed');
    const cancelledProof = await db.idempotencyRecord.findUniqueOrThrow({ where: { userId_scope_key: {
      userId: wallet.userId, scope: 'automatic-topup-dispatch', key: cancelledId!,
    } } });
    expect(cancelledProof.response).toMatchObject({ state: 'cancelled', walletVersion: wallet.updatedAt.toISOString() });
    await db.user.update({ where: { id: wallet.userId }, data: { status: 'ACTIVE' } });
    await dispatch.resume();
    await dispatch.add('financial', {});
    await vi.waitFor(async () => expect((await db.wallet.findUniqueOrThrow({ where: { id: wallet.id } })).balance).toBe(5000), { timeout: 10000, interval: 25 });
    expect(paymentRequests).toHaveLength(1);
    expect(paymentRequests[0].id).not.toBe(cancelledId);
    expect(await db.payment.count({ where: { method: { userId: wallet.userId } } })).toBe(2);
    expect(await db.walletTransaction.count({ where: { walletId: wallet.id, type: 'topup', status: 'completed' } })).toBe(1);
    const stillCancelled = await db.idempotencyRecord.findUniqueOrThrow({ where: { id: cancelledProof.id } });
    expect(stillCancelled.response).toEqual(cancelledProof.response);
    expect((await db.payment.findUniqueOrThrow({ where: { id: cancelledId! } })).ledgerId).toBe(null);
  });
});
