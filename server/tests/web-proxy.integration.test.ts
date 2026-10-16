import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createServer, request as httpRequest } from 'node:http';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { createApp } from '../src/app';
import { atomic, db } from '../src/database/client';
import { redis } from '../src/database/redis';
import * as authentication from '../src/modules/auth/service';
import { emailProvider } from '../src/providers/email';
import { attachSockets } from '../src/realtime/socket';

type Application = 'customer' | 'management';
type Headers = Record<string, string>;
const app = createApp(), users: string[] = [], delivered = new Map<string, string>();
vi.spyOn(emailProvider, 'sendOtp').mockImplementation(async (email, code) => { delivered.set(email, code); });
const origin = (application: Application) => 'http://localhost:' + (application === 'customer' ? 8081 : 8082);
const proof = (application: Application, session?: any): Headers => ({
  'X-ParkFlow-App': application,
  ...(session ? { 'X-ParkFlow-Session': session.sessionId, 'X-ParkFlow-Login': session.loginId, 'X-ParkFlow-CSRF': session.csrfToken } : {}),
});
const direct = (application: Application, session?: any): Headers => ({ Origin: origin(application), ...proof(application, session) });
const readMetadata = (application: Application): Headers => ({
  Referer: origin(application) + '/wallet?view=current',
  'Sec-Fetch-Site': 'same-origin', 'Sec-Fetch-Mode': 'cors',
});
const readHeaders = (application: Application, session?: any): Headers => ({ ...readMetadata(application), ...proof(application, session) });
class Jar {
  values = new Map<string, string>();
  absorb(response: any) {
    for (const line of response.headers['set-cookie'] ?? []) {
      const pair = line.split(';')[0], at = pair.indexOf('=');
      const name = pair.slice(0, at), value = pair.slice(at + 1);
      if (/max-age=0|expires=Thu, 01 Jan 1970/i.test(line)) this.values.delete(name);
      else this.values.set(name, value);
    }
  }
  get cookie() { return [...this.values].map(([name, value]) => name + '=' + value).join('; '); }
}
async function account(application: Application = 'customer') {
  const user = await db.user.create({ data: {
    email: 'proxy-' + randomUUID() + '@example.com', fullName: 'Proxy integration',
    role: application === 'management' ? 'ADMIN' : 'USER', emailVerifiedAt: new Date(), profileCompletedAt: new Date(),
  } });
  users.push(user.id); return user;
}
async function signIn(application: Application = 'customer') {
  const user = await account(application), jar = new Jar();
  const initialized = await request(app).get('/api/v1/auth/web-session/bootstrap').set(direct(application));
  expect(initialized.status).toBe(200); jar.absorb(initialized);
  const challenge = await request(app).post('/api/v1/auth/request-otp').set(direct(application)).set('Cookie', jar.cookie).send({ email: user.email, purpose: 'login' });
  expect(challenge.status).toBe(200);
  const signed = await request(app).post('/api/v1/auth/verify-otp').set(direct(application)).set('Cookie', jar.cookie).send({ challengeId: challenge.body.challengeId, code: delivered.get(user.email!) });
  expect(signed.status).toBe(200); jar.absorb(signed);
  return { user, jar, session: signed.body.session, application };
}
beforeEach(async () => { const keys = await redis.keys('rate:*'); if (keys.length) await redis.del(...keys); });
afterAll(async () => {
  await db.refreshToken.deleteMany({ where: { userId: { in: users } } });
  await db.user.deleteMany({ where: { id: { in: users } } });
});

