const { test, beforeEach, afterEach, after } = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { create, act } = require('react-test-renderer');
const { QueryClient, QueryClientProvider } = require('@tanstack/react-query');
const { createClientLoader } = require('./helpers/client-loader.cjs');

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const originalFetch = global.fetch;
const originalBase = process.env.EXPO_PUBLIC_API_BASE_URL;
process.env.EXPO_PUBLIC_API_BASE_URL = 'https://parkflow-test.invalid/api/v1';
after(() => {
  global.fetch = originalFetch;
  if (originalBase === undefined) delete process.env.EXPO_PUBLIC_API_BASE_URL;
  else process.env.EXPO_PUBLIC_API_BASE_URL = originalBase;
});
const native = name => props => React.createElement(name, props, props.children);
const storage = { getItem: async () => null, setItem: async () => {}, removeItem: async () => {} };
const ui = Object.fromEntries(['AppButton', 'AppHeader', 'AppText', 'Card', 'ErrorState', 'InlineNotice', 'Screen', 'Segmented', 'SwitchRow', 'TextField'].map(name => [name, native(name)]));
const load = createClientLoader({ application: 'management', stubs: {
  'react-native': { View: native('View'), Platform: { OS: 'android' }, useWindowDimensions: () => ({ width: 1000 }) },
  '@parkflow/client/components/ui': ui,
  '@parkflow/client/hooks/useLocale': { useLocale: () => ({ locale: 'en', row: 'row' }) },
  '@parkflow/client/theme/ThemeProvider': { useTheme: () => ({ colors: { border: '#cccccc' }, isDark: false }), ThemeProvider: props => props.children },
  '@parkflow/client/components/brand/ConfiguredWelcome': { ConfiguredWelcome: native('ConfiguredWelcome') },
  '@parkflow/client/services/storage': { secureStorage: storage, appStorage: storage, STORAGE_KEYS: { authSession: 'admin-test-auth' } },
} });
const { defaultAppConfig } = load('@parkflow/contracts/appConfig');
const { useAuthStore } = load('@parkflow/client/store/authStore');
const AppearanceEditor = load('apps/management/app/admin/appearance.tsx').default;
const user = id => ({ id, fullName: id, role: 'ADMIN', email: `${id}@example.com` });
const session = id => ({ userId: id, accessToken: `access-${id}`, refreshToken: `refresh-${id}`, expiresAt: '2099-01-01T00:00:00Z' });
const revision = (version, config, published = false) => ({ id: `revision-${version}`, version, config, createdBy: 'admin-a', createdAt: '2026-10-16T12:00:00Z', publishedAt: published ? '2026-10-16T12:00:00Z' : null, publication: null });
const initial = () => ({ version: 0, draft: null, published: null, draftRevisionId: null, publishedRevisionId: null });
const withDraft = (version, brandColor = '#223388') => ({ ...initial(), version, draftRevisionId: `revision-${version}`, draft: revision(version, { ...defaultAppConfig, brandColor }) });
const withPublication = version => ({ ...initial(), version, publishedRevisionId: `revision-${version}`, published: revision(version, { ...defaultAppConfig, brandColor: '#223388' }, true) });
let renderer, client, calls;
beforeEach(() => {
  calls = [];
  global.fetch = (url, options) => new Promise(resolve => calls.push({
    url: new URL(url).pathname.replace('/api/v1', ''),
    method: options.method,
    body: options.body && JSON.parse(options.body),
    resolve: body => resolve({ ok: true, status: 200, json: async () => body }),
  }));
  useAuthStore.setState({ user: user('admin-a'), session: session('admin-a'), hydrated: true });
  client = new QueryClient({ defaultOptions: { queries: { staleTime: 30000, retry: false, gcTime: Infinity }, mutations: { retry: false, gcTime: Infinity } } });
});
afterEach(async () => { await act(async () => renderer?.unmount()); renderer = undefined; client.clear(); });
const settle = async (index, body) => {
  assert.ok(calls[index], `Expected request ${index}`);
  await act(async () => { calls[index].resolve(body); await new Promise(resolve => setTimeout(resolve, 10)); });
};
async function mount() {
  await act(async () => { renderer = create(React.createElement(QueryClientProvider, { client }, React.createElement(AppearanceEditor))); });
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });
}
const button = label => renderer.root.findAllByType('AppButton').find(node => node.props.label === label);
const field = label => renderer.root.findAllByType('TextField').find(node => node.props.label === label);
const title = () => renderer.root.findAllByType('AppText').find(node => typeof node.props.children === 'string' && node.props.children.startsWith('Editor version'))?.props.children;
async function press(label) { assert.ok(button(label), `Expected button ${label}`); await act(async () => button(label).props.onPress()); }
async function enter(label, value) { assert.ok(field(label), `Expected field ${label}`); await act(async () => field(label).props.onChangeText(value)); }
async function reopen() { await act(async () => renderer.unmount()); await mount(); }

