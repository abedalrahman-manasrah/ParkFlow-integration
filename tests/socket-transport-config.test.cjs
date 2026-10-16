const { test } = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { create, act } = require('react-test-renderer');
const { QueryClient, QueryClientProvider } = require('@tanstack/react-query');
const { createClientLoader } = require('./helpers/client-loader.cjs');

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const baseUrl = 'https://parkflow-project.vercel.app/api/v1';
const browser = { transport: 'cookie', userId: 'driver', sessionId: 'session-a', loginId: 'login-a', csrfToken: 'csrf-a', expiresAt: new Date(Date.now() + 600000).toISOString() };
const native = { userId: 'driver', accessToken: 'native-access', refreshToken: 'native-refresh', expiresAt: browser.expiresAt };

async function scenario({ application = 'customer', platform = 'web', flag, runtimeOverride, ambientFlag }, run) {
  const previous = process.env.EXPO_PUBLIC_WEB_SOCKET_POLLING;
  const values = new Map(), sockets = [];
  const storage = { getItem: async key => values.get(key) ?? null, setItem: async (key, value) => { values.set(key, value); }, removeItem: async key => { values.delete(key); } };
  if (flag === undefined) delete process.env.EXPO_PUBLIC_WEB_SOCKET_POLLING;
  else process.env.EXPO_PUBLIC_WEB_SOCKET_POLLING = flag;
  const configured = require(`../apps/${application}/app.config.js`)();
  // The native/web runtime receives only the Expo manifest; build-time variables
  // need not exist in its process. An unrelated ambient value cannot override it.
  if (ambientFlag === undefined) delete process.env.EXPO_PUBLIC_WEB_SOCKET_POLLING;
  else process.env.EXPO_PUBLIC_WEB_SOCKET_POLLING = ambientFlag;
  const extra = { ...configured.extra, apiBaseUrl: baseUrl, ...runtimeOverride };
  const preferences = Object.assign(selector => selector({ locale: 'en' }), { getState: () => ({ locale: 'en' }) });
  const load = createClientLoader({ application, stubs: {
    'expo-constants': { expoConfig: { extra } },
    'react-native': { Platform: { OS: platform }, AppState: { addEventListener: () => ({ remove() {} }) } },
    '@react-native-async-storage/async-storage': storage,
    'expo-secure-store': { getItemAsync: storage.getItem, setItemAsync: storage.setItem, deleteItemAsync: storage.removeItem },
    '@parkflow/client/store/preferencesStore': { usePreferencesStore: preferences },
    '@parkflow/client/services/http/apiClient': { API_BASE_URL: baseUrl, api: async () => ({}), refreshSession: async () => browser },
    '@parkflow/client/offline/retryQueue': { retryQueue: { flush: async () => {} } },
    'socket.io-client': { io: (url, options) => {
      const socket = { url, options, connected: true, on() {}, disconnect() {}, connect() {} };
      sockets.push(socket); return socket;
    } },
  } });
  try { await run({ load, sockets, options: load('@parkflow/client/services/http/browserSession').socketSessionOptions }); }
  finally {
    if (previous === undefined) delete process.env.EXPO_PUBLIC_WEB_SOCKET_POLLING;
    else process.env.EXPO_PUBLIC_WEB_SOCKET_POLLING = previous;
  }
}

for (const application of ['customer', 'management']) {
  test(`${application} Expo configuration opts cookie sessions into polling without ambient runtime variables`, async () => {
    await scenario({ application, flag: 'true' }, ({ options }) => {
      assert.equal(process.env.EXPO_PUBLIC_WEB_SOCKET_POLLING, undefined);
      const result = options(browser);
      assert.deepEqual(result.transports, ['polling']);
      assert.equal(result.withCredentials, true);
      assert.deepEqual(result.auth, { application, sessionId: 'session-a', loginId: 'login-a', csrfToken: 'csrf-a' });
      assert.equal('token' in result.auth, false);
    });
  });

  test(`${application} default browser transport stays WebSocket unless the build explicitly opts in`, async () => {
    for (const flag of [undefined, 'false', 'TRUE']) {
      await scenario({ application, flag, ambientFlag: 'true' }, ({ options }) => {
        assert.deepEqual(options(browser).transports, ['websocket']);
      });
    }
  });

  for (const flag of ['true', 'false']) {
    test(`${application} sync hook uses the session transport with polling opt-in ${flag}`, async () => {
      await scenario({ application, flag }, async ({ load, sockets }) => {
        const auth = load('@parkflow/client/store/authStore').useAuthStore;
        auth.setState({ user: { id: 'driver', fullName: 'Driver', role: application === 'management' ? 'ADMIN' : 'USER' }, session: browser, hydrated: true });
        const hook = application === 'management'
          ? load('apps/management/src/hooks/useManagementSync.ts').useManagementSync
          : load('@parkflow/client/hooks/useBackendSync').useBackendSync;
        const client = new QueryClient(); let renderer;
        function Probe() { hook(); return null; }
        try {
          await act(async () => { renderer = create(React.createElement(QueryClientProvider, { client }, React.createElement(Probe))); });
          assert.equal(sockets.length, 1);
          assert.equal(sockets[0].url, 'https://parkflow-project.vercel.app');
          assert.deepEqual(sockets[0].options.transports, flag === 'true' ? ['polling'] : ['websocket']);
          assert.equal(sockets[0].options.withCredentials, true);
          assert.deepEqual(sockets[0].options.auth, { application, sessionId: 'session-a', loginId: 'login-a', csrfToken: 'csrf-a' });
        } finally { await act(async () => renderer?.unmount()); client.clear(); }
      });
    });
  }
}

for (const platform of ['ios', 'android']) {
  test(`${platform} keeps WebSocket transport even when the web build flag is enabled`, async () => {
    await scenario({ platform, flag: 'true' }, ({ options }) => {
      assert.deepEqual(options(native), { auth: { token: 'native-access' }, transports: ['websocket'] });
      assert.deepEqual(options(browser).transports, ['websocket']);
    });
  });
}

test('malformed runtime polling configuration does not opt a browser into polling', async () => {
  await scenario({ flag: 'true', runtimeOverride: { webSocketPolling: 'true' } }, ({ options }) => {
    assert.deepEqual(options(browser).transports, ['websocket']);
  });
});
test('the web polling flag does not change native-token session transport in a browser runtime', async () => {
  await scenario({ flag: 'true' }, ({ options }) => {
    assert.deepEqual(options(native), { auth: { token: 'native-access' }, transports: ['websocket'] });
  });
});