describe('same-origin proxy browser reads', () => {
  it.each(['customer', 'management'] as const)('bootstraps a %s browser slot without Origin only with trusted same-origin metadata', async application => {
    const response = await request(app).get('/api/v1/auth/web-session/bootstrap').set(readHeaders(application));
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ session: null, user: null });
    const cookies = response.headers['set-cookie'] as unknown as string[];
    expect(cookies).toHaveLength(1);
    expect(cookies[0]).toContain('-' + application + '-browser=');
    expect(cookies[0].toLowerCase()).toContain('httponly');
    expect(cookies[0].toLowerCase()).toContain('samesite=strict');
    expect(cookies[0].toLowerCase()).not.toContain('domain=');
  });
  it('restores cookie identity and authenticated GET/HEAD through the read fallback', async () => {
    const { user, jar, session } = await signIn();
    const restored = await request(app).get('/api/v1/auth/web-session/bootstrap').set(readHeaders('customer')).set('Cookie', jar.cookie);
    expect(restored.status).toBe(200);
    expect(restored.body.user.id).toBe(user.id);
    expect(restored.body.session.sessionId).toBe(session.sessionId);
    expect(restored.body.session).not.toHaveProperty('accessToken');
    const profile = await request(app).get('/api/v1/auth/me').set(readHeaders('customer', session)).set('Cookie', jar.cookie);
    expect(profile.status).toBe(200); expect(profile.body.id).toBe(user.id);
    expect((await request(app).head('/api/v1/auth/me').set(readHeaders('customer', session)).set('Cookie', jar.cookie)).status).toBe(200);
  });
  it('rejects incomplete, untrusted, mismatched, or forwarded browser read metadata', async () => {
    const { jar, session } = await signIn();
    const valid = readHeaders('customer', session);
    const omit = (name: string) => Object.fromEntries(Object.entries(valid).filter(([key]) => key !== name));
    const invalid: Headers[] = [
      omit('Referer'), { ...valid, Referer: 'not a URL' }, { ...valid, Referer: 'https://untrusted.invalid/account' },
      { ...valid, Referer: 'http://localhost:8081.untrusted.invalid/account' },
      { ...valid, Referer: 'http://attacker@localhost:8081/account' },
      omit('Sec-Fetch-Site'), omit('Sec-Fetch-Mode'),
      { ...valid, 'Sec-Fetch-Site': 'same-site' }, { ...valid, 'Sec-Fetch-Site': 'cross-site' },
      { ...valid, 'Sec-Fetch-Mode': 'navigate' }, { ...valid, 'Sec-Fetch-Mode': 'no-cors' },
      { ...valid, 'X-ParkFlow-App': 'management' }, omit('X-ParkFlow-App'),
      { ...valid, Origin: 'null' }, { ...valid, Origin: '' }, { ...valid, Origin: 'invalid' },
      { ...valid, Origin: origin('management') },
      { ...omit('Referer'), 'X-Forwarded-Host': 'localhost:8081', 'X-Forwarded-Proto': 'http' },
      { ...valid, Referer: 'https://untrusted.invalid/', 'X-Forwarded-Host': 'localhost:8081' },
    ];
    for (const headers of invalid) {
      const denied = await request(app).get('/api/v1/auth/me').set(headers).set('Cookie', jar.cookie);
      expect(denied.status).toBe(403);
      expect(denied.body).not.toHaveProperty('email');
      expect(denied.headers['set-cookie']).toBeUndefined();
    }
    const explicit = await request(app).get('/api/v1/auth/me').set({ ...direct('customer', session), Referer: 'https://untrusted.invalid/', 'Sec-Fetch-Site': 'cross-site', 'Sec-Fetch-Mode': 'navigate' }).set('Cookie', jar.cookie);
    expect(explicit.status).toBe(200);
  });
  it('never downgrades browser-shaped or explicitly empty Origin reads to native bearer authentication', async () => {
    const user = await account(), native = await atomic(tx => authentication.issue(tx, user, {}));
    for (const headers of [readMetadata('customer'), { ...readMetadata('customer'), Origin: '' }, { Origin: '' }]) {
      const denied = await request(app).get('/api/v1/auth/me').set(headers).auth(native.accessToken, { type: 'bearer' });
      expect(denied.status).toBe(403);
      expect(denied.body).not.toHaveProperty('email');
    }
    expect((await request(app).get('/api/v1/auth/me').auth(native.accessToken, { type: 'bearer' })).status).toBe(200);
  });
  it('requires an actual trusted Origin and CSRF for unsafe HTTP despite correct read metadata', async () => {
    const { user, jar, session } = await signIn();
    for (const [method, route, body] of [
      ['patch', '/users/me', { fullName: 'Unauthorized proxy write' }],
      ['post', '/auth/refresh', {}], ['post', '/auth/web-session/logout', {}],
    ] as const) {
      const denied = await request(app)[method]('/api/v1' + route).set(readHeaders('customer', session)).set('Cookie', jar.cookie).send(body);
      expect(denied.status).toBe(403); expect(denied.headers['set-cookie']).toBeUndefined();
    }
    expect((await db.user.findUniqueOrThrow({ where: { id: user.id } })).fullName).toBe('Proxy integration');
    expect(await db.refreshToken.count({ where: { userId: user.id, revokedAt: null } })).toBe(1);
    const badCsrf = await request(app).patch('/api/v1/users/me').set({ ...direct('customer', session), 'X-ParkFlow-CSRF': 'invalid' }).set('Cookie', jar.cookie).send({ fullName: 'Unauthorized proxy write' });
    expect(badCsrf.status).toBe(403);
    const allowed = await request(app).patch('/api/v1/users/me').set(direct('customer', session)).set('Cookie', jar.cookie).send({ fullName: 'Authorized proxy write' });
    expect(allowed.status).toBe(200);
  });
});