test('reopening appearance retains the saved draft and uses its version for the next save', async () => {
  await mount(); await settle(0, initial());
  await enter('Brand color', '#223388'); await press('Save draft');
  assert.equal(calls[1].body.expectedVersion, 0);
  await settle(1, withDraft(1));
  await reopen();
  assert.equal(title(), 'Editor version 1 · Saved draft');
  assert.equal(field('Brand color').props.value, '#223388');
  await enter('Brand color', '#223399'); await press('Save draft');
  assert.equal(calls[2].body.expectedVersion, 1);
});

test('reopening appearance after publication shows the published version with no draft', async () => {
  await mount(); await settle(0, withDraft(1));
  await press('Preview changes'); await press('Review publication');
  await enter('Reason for this change', 'Reviewed publication'); await press('Publish now');
  assert.equal(calls[1].url, '/admin/app-config/publish');
  await settle(1, withPublication(2));
  const publicRequest = calls.findIndex(call => call.url === '/app-config');
  if (publicRequest !== -1) await settle(publicRequest, { version: 2, revisionId: 'revision-2', config: withPublication(2).published.config });
  await reopen();
  assert.equal(title(), 'Editor version 2 · Published appearance');
  assert.equal(button('Review publication').props.disabled, true);
});

test('reopening appearance retains the latest explicitly reloaded version', async () => {
  await mount(); await settle(0, initial());
  await press('Reload latest'); await settle(1, withDraft(3));
  await reopen();
  assert.equal(title(), 'Editor version 3 · Saved draft');
});

test('a late save from another login cannot populate the new admin editor or its cache', async () => {
  await mount(); await settle(0, initial());
  await enter('Brand color', '#223388'); await press('Save draft');
  await act(async () => {
    client.clear();
    useAuthStore.setState({ user: user('admin-b'), session: session('admin-b') });
  });
  const nextRead = calls.findIndex((call, index) => index > 1 && call.url === '/admin/app-config');
  assert.notEqual(nextRead, -1, 'A different admin must load a new editor');
  await settle(nextRead, withDraft(7, '#334455'));
  await settle(1, withDraft(1));
  assert.equal(title(), 'Editor version 7 · Saved draft');
  assert.equal(field('Brand color').props.value, '#334455');
  assert.equal(client.getQueriesData({ queryKey: ['admin', 'app-config'] }).some(([, value]) => value?.version === 1), false);
  assert.equal(renderer.root.findAllByType('InlineNotice').some(node => node.props.tone === 'success'), false);
});
test('an older pending appearance read cannot overwrite an accepted draft before reopening', async () => {
  client.setQueryData(['admin', 'app-config', 'admin-a'], initial(), { updatedAt: Date.now() - 31000 });
  await mount();
  assert.equal(calls[0].url, '/admin/app-config');
  assert.equal(title(), 'Editor version 0 · Published appearance');
  await enter('Brand color', '#223388'); await press('Save draft');
  assert.equal(calls[1].url, '/admin/app-config/draft');
  await settle(1, withDraft(1));
  assert.equal(title(), 'Editor version 1 · Saved draft');
  await settle(0, initial());
  await reopen();
  assert.equal(title(), 'Editor version 1 · Saved draft');
  assert.equal(field('Brand color').props.value, '#223388');
});
test('a save from an unmounted editor cannot replace a newer reloaded editor on the same login', async () => {
  await mount(); await settle(0, initial());
  await enter('Brand color', '#223388'); await press('Save draft');
  await reopen();
  await press('Reload latest'); await settle(2, withDraft(7, '#334455'));
  await settle(1, withDraft(1));
  await reopen();
  assert.equal(title(), 'Editor version 7 · Saved draft');
  assert.equal(field('Brand color').props.value, '#334455');
});
