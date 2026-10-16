import type { AuthSession, User, WebAuthSession } from '@parkflow/contracts';
import { appStorage, browserSessionsEnabled, STORAGE_KEYS } from '../storage';
import { clientApplication, runtimeWebSocketPolling } from '../../runtime/application';
import { AppError } from '../../utils/errors';

export const webSessionsEnabled = browserSessionsEnabled === true;
export const isWebSession = (session: AuthSession | undefined): session is WebAuthSession => session?.transport === 'cookie';
export const sessionIdentity = (session: AuthSession | undefined): string | undefined => isWebSession(session) ? session.sessionId : session?.accessToken;
export interface BrowserBinding { userId: string; loginId: string }
export interface WebBootstrap { session: WebAuthSession; user: User }
export const bindingOf = (session: WebAuthSession): BrowserBinding => ({ userId: session.userId, loginId: session.loginId });
export const sameBrowserLogin = (left: BrowserBinding | undefined, right: BrowserBinding | undefined): boolean => !!left && !!right && left.userId === right.userId && left.loginId === right.loginId;
export const sessionChanged = () => new AppError('unauthorized', 'Session changed', { serverCode: 'SESSION_CHANGED' });

export function validateWebSession(value: unknown): WebAuthSession {
  const session = value as Partial<WebAuthSession> | null;
  if (!session || session.transport !== 'cookie'
    || ![session.userId, session.sessionId, session.loginId, session.csrfToken].every(item => typeof item === 'string' && item.length > 0 && item.length <= 4096)
    || typeof session.expiresAt !== 'string' || !Number.isFinite(Date.parse(session.expiresAt))
    || 'accessToken' in session || 'refreshToken' in session) throw new AppError('unauthorized', 'Invalid browser session');
  return session as WebAuthSession;
}

let localAuthTail: Promise<unknown> = Promise.resolve();
/** Hold through Set-Cookie handling, cancellation cleanup, and store publication. */
export function withBrowserAuthLock<T>(operation: () => Promise<T>): Promise<T> {
  const run = () => {
    const locks = typeof navigator === 'undefined' ? undefined : navigator.locks;
    return locks ? locks.request(`parkflow:${clientApplication}:authentication`, operation) : operation();
  };
  const result = localAuthTail.then(run, run);
  localAuthTail = result.catch(() => undefined);
  return result;
}

async function readBinding(key: string): Promise<BrowserBinding | undefined> {
  const raw = await appStorage.getItem(key);
  if (!raw) return;
  try {
    const binding = JSON.parse(raw) as BrowserBinding;
    if (typeof binding.userId === 'string' && typeof binding.loginId === 'string') return binding;
  } catch { /* Malformed device metadata is not proof of authentication. */ }
  // Invalid fencing metadata must fail closed instead of enabling cookie restoration.
  throw sessionChanged();
}
export const readBrowserBinding = () => readBinding(STORAGE_KEYS.webBinding);
export const readLogoutFence = () => readBinding(STORAGE_KEYS.webLogoutFence);
export const saveBrowserBinding = (session: WebAuthSession) => appStorage.setItem(STORAGE_KEYS.webBinding, JSON.stringify(bindingOf(session)));
export const markBrowserLogout = (session: WebAuthSession) => appStorage.setItem(STORAGE_KEYS.webLogoutFence, JSON.stringify(bindingOf(session)));
export async function clearLogoutFence(session?: WebAuthSession): Promise<void> {
  const fence = await readLogoutFence();
  if (!fence || !session || sameBrowserLogin(fence, bindingOf(session))) await appStorage.removeItem(STORAGE_KEYS.webLogoutFence);
}
export async function browserLogout(session: WebAuthSession): Promise<void> {
  const { api } = await import('./apiClient');
  await api('/auth/web-session/logout', { method: 'POST', body: {}, public: true, webSession: session });
  await clearLogoutFence(session);
}

/** Called only while holding the browser lock. Never trust a persisted profile. */
export async function bootstrapBrowserSession(expectedLogin?: BrowserBinding, logoutOnly = false): Promise<WebBootstrap | undefined> {
  const { api } = await import('./apiClient');
  const result = await api<{ session: unknown; user: User | null }>('/auth/web-session/bootstrap', { public: true });
  if (!result.session) {
    if (expectedLogin && !logoutOnly) throw sessionChanged();
    await clearLogoutFence();
    return;
  }
  const session = validateWebSession(result.session);
  if (!result.user || result.user.id !== session.userId) throw new AppError('unauthorized', 'Invalid browser identity');
  if (expectedLogin && !sameBrowserLogin(expectedLogin, bindingOf(session))) throw sessionChanged();
  // Logout may inspect current rotation but never publishes authentication or
  // depends on successful browser storage access before revoking the server.
  if (logoutOnly) return { session, user: result.user };
  const fence = await readLogoutFence();
  if (sameBrowserLogin(fence, bindingOf(session))) {
    await browserLogout(session);
    if (expectedLogin) throw sessionChanged();
    return;
  }
  // Another explicit login is authoritative; an old pending logout cannot revoke it.
  if (fence) await clearLogoutFence();
  const remembered = expectedLogin ?? await readBrowserBinding();
  if (remembered && !sameBrowserLogin(remembered, bindingOf(session))) throw sessionChanged();
  return { session, user: result.user };
}

export function webRequestHeaders(session?: WebAuthSession): Record<string, string> {
  return { 'X-ParkFlow-App': clientApplication, ...(session ? {
    'X-ParkFlow-Session': session.sessionId,
    'X-ParkFlow-Login': session.loginId,
    'X-ParkFlow-CSRF': session.csrfToken,
  } : {}) };
}
export function socketSessionOptions(session: AuthSession) {
  const transports: ('polling' | 'websocket')[] = webSessionsEnabled && isWebSession(session) && runtimeWebSocketPolling ? ['polling'] : ['websocket'];
  return isWebSession(session)
    ? { auth: { application: clientApplication, sessionId: session.sessionId, loginId: session.loginId, csrfToken: session.csrfToken }, withCredentials: true, transports }
    : { auth: { token: session.accessToken }, transports };
}
