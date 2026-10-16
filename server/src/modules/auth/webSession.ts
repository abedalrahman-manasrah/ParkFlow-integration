import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';
import jwt from 'jsonwebtoken';
import { env, webOrigins } from '../../config/env';
import { atomic, db } from '../../database/client';
import { redis } from '../../database/redis';
import { ApiError, assert } from '../../utils/errors';
import { resolveBrowserOrigin } from '../../utils/browserOrigin';
import { userView } from '../users/service';
import {
  authenticate, authenticateWeb, digest, inspectWebRefresh, refresh, refreshWeb, verifyWebAccess, revokeSessionFamily, lockSessionFamily,
  type AuthMeta, type NativeSession, type WebApplication, type WebBinding,
} from './service';

export type WebSession = {
  transport: 'cookie'; userId: string; sessionId: string; loginId: string;
  expiresAt: string; csrfToken: string;
};
export type WebContext = { application: WebApplication; cookies: Map<string, string> };
type BrowserContext = WebContext & WebBinding;
type ActiveSession = {
  userId: string; familyId: string; sessionId: string;
  accessExpiresAt: string; refreshExpiresAt: string;
};
type Selection = { value: ActiveSession; raw: string };
type Lease = { key: string; token: string };

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const browserId = /^[A-Za-z0-9_-]{43}$/;
const cookiePrefix = env.NODE_ENV === 'production' ? '__Host-parkflow-' : 'parkflow-';
const cookieOptions = { httpOnly: true, secure: env.NODE_ENV === 'production', sameSite: 'strict' as const, path: '/' };
const browserCookie = (app: WebApplication) => `${cookiePrefix}${app}-browser`;
const familyCookie = (app: WebApplication, family: string, kind: 'access' | 'refresh') => `${cookiePrefix}${app}-${family}-${kind}`;
const activeKey = (context: BrowserContext) => `web:active:${context.application}:${context.webBrowserId}`;
const lockKey = (context: BrowserContext) => `web:lock:${context.application}:${context.webBrowserId}`;
const changed = () => new ApiError(401, 'SESSION_CHANGED', 'The browser session has changed. Restore it before continuing.');

function cookies(req: Request) {
  const parsed = new Map<string, string>();
  for (const part of (req.get('Cookie') ?? '').split(';')) {
    const at = part.indexOf('=');
    if (at < 1) continue;
    const name = part.slice(0, at).trim();
    if (!/^(?:__Host-)?parkflow-(?:customer|management)-/.test(name)) continue;
    assert(!parsed.has(name), 'FORBIDDEN', 'Duplicate browser credentials', 403);
    // All ParkFlow values are base64url, JWT or UUID; encoded aliases are rejected.
    const value = part.slice(at + 1).trim();
    assert(/^[A-Za-z0-9_.-]*$/.test(value), 'FORBIDDEN', 'Invalid browser credentials', 403);
    parsed.set(name, value);
  }
  return parsed;
}

// Resolve trusted browser reads before selecting transport; unsafe requests
// still require a real Origin before an OTP is consumed or credentials are issued.
export function webContext(req: Request): WebContext | null {
  const origin = resolveBrowserOrigin(req), application = req.get('X-ParkFlow-App');
  if (origin === null) {
    assert(application === undefined, 'FORBIDDEN', 'A browser application requires its trusted Origin', 403);
    return null;
  }
  assert(application === 'customer' || application === 'management', 'FORBIDDEN', 'A trusted browser application is required', 403);
  assert(webOrigins[application].includes(origin), 'FORBIDDEN', 'Origin does not match this application', 403);
  return { application, cookies: cookies(req) };
}

function requireWeb(req: Request) {
  const context = webContext(req);
  assert(context, 'FORBIDDEN', 'This endpoint requires a trusted browser application', 403);
  return context;
}
function browserContext(context: WebContext): BrowserContext | null {
  const id = context.cookies.get(browserCookie(context.application));
  if (!id) return null;
  assert(browserId.test(id), 'UNAUTHORIZED', 'Invalid browser slot', 401);
  return { ...context, webApplication: context.application, webBrowserId: digest(id) };
}
function requireBrowser(context: WebContext, initialization = false) {
  const browser = browserContext(context);
  assert(browser, initialization ? 'WEB_SESSION_REQUIRED' : 'UNAUTHORIZED',
    initialization ? 'Initialize the browser session before signing in' : 'Browser session has ended', initialization ? 403 : 401);
  return browser;
}
function response(req: Request) {
  assert(req.res, 'INTERNAL', 'Browser response is unavailable', 500);
  req.res.set('Cache-Control', 'no-store');
  return req.res;
}
function meta(req: Request): AuthMeta {
  return { ip: req.ip, device: req.get('user-agent')?.slice(0, 500) };
}
function csrf(context: BrowserContext, familyId: string, sessionId: string) {
  return createHmac('sha256', env.JWT_ACCESS_SECRET)
    .update(JSON.stringify(['parkflow-web-csrf-v1', context.application, context.webBrowserId, familyId, sessionId]))
    .digest('base64url');
}
function safeEqual(actual: string | undefined, expected: string) {
  if (!actual || actual.length !== expected.length) return false;
  const left = Buffer.from(actual), right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}
