const { test, beforeEach, afterEach, after } = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { create, act } = require('react-test-renderer');
const { QueryClient, QueryClientProvider } = require('@tanstack/react-query');
const { createClientLoader } = require('./helpers/client-loader.cjs');

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const originalFetch = global.fetch, originalBase = process.env.EXPO_PUBLIC_API_BASE_URL;
const baseUrl = 'https://parkflow-test.invalid/api/v1';
process.env.EXPO_PUBLIC_API_BASE_URL = baseUrl;
after(() => {
  global.fetch = originalFetch;
  if (originalBase === undefined) delete process.env.EXPO_PUBLIC_API_BASE_URL;
  else process.env.EXPO_PUBLIC_API_BASE_URL = originalBase;
});
const response = body => ({ ok: true, status: 200, json: async () => body });
const calls = [], routes = [], persisted = new Map(), services = {};
const native = name => props => React.createElement(name, props, props.children);
const storage = {
  getItem: async key => persisted.get(key) ?? null,
  setItem: async (key, value) => { persisted.set(key, value); },
  removeItem: async key => { persisted.delete(key); },
};
const ui = Object.fromEntries(['AppButton', 'AppHeader', 'AppText', 'Avatar', 'Card', 'DetailRow', 'Divider', 'InlineNotice', 'Screen', 'TextField'].map(name => [name, native(name)]));
// Exercise the real profile screen, session hook, HTTP service, locale and auth
// store. Native rendering/navigation and device/network I/O remain external.
const load = createClientLoader({ stubs: {
  'react-native': { View: native('View'), Platform: { OS: 'web' }, I18nManager: { allowRTL() {} } },
  'expo-haptics': {},
  'expo-router': { useRouter: () => ({ back: () => routes.push('back') }) },
  '@parkflow/client/components/ui': ui,
  '@parkflow/client/services': { services },
  '@parkflow/client/services/storage': { appStorage: storage, secureStorage: storage, STORAGE_KEYS: { authSession: 'auth', preferences: 'preferences' } },
} });
services.profile = load('@parkflow/client/services/http/profileService').httpProfileService;
const PersonalInfoScreen = load('apps/customer/app/profile/personal.tsx').default;
const { useAuthStore } = load('@parkflow/client/store/authStore');
const { usePreferencesStore } = load('@parkflow/client/store/preferencesStore');
const { useCurrentUser } = load('@parkflow/client/hooks/useSession');
function ProfileSummary() {
  const { user: current } = useCurrentUser();
  return React.createElement('ProfileSummary', { fullName: current?.fullName, nationalIdMasked: current?.nationalIdMasked });
}
const session = current => ({ userId: current.id, accessToken: `access-${current.id}`, refreshToken: `refresh-${current.id}`, expiresAt: '2099-01-01T00:00:00Z' });
let renderer, client;
const user = overrides => ({
  id: 'email-user', fullName: 'Email Customer', email: 'customer@example.com', phone: null,
  emailVerifiedAt: '2026-10-14T12:00:00Z', phoneVerifiedAt: null, role: 'USER',
  profileCompletedAt: '2026-10-14T12:00:00Z', createdAt: '2026-10-14T12:00:00Z', nationalIdMasked: null,
  ...overrides,
});
beforeEach(() => {
  calls.length = 0; routes.length = 0; persisted.clear();
  global.fetch = (url, options) => new Promise((resolve, reject) => calls.push({
    url: url.slice(baseUrl.length), request: options,
    options: options.method === 'GET' ? undefined : { method: options.method, body: JSON.parse(options.body) },
    resolve: body => resolve(response(body)), reject,
  }));
  // Keep the real locale hook while explicitly selecting the labels asserted below.
  usePreferencesStore.getState().setLocale('en');
  useAuthStore.setState({ user: undefined, session: undefined, hydrated: true });
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false, gcTime: Infinity } } });
});
afterEach(async () => { await act(async () => renderer?.unmount()); client.clear(); renderer = undefined; });
const field = label => renderer.root.findAllByType('TextField').find(node => node.props.label === label);
async function settle(index, result) {
  assert.ok(calls[index], `Expected profile request ${index}`);
  await act(async () => { calls[index].resolve(result); await new Promise(resolve => setTimeout(resolve, 10)); });
}
async function mount(current) {
  useAuthStore.setState({ user: current, session: session(current) });
  await act(async () => { renderer = create(React.createElement(QueryClientProvider, { client }, React.createElement(React.Fragment, null, React.createElement(PersonalInfoScreen), React.createElement(ProfileSummary)))); });
  assert.equal(calls[0].url, '/users/me');
  await settle(0, current);
}
async function enter(label, value) {
  const input = field(label);
  assert.ok(input, `Expected field ${label}`);
  await act(async () => input.props.onChangeText(value));
}
async function save() { await act(async () => renderer.root.findByType('AppButton').props.onPress()); }

