const { test, beforeEach, afterEach, after } = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { create, act } = require('react-test-renderer');
const { QueryClient, QueryClientProvider } = require('@tanstack/react-query');
const { createClientLoader } = require('./helpers/client-loader.cjs');

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const originalFetch = global.fetch, originalBase = process.env.EXPO_PUBLIC_API_BASE_URL;
process.env.EXPO_PUBLIC_API_BASE_URL = 'https://parkflow-test.invalid/api/v1';
after(() => {
  global.fetch = originalFetch;
  if (originalBase === undefined) delete process.env.EXPO_PUBLIC_API_BASE_URL;
  else process.env.EXPO_PUBLIC_API_BASE_URL = originalBase;
});
const native = name => props => React.createElement(name, props, props.children);
const storage = { getItem: async () => null, setItem: async () => {}, removeItem: async () => {} };
const ui = Object.fromEntries(['AppButton', 'AppHeader', 'AppText', 'BottomSheet', 'Card', 'EmptyState', 'ErrorState', 'InlineNotice', 'PressableScale', 'Screen', 'SearchField', 'Segmented', 'StatusBadge', 'TextField'].map(name => [name, native(name)]));
const services = {};
const load = createClientLoader({ application: 'management', stubs: {
  'react-native': { View: native('View'), ActivityIndicator: native('ActivityIndicator'), StyleSheet: { create: value => value }, Platform: { OS: 'android' } },
  'expo-router': { useRouter: () => ({ push() {} }) },
  'lucide-react-native': Object.fromEntries(['Activity', 'Flag', 'History', 'MapPinned', 'ShieldCheck', 'Users', 'XCircle', 'Search', 'UserRound', 'UserRoundCheck', 'UserRoundX', 'ShieldAlert', 'ClipboardList'].map(name => [name, () => null])),
  '@parkflow/client/components/ui': ui,
  '@parkflow/client/hooks/useLocale': { useLocale: () => ({ locale: 'en', row: 'row', dateLocale: 'en', textAlign: 'left', t: key => key }) },
  '@parkflow/client/theme/ThemeProvider': { useTheme: () => ({ colors: {} }) },
  '@parkflow/client/services': { services },
  '@parkflow/client/services/storage': { secureStorage: storage, appStorage: storage, STORAGE_KEYS: { authSession: 'admin-test-auth' } },
} });
services.admin = load('@parkflow/client/services/http/adminService').httpAdminService;
const { useAuthStore } = load('@parkflow/client/store/authStore');
const AdminHome = load('apps/management/app/admin/index.tsx').default;
const { AdminUsers } = load('apps/management/src/components/admin/AdminUsers.tsx');
let renderer, client, calls;
beforeEach(() => {
  calls = [];
  global.fetch = (url, options) => new Promise(resolve => calls.push({ url: new URL(url), options, resolve: (body, status = 200) => resolve({ ok: status < 400, status, json: async () => body }) }));
  useAuthStore.setState({ user: { id: 'admin-a', fullName: 'Administrator', role: 'ADMIN' }, session: { userId: 'admin-a', accessToken: 'access', refreshToken: 'refresh', expiresAt: '2099-01-01T00:00:00Z' }, hydrated: true });
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false, gcTime: Infinity } } });
});
afterEach(async () => { await act(async () => renderer?.unmount()); renderer = undefined; client.clear(); });
async function mount(Screen) { await act(async () => { renderer = create(React.createElement(QueryClientProvider, { client }, React.createElement(Screen))); }); }
async function settle(index, body, status = 200) { assert.ok(calls[index], `Expected request ${index}`); await act(async () => { calls[index].resolve(body, status); await new Promise(resolve => setTimeout(resolve, 10)); }); }
const hasText = text => renderer.root.findAllByType('AppText').some(node => node.props.children === text);

test('zone loading failures show an error and retry instead of claiming there are no zones', async () => {
  await mount(AdminHome);
  await settle(0, { activeUsers: 1, suspendedUsers: 0, activeZones: 1, visibleReports: 0, openAppeals: 0, totalReservations: 0, checkedInReservations: 0 });
  await settle(1, { error: { code: 'UNKNOWN', message: 'Zone list unavailable' } }, 500);
  await act(async () => renderer.root.findByType('Segmented').props.onChange('operations'));
  assert.equal(hasText('admin.noZones'), false, 'A failed request is not an empty list');
  const error = renderer.root.findAllByType('ErrorState').find(node => node.props.error);
  assert.ok(error, 'The zones request error must be visible');
  assert.equal(error.props.error.message, 'Zone list unavailable');
  await act(async () => error.props.onRetry());
  const retry = calls.findIndex((call, index) => index > 1 && call.url.pathname.endsWith('/admin/parking-zones'));
  assert.notEqual(retry, -1);
  await settle(retry, [{ id: 'zone-a', code: 'P1', name: 'Recovered zone', nameAr: 'موقف', city: 'Ramallah', cityAr: 'رام الله', active: true }]);
  assert.equal(hasText('Recovered zone'), true);
  assert.equal(renderer.root.findAllByType('ErrorState').length, 0);
});

test('admin user search can request an older account outside the latest 200 users', async () => {
  await mount(AdminUsers);
  await settle(0, Array.from({ length: 200 }, (_, index) => ({ id: `recent-${index}`, fullName: `Recent ${index}`, email: `recent-${index}@example.com`, phone: null, role: 'USER', status: 'ACTIVE', createdAt: '2026-10-16T12:00:00Z' })));
  const search = renderer.root.findByType('TextField');
  await act(async () => search.props.onChangeText('older.owner@example.com'));
  const submit = renderer.root.findAllByType('AppButton').find(node => node.props.label === 'Search');
  assert.ok(submit, 'Server search must be available when the capped list has no match');
  await act(async () => submit.props.onPress());
  assert.equal(calls[1].url.searchParams.get('query'), 'older.owner@example.com');
  await settle(1, [{ id: 'older-owner', fullName: 'Older owner', email: 'older.owner@example.com', phone: null, role: 'USER', status: 'ACTIVE', createdAt: '2020-01-01T12:00:00Z' }]);
  assert.equal(hasText('Older owner'), true);
  assert.ok(renderer.root.findAllByType('AppButton').some(node => node.props.label === 'Manage user'));
});