function expectedIdentity(req: Request) {
  const sessionId = req.get('X-ParkFlow-Session'), familyId = req.get('X-ParkFlow-Login');
  assert(sessionId && familyId && uuid.test(sessionId) && uuid.test(familyId), 'FORBIDDEN', 'Expected browser session identity is required', 403);
  return { sessionId, familyId };
}
function checkCsrf(req: Request, context: BrowserContext, familyId: string, sessionId: string) {
  assert(safeEqual(req.get('X-ParkFlow-CSRF'), csrf(context, familyId, sessionId)), 'FORBIDDEN', 'Invalid browser CSRF proof', 403);
}
function sessionView(context: BrowserContext, selected: ActiveSession, expiresAt = selected.accessExpiresAt): WebSession {
  return { transport: 'cookie', userId: selected.userId, sessionId: selected.sessionId, loginId: selected.familyId,
    expiresAt, csrfToken: csrf(context, selected.familyId, selected.sessionId) };
}

async function selection(context: BrowserContext): Promise<Selection | null> {
  const raw = await redis.get(activeKey(context));
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as ActiveSession;
    if (!value || !uuid.test(value.userId) || !uuid.test(value.familyId) || !uuid.test(value.sessionId)
      || !Number.isFinite(Date.parse(value.accessExpiresAt)) || !Number.isFinite(Date.parse(value.refreshExpiresAt))) return null;
    return { value, raw };
  } catch { return null; }
}
async function sameSelection(context: BrowserContext, selected: Selection) {
  return await redis.get(activeKey(context)) === selected.raw;
}
async function expectedSelection(req: Request, context: BrowserContext) {
  const expected = expectedIdentity(req), selected = await selection(context);
  if (!selected || selected.value.familyId !== expected.familyId || selected.value.sessionId !== expected.sessionId) throw changed();
  return selected;
}
async function acquire(context: BrowserContext): Promise<Lease> {
  const lease = { key: lockKey(context), token: randomUUID() }, until = Date.now() + 5000;
  do {
    if (await redis.set(lease.key, lease.token, 'PX', 30000, 'NX') === 'OK') return lease;
    await new Promise(resolve => setTimeout(resolve, 25));
  } while (Date.now() < until);
  throw new ApiError(409, 'SESSION_BUSY', 'Another browser session operation is in progress. Try again.');
}
async function release(lease: Lease) {
  await redis.eval(`if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('DEL',KEYS[1]) end return 0`, 1, lease.key, lease.token);
}
async function owns(context: BrowserContext, lease: Lease, selected: Selection | null) {
  return Number(await redis.eval(`
    if redis.call('GET',KEYS[1])~=ARGV[1] then return 0 end
    if (redis.call('GET',KEYS[2]) or '')~=ARGV[2] then return 0 end
    return 1
  `, 2, lease.key, activeKey(context), lease.token, selected?.raw ?? '')) === 1;
}
async function publish(context: BrowserContext, lease: Lease, previous: Selection | null, next: ActiveSession | null) {
  const raw = next ? JSON.stringify(next) : '';
  const ttl = next ? Math.max(1, Date.parse(next.refreshExpiresAt) - Date.now()) : 1;
  const result = await redis.eval(`
    if redis.call('GET',KEYS[1])~=ARGV[1] then return 0 end
    if (redis.call('GET',KEYS[2]) or '')~=ARGV[2] then return 0 end
    if ARGV[3]=='' then redis.call('DEL',KEYS[2]) else redis.call('SET',KEYS[2],ARGV[3],'PX',ARGV[4]) end
    return 1
  `, 2, lease.key, activeKey(context), lease.token, previous?.raw ?? '', raw, ttl);
  if (Number(result) !== 1) throw changed();
  return next ? { value: next, raw } : null;
}
function deliveredSelection(session: NativeSession, context: BrowserContext): ActiveSession {
  const access = verifyWebAccess(session.accessToken, context);
  const refreshClaims = jwt.decode(session.refreshToken) as jwt.JwtPayload;
  assert(access.familyId && typeof refreshClaims?.exp === 'number' && refreshClaims.jti === access.sid
    && refreshClaims.familyId === access.familyId && session.userId === access.userId, 'UNAUTHORIZED', 'Invalid issued browser credentials', 401);
  return { userId: access.userId, familyId: access.familyId, sessionId: access.sid,
    accessExpiresAt: new Date(access.exp * 1000).toISOString(), refreshExpiresAt: new Date(refreshClaims.exp * 1000).toISOString() };
}
function setCredentials(req: Request, context: BrowserContext, session: NativeSession, selected: ActiveSession) {
  const res = response(req);
  res.cookie(familyCookie(context.application, selected.familyId, 'access'), session.accessToken,
    { ...cookieOptions, maxAge: Math.max(1, Date.parse(selected.accessExpiresAt) - Date.now()) });
  res.cookie(familyCookie(context.application, selected.familyId, 'refresh'), session.refreshToken,
    { ...cookieOptions, maxAge: Math.max(1, Date.parse(selected.refreshExpiresAt) - Date.now()) });
}
function clearCredentials(req: Request, context: BrowserContext, familyId: string) {
  const res = response(req);
  res.clearCookie(familyCookie(context.application, familyId, 'access'), cookieOptions);
  res.clearCookie(familyCookie(context.application, familyId, 'refresh'), cookieOptions);
}
async function refreshProof(context: BrowserContext, selected: ActiveSession) {
  const token = context.cookies.get(familyCookie(context.application, selected.familyId, 'refresh'));
  assert(token, 'UNAUTHORIZED', 'Browser refresh proof is missing', 401);
  const record = await inspectWebRefresh(token, context);
  if (record.id !== selected.sessionId || record.userId !== selected.userId || record.familyId !== selected.familyId) throw changed();
  return { token, record };
}