test('verified email customers can update their name and national ID without a phone', async () => {
  const current = user();
  await mount(current);
  const nationalId = field('New national ID (optional)');
  assert.ok(nationalId, 'Verified email should enable national ID replacement');
  const email = field('Email');
  assert.ok(email, 'The sign-in email remains visible');
  assert.equal(email.props.editable, false);
  await enter('Full name', '  Updated Customer  ');
  await enter('New national ID (optional)', '١٢٣٤٥٦٧٨٩');
  await save();
  assert.equal(calls[1].url, '/users/me');
  assert.deepEqual(calls[1].options, { method: 'PATCH', body: { fullName: 'Updated Customer', nationalId: '123456789' } });
  await settle(1, user({ fullName: 'Updated Customer', nationalIdMasked: '*****6789' }));
  assert.equal(useAuthStore.getState().user.fullName, 'Updated Customer');
  assert.equal(useAuthStore.getState().user.email, 'customer@example.com');
  assert.equal(renderer.root.findByType('ProfileSummary').props.fullName, 'Updated Customer');
  assert.equal(renderer.root.findByType('ProfileSummary').props.nationalIdMasked, '*****6789');
  assert.deepEqual(routes, ['back']);
});

test('a verified primary email stays read-only when the customer also has a verified phone', async () => {
  await mount(user({ phone: '+970599123456', phoneVerifiedAt: '2026-10-14T12:00:00Z' }));
  const email = field('Email');
  assert.ok(email);
  assert.equal(email.props.editable, false);
  await enter('Full name', 'Updated Customer');
  if (email.props.onChangeText) await act(async () => email.props.onChangeText('replacement@example.com'));
  await save();
  assert.deepEqual(calls[1].options.body, { fullName: 'Updated Customer' });
});

test('phone customers retain editable unverified contact email', async () => {
  await mount(user({ emailVerifiedAt: null, phone: '+970599123456', phoneVerifiedAt: '2026-10-14T12:00:00Z' }));
  await enter('Email', '  Contact@Example.com  ');
  await save();
  assert.deepEqual(calls[1].options.body, { fullName: 'Email Customer', email: 'contact@example.com' });
});


test('a completed profile save cannot update a different signed-in account or its navigation', async () => {
  const current = user();
  await mount(current);
  await enter('Full name', 'Updated Customer');
  await save();
  const other = user({ id: 'other-user', fullName: 'Other Customer', email: 'other@example.com' });
  await act(async () => useAuthStore.setState({ user: other, session: session(other) }));
  await settle(1, user({ fullName: 'Updated Customer' }));
  assert.equal(useAuthStore.getState().user.id, 'other-user');
  assert.equal(client.getQueryData(['profile', 'other-user']).fullName, 'Other Customer');
  assert.equal(client.getQueryData(['profile', 'email-user']).fullName, 'Email Customer');
  assert.deepEqual(routes, []);
});

test('a save that finishes after leaving personal information cannot navigate the next screen', async () => {
  await mount(user());
  await enter('Full name', 'Updated Customer');
  await save();
  await act(async () => renderer.update(React.createElement(QueryClientProvider, { client }, React.createElement(ProfileSummary))));
  await settle(1, user({ fullName: 'Updated Customer' }));
  assert.deepEqual(routes, []);
});


test('an older profile read cannot replace the saved profile shown on screen', async () => {
  await mount(user());
  await act(async () => { void client.refetchQueries({ queryKey: ['profile', 'email-user'], exact: true }); });
  await enter('Full name', 'Updated Customer');
  await save();
  await settle(2, user({ fullName: 'Updated Customer' }));
  await settle(1, user());
  assert.equal(renderer.root.findByType('ProfileSummary').props.fullName, 'Updated Customer');
  assert.deepEqual(routes, ['back']);
});


test('a profile save cannot update a new login for the same user while cancellation is pending', async () => {
  await mount(user());
  await enter('Full name', 'Updated Customer');
  const cancelQueries = client.cancelQueries.bind(client);
  let releaseCancellation, markCancelling;
  const cancelling = new Promise(resolve => { markCancelling = resolve; });
  client.cancelQueries = async options => {
    await cancelQueries(options);
    markCancelling();
    await new Promise(resolve => { releaseCancellation = resolve; });
  };
  await save();
  await settle(1, user({ fullName: 'Updated Customer' }));
  await cancelling;
  const relogged = user({ fullName: 'Reauthenticated Customer' });
  await act(async () => {
    useAuthStore.setState({ user: relogged, session: { ...session(relogged), accessToken: 'new-login-access', refreshToken: 'new-login-refresh' } });
    client.setQueryData(['profile', relogged.id], relogged);
    releaseCancellation();
    await new Promise(resolve => setTimeout(resolve, 10));
  });
  assert.equal(useAuthStore.getState().user.fullName, 'Reauthenticated Customer');
  assert.equal(client.getQueryData(['profile', relogged.id]).fullName, 'Reauthenticated Customer');
  assert.equal(renderer.root.findByType('ProfileSummary').props.fullName, 'Reauthenticated Customer');
  assert.deepEqual(routes, []);
});