async function socketServer() {
  const server = createServer(app), sockets = attachSockets(server);
  const adapter = sockets.io.of('/').adapter as unknown as { pubClient: { ping(): Promise<unknown> }; subClient: { ping(): Promise<unknown> } };
  await Promise.all([adapter.pubClient.ping(), adapter.subClient.ping()]);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as { port: number }).port;
  return { ...sockets, port };
}
async function wire(port: number, method: 'GET' | 'POST', route: string, headers: Headers, body?: string) {
  return new Promise<{ status: number; text: string }>((resolve, reject) => {
    const req = httpRequest({ hostname: '127.0.0.1', port, method, path: route, headers: { ...headers, ...(body === undefined ? {} : { 'Content-Type': 'text/plain;charset=UTF-8' }) } }, response => {
      const parts: Buffer[] = [];
      response.on('data', part => parts.push(Buffer.from(part)));
      response.on('end', () => resolve({ status: response.statusCode!, text: Buffer.concat(parts).toString('utf8') }));
    });
    req.on('error', reject);
    req.setTimeout(5000, () => req.destroy(new Error('Local polling request timeout')));
    req.end(body);
  });
}
class Polling {
  sid = '';
  constructor(readonly port: number, readonly headers: Headers) {}
  get route() { return '/socket.io/?EIO=4&transport=polling' + (this.sid ? '&sid=' + encodeURIComponent(this.sid) : ''); }
  async open() {
    const opened = await wire(this.port, 'GET', this.route, this.headers);
    if (opened.status === 200 && opened.text.startsWith('0')) this.sid = JSON.parse(opened.text.slice(1)).sid;
    return opened.status;
  }
  async send(packet: string) { return wire(this.port, 'POST', this.route, { ...this.headers, Origin: origin('customer') }, packet); }
  async poll() { return wire(this.port, 'GET', this.route, this.headers); }
  async connect(auth: unknown) {
    expect((await this.send('40' + JSON.stringify(auth))).status).toBe(200);
    for (let attempt = 0; attempt < 3; attempt++) {
      const response = await this.poll();
      expect(response.status).toBe(200);
      for (const packet of response.text.split('\x1e')) {
        if (packet.startsWith('40')) return { connected: true, error: null };
        if (packet.startsWith('44')) return { connected: false, error: JSON.parse(packet.slice(2)).message };
        if (packet === '2') await this.send('3');
      }
    }
    throw new Error('Polling namespace result was not delivered');
  }
  async close() { if (this.sid) await this.send('1').catch(() => undefined); }
}
const socketProof = (session: any) => ({ application: 'customer', sessionId: session.sessionId, loginId: session.loginId, csrfToken: session.csrfToken });