export async function webIssue(req: Request, operation: (meta: AuthMeta) => Promise<{ session: NativeSession; user: any; isNewUser: boolean }>): Promise<unknown> {
  const transport = webContext(req);
  if (!transport) return operation(meta(req));
  const context = requireBrowser(transport, true), lease = await acquire(context);
  let issued: ActiveSession | undefined;
  try {
    const previous = await selection(context);
    const result = await operation({ ...meta(req), webApplication: context.application, webBrowserId: context.webBrowserId });
    issued = deliveredSelection(result.session, context);
    const published = await publish(context, lease, previous, issued);
    // Only a successfully selected login can revoke its predecessor. If the
    // lease expired during the database operation, the current login is intact.
    if (previous && previous.value.familyId !== issued.familyId) await revokeSessionFamily(previous.value.userId, previous.value.familyId);
    if (!await owns(context, lease, published)) throw changed();
    setCredentials(req, context, result.session, issued);
    if (previous && previous.value.familyId !== issued.familyId) clearCredentials(req, context, previous.value.familyId);
    return { ...result, session: sessionView(context, issued) };
  } catch (error) {
    if (issued) await revokeSessionFamily(issued.userId, issued.familyId);
    throw error;
  } finally { await release(lease); }
}

export async function webBootstrap(req: Request): Promise<{ session: WebSession | null; user: any | null }> {
  const transport = requireWeb(req);
  let context = browserContext(transport);
  const res = response(req);
  if (!context) {
    const id = randomBytes(32).toString('base64url');
    res.cookie(browserCookie(transport.application), id, { ...cookieOptions, maxAge: env.REFRESH_TOKEN_TTL * 1000 });
    return { session: null, user: null };
  }
  const selected = await selection(context);
  if (!selected) return { session: null, user: null };
  try {
    const proof = await refreshProof(context, selected.value);
    let expiresAt = new Date(Math.min(Date.parse(selected.value.accessExpiresAt), Date.now() - 1000)).toISOString();
    const token = context.cookies.get(familyCookie(context.application, selected.value.familyId, 'access'));
    if (token) {
      let verified: ReturnType<typeof verifyWebAccess> | undefined;
      try {
        verified = verifyWebAccess(token, context);
      } catch (error) {
        if (!(error instanceof ApiError && error.status === 401)) throw error;
      }
      if (verified && verified.userId === selected.value.userId && verified.sid === selected.value.sessionId && verified.familyId === selected.value.familyId) {
        // Expired/missing access can recover through the proven refresh cookie.
        // A live access token denied by database revocation/status/lifetime
        // must not be reinterpreted as an ordinary access-token expiry.
        const claims = await authenticateWeb(token, context);
        expiresAt = new Date(claims.exp * 1000).toISOString();
      }
    }
    if (!await sameSelection(context, selected)) return { session: null, user: null };
    return { session: sessionView(context, selected.value, expiresAt), user: userView(proof.record.user) };
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return { session: null, user: null };
    throw error;
  }
}