test('a profile save publishes its result after its native login refreshes', async () => {
  const current = user();
  await mount(current);
  await act(async () => useAuthStore.setState({ session: { ...session(current), expiresAt: '2000-01-01T00:00:00Z' } }));
  await enter('Full name', 'Updated Customer');
  await save();
  assert.equal(calls[1].url, '/auth/refresh');
  await settle(1, { ...session(current), accessToken: 'rotated-access', refreshToken: 'rotated-refresh' });
  assert.equal(calls[2].url, '/users/me');
  assert.equal(calls[2].request.headers.Authorization, 'Bearer rotated-access');
  await settle(2, user({ fullName: 'Updated Customer' }));
  assert.equal(useAuthStore.getState().user.fullName, 'Updated Customer');
  assert.equal(client.getQueryData(['profile', current.id]).fullName, 'Updated Customer');
  assert.equal(renderer.root.findByType('ProfileSummary').props.fullName, 'Updated Customer');
  assert.deepEqual(routes, ['back']);
});

test('a profile save publishes its result after its browser login refreshes', async () => {
  const webServices = {}, current = user(), requests = [];
  const initial = { transport: 'cookie', userId: current.id, sessionId: 'initial-session', loginId: 'same-login', csrfToken: 'initial-csrf', expiresAt: '2000-01-01T00:00:00Z' };
  const rotated = { ...initial, sessionId: 'rotated-session', csrfToken: 'rotated-csrf', expiresAt: '2099-01-01T00:00:00Z' };
  const webLoad = createClientLoader({ stubs: {
    'react-native': { View: native('View'), Platform: { OS: 'web' }, I18nManager: { allowRTL() {} } },
    'expo-haptics': {},
    'expo-router': { useRouter: () => ({ back: () => routes.push('back') }) },
    '@parkflow/client/components/ui': ui,
    '@parkflow/client/services': { services: webServices },
    '@react-native-async-storage/async-storage': storage,
    'expo-secure-store': { getItemAsync: storage.getItem, setItemAsync: storage.setItem, deleteItemAsync: storage.removeItem },
  } });
  webServices.profile = webLoad('@parkflow/client/services/http/profileService').httpProfileService;
  const webStore = webLoad('@parkflow/client/store/authStore').useAuthStore;
  const WebPersonalInfo = webLoad('apps/customer/app/profile/personal.tsx').default;
  const useWebCurrentUser = webLoad('@parkflow/client/hooks/useSession').useCurrentUser;
  webLoad('@parkflow/client/store/preferencesStore').usePreferencesStore.getState().setLocale('en');
  function WebProfileSummary() {
    const { user: visible } = useWebCurrentUser();
    return React.createElement('ProfileSummary', { fullName: visible?.fullName });
  }
  global.fetch = async (url, options) => {
    requests.push({ url: url.slice(baseUrl.length), options });
    if (url.endsWith('/auth/web-session/bootstrap')) return response({ session: initial, user: current });
    if (url.endsWith('/auth/refresh')) return response(rotated);
    assert.equal(options.method, 'PATCH');
    assert.equal(options.headers['X-ParkFlow-Session'], 'rotated-session');
    assert.deepEqual(JSON.parse(options.body), { fullName: 'Updated Customer' });
    return response(user({ fullName: 'Updated Customer' }));
  };
  await webStore.getState().signIn(initial, current);
  client.setDefaultOptions({ queries: { staleTime: Infinity, retry: false, gcTime: Infinity }, mutations: { retry: false, gcTime: Infinity } });
  await act(async () => { renderer = create(React.createElement(QueryClientProvider, { client }, React.createElement(React.Fragment, null, React.createElement(WebPersonalInfo), React.createElement(WebProfileSummary)))); });
  await enter('Full name', 'Updated Customer');
  await act(async () => {
    renderer.root.findByType('AppButton').props.onPress();
    await new Promise(resolve => setTimeout(resolve, 15));
  });
  assert.deepEqual(requests.map(request => request.url), ['/auth/web-session/bootstrap', '/auth/refresh', '/users/me']);
  assert.equal(webStore.getState().session.sessionId, 'rotated-session');
  assert.equal(webStore.getState().user.fullName, 'Updated Customer');
  assert.equal(client.getQueryData(['profile', current.id]).fullName, 'Updated Customer');
  assert.equal(renderer.root.findByType('ProfileSummary').props.fullName, 'Updated Customer');
  assert.deepEqual(routes, ['back']);
});