describe('real Socket.IO polling through the same-origin read proxy', () => {
  it('authenticates from the original polling GET and delivers a private room event', async () => {
    const { user, jar, session } = await signIn(), server = await socketServer();
    const transport = new Polling(server.port, { ...readMetadata('customer'), Cookie: jar.cookie });
    try {
      expect(await transport.open()).toBe(200);
      expect((await transport.connect(socketProof(session))).connected).toBe(true);
      const delivery = transport.poll();
      server.io.to('user:' + user.id).emit('proxy.private', { marker: 'only-this-session' });
      const received = await delivery;
      expect(received.status).toBe(200);
      expect(received.text.split('\x1e').some(packet => packet === '42["proxy.private",{"marker":"only-this-session"}]')).toBe(true);
    } finally { await transport.close(); await server.close(); }
  });
  it('rejects invalid CSRF, cross-application proof, and native-token downgrade on a browser polling handshake', async () => {
    const { user, jar, session } = await signIn(), native = await atomic(tx => authentication.issue(tx, user, {}));
    const server = await socketServer();
    try {
      for (const auth of [
        { ...socketProof(session), csrfToken: 'invalid' },
        { ...socketProof(session), application: 'management' },
        { token: native.accessToken },
      ]) {
        const transport = new Polling(server.port, { ...readMetadata('customer'), Cookie: jar.cookie });
        try {
          expect(await transport.open()).toBe(200);
          const result = await transport.connect(auth);
          expect(result.connected).toBe(false); expect(result.error).toBe('FORBIDDEN');
        } finally { await transport.close(); }
      }
      const invalidHeaders: Headers[] = [
        { Referer: origin('customer') + '/', 'Sec-Fetch-Site': 'same-origin' },
        { ...readMetadata('customer'), Referer: 'https://untrusted.invalid/' },
        { ...readMetadata('customer'), 'Sec-Fetch-Site': 'cross-site' },
        { ...readMetadata('customer'), Origin: 'null' }, { ...readMetadata('customer'), Origin: '' },
      ];
      for (const headers of invalidHeaders) {
        const transport = new Polling(server.port, { ...headers, Cookie: jar.cookie });
        try { expect(await transport.open()).toBe(403); } finally { await transport.close(); }
      }
    } finally { await server.close(); }
  });
  it('reconnects with rotated HTTP cookie proof, rejects stale proof, and denies reconnect after browser logout', async () => {
    const { user, jar, session } = await signIn(), server = await socketServer();
    const transports: Polling[] = [];
    const connect = async (sessionProof: any) => {
      const transport = new Polling(server.port, { ...readMetadata('customer'), Cookie: jar.cookie });
      transports.push(transport);
      expect(await transport.open()).toBe(200);
      return { transport, result: await transport.connect(socketProof(sessionProof)) };
    };
    try {
      const initial = await connect(session);
      expect(initial.result.connected).toBe(true);
      await initial.transport.close();
      const refreshed = await request(app).post('/api/v1/auth/refresh').set(direct('customer', session)).set('Cookie', jar.cookie).send({});
      expect(refreshed.status).toBe(200); jar.absorb(refreshed);
      const rotated = refreshed.body;
      expect(rotated.sessionId).not.toBe(session.sessionId);
      expect(rotated.loginId).toBe(session.loginId);
      const stale = await connect(session);
      expect(stale.result.connected).toBe(false);
      expect(['SESSION_CHANGED', 'UNAUTHORIZED']).toContain(stale.result.error);
      const latest = await connect(rotated);
      expect(latest.result.connected).toBe(true);
      const delivery = latest.transport.poll();
      server.io.to('user:' + user.id).emit('proxy.rotated', { marker: 'after-http-refresh' });
      const received = await delivery;
      expect(received.status).toBe(200);
      expect(received.text.split('\x1e').some(packet => packet === '42["proxy.rotated",{"marker":"after-http-refresh"}]')).toBe(true);
      const logout = await request(app).post('/api/v1/auth/web-session/logout').set(direct('customer', rotated)).set('Cookie', jar.cookie).send({});
      expect(logout.status).toBe(200); jar.absorb(logout);
      await latest.transport.close();
      const stopped = await connect(rotated);
      expect(stopped.result.connected).toBe(false);
      expect(['SESSION_CHANGED', 'UNAUTHORIZED']).toContain(stopped.result.error);
    } finally {
      await Promise.all(transports.map(transport => transport.close()));
      await server.close();
    }
  });
  it('revalidates and disconnects an established polling namespace when its session family is revoked', async () => {
    const { user, jar, session } = await signIn(), server = await socketServer();
    const nativeInterval = globalThis.setInterval;
    const accelerated = vi.spyOn(globalThis, 'setInterval').mockImplementation(((callback: (...args: any[]) => void, delay?: number, ...args: any[]) => nativeInterval(callback, delay === 30000 ? 25 : delay, ...args)) as typeof setInterval);
    const transport = new Polling(server.port, { ...readMetadata('customer'), Cookie: jar.cookie });
    try {
      const connected = new Promise<any>(resolve => server.io.once('connection', resolve));
      expect(await transport.open()).toBe(200);
      expect((await transport.connect(socketProof(session))).connected).toBe(true);
      const live = await connected;
      const disconnected = new Promise<void>(resolve => live.once('disconnect', () => resolve()));
      await authentication.revokeSessionFamily(user.id, session.loginId);
      await Promise.race([disconnected, new Promise<never>((_resolve, reject) => { const timeout = setTimeout(() => reject(new Error('Revoked polling namespace remained connected')), 5000); timeout.unref(); disconnected.finally(() => clearTimeout(timeout)); })]);
      expect(live.connected).toBe(false);
      const retry = new Polling(server.port, { ...readMetadata('customer'), Cookie: jar.cookie });
      try {
        expect(await retry.open()).toBe(200);
        const result = await retry.connect(socketProof(session));
        expect(result.connected).toBe(false);
        expect(['UNAUTHORIZED', 'SESSION_CHANGED']).toContain(result.error);
      } finally { await retry.close(); }
    } finally { await transport.close(); accelerated.mockRestore(); await server.close(); }
  });
});