export async function webRefresh(req: Request, body: { refreshToken?: string }): Promise<NativeSession | WebSession> {
  const transport = webContext(req);
  if (!transport) {
    assert(typeof body.refreshToken === 'string' && body.refreshToken.length > 0, 'UNAUTHORIZED', 'Refresh token is required', 401);
    return refresh(body.refreshToken, meta(req));
  }
  assert(body.refreshToken === undefined, 'FORBIDDEN', 'Browser refresh uses cookie credentials', 403);
  const context = requireBrowser(transport), lease = await acquire(context);
  let issued: ActiveSession | undefined;
  try {
    const selected = await expectedSelection(req, context);
    checkCsrf(req, context, selected.value.familyId, selected.value.sessionId);
    // Check the authoritative nonce before rotation: a stale tab must never
    // trigger the native refresh-token replay family revocation rule.
    const proof = await refreshProof(context, selected.value);
    const result = await refreshWeb(proof.token, { ...meta(req), webApplication: context.application, webBrowserId: context.webBrowserId });
    issued = deliveredSelection(result, context);
    const published = await publish(context, lease, selected, issued);
    if (!await owns(context, lease, published)) throw changed();
    setCredentials(req, context, result, issued);
    return sessionView(context, issued);
  } catch (error) {
    if (issued) {
      const abandoned = issued;
      await atomic(async tx => {
        await lockSessionFamily(tx, abandoned.userId, abandoned.familyId);
        await tx.refreshToken.updateMany({ where: { id: abandoned.sessionId, userId: abandoned.userId, revokedAt: null }, data: { revokedAt: new Date() } });
      }, 'ReadCommitted');
    }
    throw error;
  } finally { await release(lease); }
}

export async function webLogout(req: Request): Promise<{ ok: true }> {
  const context = requireBrowser(requireWeb(req)), expected = expectedIdentity(req), lease = await acquire(context);
  try {
    checkCsrf(req, context, expected.familyId, expected.sessionId);
    const token = context.cookies.get(familyCookie(context.application, expected.familyId, 'refresh'));
    assert(token, 'UNAUTHORIZED', 'Logout requires proof of the selected login', 401);
    // Cleanup may prove a revoked older family, or an earlier sid in the same
    // rotated family. It can only revoke and clear names of that proven family.
    const record = await inspectWebRefresh(token, context, true);
    const initiating = await db.refreshToken.findUnique({ where: { id: expected.sessionId } });
    assert(record.familyId === expected.familyId && initiating?.userId === record.userId && initiating.familyId === record.familyId,
      'UNAUTHORIZED', 'Invalid logout session proof', 401);
    const selected = await selection(context);
    if (!await owns(context, lease, selected)) throw changed();
    await revokeSessionFamily(record.userId, record.familyId);
    if (!await owns(context, lease, selected)) throw changed();
    if (selected?.value.familyId === record.familyId) await publish(context, lease, selected, null);
    clearCredentials(req, context, record.familyId);
    return { ok: true };
  } finally { await release(lease); }
}

export async function authenticateRequest(req: Request) {
  const transport = webContext(req);
  if (!transport) {
    const authorization = req.get('Authorization');
    const token = authorization?.match(/^Bearer ([^\s]+)$/i)?.[1];
    assert(token, 'UNAUTHORIZED', 'Sign in to continue', 401);
    return authenticate(token);
  }
  const context = requireBrowser(transport), selected = await expectedSelection(req, context);
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method.toUpperCase())) checkCsrf(req, context, selected.value.familyId, selected.value.sessionId);
  const token = context.cookies.get(familyCookie(context.application, selected.value.familyId, 'access'));
  assert(token, 'UNAUTHORIZED', 'Browser access credential is missing', 401);
  const claims = await authenticateWeb(token, context);
  if (claims.sid !== selected.value.sessionId || claims.userId !== selected.value.userId || claims.familyId !== selected.value.familyId
    || !await sameSelection(context, selected)) throw changed();
  return claims;
}
