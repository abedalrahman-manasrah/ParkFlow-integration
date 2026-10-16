const { test } = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { create, act } = require('react-test-renderer');
const { QueryClient, QueryClientProvider } = require('@tanstack/react-query');
const { createClientLoader } = require('./helpers/client-loader.cjs');

const userA = { id: 'driver-a', fullName: 'Driver A', role: 'USER', locale: 'en' };
const userB = { id: 'driver-b', fullName: 'Driver B', role: 'USER', locale: 'en' };
const session = (user, suffix = '') => ({ userId: user.id, accessToken: `access-${user.id}${suffix}`, refreshToken: `refresh-${user.id}${suffix}`, expiresAt: '2099-01-01T00:00:00Z' });
const privateRoute = {
  pendingZoneId: 'zone-a',
  origin: { latitude: 31.9, longitude: 35.2 },
  originMode: 'gps',
  returnToCar: { savedLocation: { latitude: 31.8, longitude: 35.1 }, note: 'Personal parking note', reminderNotificationId: 'reminder-a', reminderDueAt: 9999999999999 },
};
const routeKey = 'pf.reservation.route';
const nextTurn = () => new Promise(resolve => setImmediate(resolve));
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function fixture({ delayRead = false, extraStubs = {} } = {}) {
  const values = new Map();
  const scheduled = new Set(['reminder-a']);
  let firstRead = delayRead, firstWrite = false;
  let pauseAuthUserId, releaseAuthWrite, markAuthWrite;
  let rejectRouteRemovals = false;
  let releaseRead, releaseWrite, markRead, markWrite;
  const readEntered = new Promise(resolve => { markRead = resolve; });
  const writeEntered = new Promise(resolve => { markWrite = resolve; });
  const authWriteEntered = new Promise(resolve => { markAuthWrite = resolve; });
  const storage = {
    getItem: async key => {
      const snapshot = values.get(key) ?? null;
      if (key === routeKey && firstRead) {
        firstRead = false; markRead();
        await new Promise(resolve => { releaseRead = resolve; });
      }
      return snapshot;
    },
    setItem: async (key, value) => {
      if (key === 'sp.auth.session' && pauseAuthUserId && JSON.parse(value).user.id === pauseAuthUserId) {
        pauseAuthUserId = undefined; markAuthWrite();
        await new Promise(resolve => { releaseAuthWrite = resolve; });
      }
      if (key === routeKey && firstWrite) {
        firstWrite = false; markWrite();
        await new Promise(resolve => { releaseWrite = resolve; });
      }
      values.set(key, value);
    },
    removeItem: async key => {
      if (key === routeKey && rejectRouteRemovals) throw new Error('Local storage temporarily unavailable');
      values.delete(key);
    },
  };
  const load = createClientLoader({ stubs: {
    'react-native': { Platform: { OS: 'android' } },
    '@react-native-async-storage/async-storage': storage,
    'expo-secure-store': { getItemAsync: storage.getItem, setItemAsync: storage.setItem, deleteItemAsync: storage.removeItem },
    'expo-notifications': { cancelScheduledNotificationAsync: async id => { scheduled.delete(id); } },
    '@parkflow/client/services/http/apiClient': { api: async () => userA },
    ...extraStubs,
  } });
  return {
    values, scheduled, load, readEntered, writeEntered,
    releaseRead: () => releaseRead(), releaseWrite: () => releaseWrite(),
    blockNextWrite: () => { firstWrite = true; },
    pauseNextAuthWrite: userId => { pauseAuthUserId = userId; },
    authWriteEntered, releaseAuthWrite: () => releaseAuthWrite(),
    rejectRouteRemovals: value => { rejectRouteRemovals = value; },
    auth: load('@parkflow/client/store/authStore').useAuthStore,
    route: () => load('@parkflow/client/store/reservationRouteStore').useReservationRouteStore,
  };
}

async function savePersonalRoute(f) {
  const route = f.route();
  await route.persist.rehydrate();
  route.getState().request('zone-a');
  route.getState().setOrigin(privateRoute.origin, 'gps');
  route.getState().saveReturnToCar(privateRoute.returnToCar);
  await nextTurn();
  return route;
}

function assertNoPersonalRoute(route) {
  assert.equal(route.getState().pendingZoneId, undefined);
  assert.equal(route.getState().origin, undefined);
  assert.equal(route.getState().originMode, undefined);
  assert.equal(route.getState().returnToCar, undefined);
}

test('logout removes saved GPS and car details from memory and disk and cancels their reminder', async () => {
  const f = fixture();
  await f.auth.getState().signIn(session(userA), userA);
  const route = await savePersonalRoute(f);
  await f.auth.getState().signOut();
  assertNoPersonalRoute(route);
  assert.equal(f.values.has(routeKey), false);
  assert.equal(f.scheduled.has('reminder-a'), false);
  await route.persist.rehydrate();
  assertNoPersonalRoute(route);
});

test('switching directly to another account purges the previous account location', async () => {
  const f = fixture();
  await f.auth.getState().signIn(session(userA), userA);
  const route = await savePersonalRoute(f);
  await f.auth.getState().signIn(session(userB), userB);
  assert.equal(f.auth.getState().user.id, 'driver-b');
  assertNoPersonalRoute(route);
  assert.equal(f.values.has(routeKey), false);
  assert.equal(f.scheduled.has('reminder-a'), false);
});

test('refreshing the same account preserves saved car details and its scheduled reminder', async () => {
  const f = fixture();
  await f.auth.getState().signIn(session(userA), userA);
  const route = await savePersonalRoute(f);
  await f.auth.getState().signIn(session(userA, '-renewed'), userA);
  assert.deepEqual(route.getState().returnToCar, privateRoute.returnToCar);
  assert.deepEqual(route.getState().origin, privateRoute.origin);
  assert.equal(f.scheduled.has('reminder-a'), true);
  assert.equal(JSON.parse(f.values.get(routeKey)).state.returnToCar.note, 'Personal parking note');
});

test('a delayed location hydration cannot restore a previous account after logout', async () => {
  const f = fixture({ delayRead: true });
  f.values.set('sp.auth.session', JSON.stringify({ session: session(userA), user: userA }));
  f.values.set(routeKey, JSON.stringify({ state: privateRoute, version: 0 }));
  const route = f.route();
  await f.readEntered;
  await f.auth.getState().hydrate();
  await f.auth.getState().signOut();
  f.releaseRead();
  await nextTurn();
  assertNoPersonalRoute(route);
  assert.equal(f.values.has(routeKey), false);
  assert.equal(f.scheduled.has('reminder-a'), false);
});

test('logout waits for an older location write and deletes it before another account can read it', async () => {
  const f = fixture();
  await f.auth.getState().signIn(session(userA), userA);
  const route = f.route();
  await route.persist.rehydrate();
  f.blockNextWrite();
  route.getState().saveReturnToCar(privateRoute.returnToCar);
  await f.writeEntered;
  const logout = f.auth.getState().signOut();
  await nextTurn();
  f.releaseWrite();
  await logout;
  await nextTurn();
  assertNoPersonalRoute(route);
  assert.equal(f.values.has(routeKey), false);
  assert.equal(f.scheduled.has('reminder-a'), false);
  await f.auth.getState().signIn(session(userB), userB);
  await route.persist.rehydrate();
  assertNoPersonalRoute(route);
});

test('an old screen cannot save its location or a newly scheduled reminder after an account switch', async () => {
  const f = fixture();
  await f.auth.getState().signIn(session(userA), userA);
  const route = await savePersonalRoute(f);
  const oldScreen = route.getState();
  await f.auth.getState().signIn(session(userB), userB);
  f.scheduled.add('late-reminder-a');
  oldScreen.setOrigin(privateRoute.origin, 'gps');
  oldScreen.request('zone-a');
  oldScreen.saveReturnToCar({ ...privateRoute.returnToCar, reminderNotificationId: 'late-reminder-a' });
  await nextTurn();
  assertNoPersonalRoute(route);
  assert.equal(f.values.has(routeKey), false);
  assert.equal(f.scheduled.has('late-reminder-a'), false);
  route.getState().setOrigin({ latitude: 32, longitude: 35.3 }, 'gps');
  await nextTurn();
  assert.deepEqual(route.getState().origin, { latitude: 32, longitude: 35.3 });
});

test('latest route actions cannot save the old account location while the next account session is persisting', async () => {
  const f = fixture();
  await f.auth.getState().signIn(session(userA), userA);
  const route = await savePersonalRoute(f);
  f.pauseNextAuthWrite('driver-b');
  const switching = f.auth.getState().signIn(session(userB), userB);
  await f.authWriteEntered;
  assert.equal(f.auth.getState().user.id, 'driver-a');
  const transitionActions = route.getState();
  f.scheduled.add('transition-reminder-a');
  transitionActions.setOrigin(privateRoute.origin, 'gps');
  transitionActions.saveReturnToCar({ ...privateRoute.returnToCar, reminderNotificationId: 'transition-reminder-a' });
  f.releaseAuthWrite();
  await switching;
  await nextTurn();
  assert.equal(f.auth.getState().user.id, 'driver-b');
  assertNoPersonalRoute(route);
  assert.equal(f.values.has(routeKey), false);
  assert.equal(f.scheduled.has('transition-reminder-a'), false);
  transitionActions.setOrigin(privateRoute.origin, 'gps');
  await nextTurn();
  assertNoPersonalRoute(route);
  route.getState().setOrigin({ latitude: 32, longitude: 35.3 }, 'gps');
  await nextTurn();
  assert.deepEqual(route.getState().origin, { latitude: 32, longitude: 35.3 });
});

test('abandoning an account switch releases the location transition for the current account', async () => {
  const f = fixture();
  await f.auth.getState().signIn(session(userA), userA);
  const route = await savePersonalRoute(f);
  let active = true;
  f.pauseNextAuthWrite('driver-b');
  const switching = f.auth.getState().signIn(session(userB), userB, () => active);
  const rejected = assert.rejects(switching, { name: 'AbortError' });
  await f.authWriteEntered;
  active = false;
  f.releaseAuthWrite();
  await rejected;
  assert.equal(f.auth.getState().user.id, 'driver-a');
  assertNoPersonalRoute(route);
  route.getState().saveReturnToCar({ note: 'Current account after cancellation' });
  await nextTurn();
  assert.equal(route.getState().returnToCar.note, 'Current account after cancellation');
  assert.equal(JSON.parse(f.values.get('sp.auth.session')).user.id, 'driver-a');
});

test('a storage cleanup failure blocks the next account and releases location actions for recovery', async () => {
  const f = fixture();
  await f.auth.getState().signIn(session(userA), userA);
  const route = await savePersonalRoute(f);
  f.rejectRouteRemovals(true);
  await assert.rejects(f.auth.getState().signIn(session(userB), userB), /Local storage temporarily unavailable/);
  assert.equal(f.auth.getState().user.id, 'driver-a');
  assert.equal(JSON.parse(f.values.get('sp.auth.session')).user.id, 'driver-a');
  assert.equal(f.scheduled.has('reminder-a'), false);
  f.rejectRouteRemovals(false);
  route.getState().setOrigin({ latitude: 32, longitude: 35.3 }, 'gps');
  await nextTurn();
  assert.deepEqual(route.getState().origin, { latitude: 32, longitude: 35.3 });
  await f.auth.getState().signIn(session(userB), userB);
  assert.equal(f.auth.getState().user.id, 'driver-b');
  assertNoPersonalRoute(route);
});

function native(name) {
  return props => React.createElement(name, props, props.children);
}

function mapFixture() {
  let finishGps, markGps;
  let blurMap;
  const gpsEntered = new Promise(resolve => { markGps = resolve; });
  const zone = { id: 'zone-a', facilityId: 'facility-a', name: 'Parking A', nameAr: 'Parking A', location: { latitude: 31.8, longitude: 35.1 } };
  const empty = [];
  const ev = { stations: empty, select() {}, filters: {}, loading: false, retry() {} };
  const report = { reset() {}, mutate() {} };
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } } });
  const componentNames = ['MapSurface', 'MapTopBar', 'MapControlRail', 'NearbyParkingPanel', 'CompactRoutePanel', 'TestLocationControl', 'RoadReportLocationPanel', 'RoadReportCreationSheet', 'RoadReportDetailsSheet', 'MapLayersSheet', 'EvStationDetailsSheet', 'EvFiltersSheet', 'EvMapStatus', 'CarServiceDetailsSheet', 'CarServiceMapStatus', 'TourismPlaceDetailsSheet', 'TourismPlaceMapStatus', 'DestinationSearchBox', 'DestinationParkingPanel'];
  const componentStubs = Object.fromEntries(componentNames.map(name => [`../../src/components/map/${name}`, { [name]: native(name) }]));
  for (const name of ['VehicleSelectorSheet', 'ZoneSheet', 'ActiveSessionBanner', 'ZoneCodeSheet']) componentStubs[`../../src/components/domain/${name}`] = { [name]: native(name) };
  const f = fixture({ extraStubs: {
    ...componentStubs,
    // Keep the real map, GPS/auth hooks, route store and offline cache. Only
    // presentation components are native boundaries in this Node renderer.
    '@parkflow/client/components/ui': { Reveal: native('Reveal') },
    'react-native': { View: native('View'), Platform: { OS: 'android', select: values => values.android ?? values.default }, Linking: { openURL: async () => {} } },
    'expo-router': { useRouter: () => ({ push() {} }), useFocusEffect: callback => React.useEffect(() => { blurMap = callback(); return blurMap; }, [callback]) },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) },
    'expo-status-bar': { StatusBar: native('StatusBar') },
    'expo-location': {
      requestForegroundPermissionsAsync: async () => ({ status: 'granted' }), Accuracy: { Balanced: 'balanced' },
      getCurrentPositionAsync: () => { markGps(); return new Promise(resolve => { finishGps = resolve; }); },
    },
    '@parkflow/client/components/ui/OfflineStaleNotice': { OfflineStaleNotice: native('OfflineStaleNotice') },
    '@parkflow/client/theme/ThemeProvider': { useTheme: () => ({ colors: { background: '#fff' } }) },
    '@parkflow/client/hooks/useLocale': { useLocale: () => ({ locale: 'en', t: key => key }) },
    '@parkflow/client/hooks/useEvStations': { useEvStations: () => ev },
    '@parkflow/client/hooks/useVehicles': { useSelectedVehicle: () => ({ vehicles: empty, select() {} }) },
    '@parkflow/client/hooks/useParking': { useZones: () => ({ data: [zone], isPending: false }), useActiveSessions: () => ({ data: empty }), useCacheParkingZone: () => async () => {} },
    '@parkflow/client/hooks/useNotifications': { useUnreadNotificationCount: () => ({ data: 0 }) },
    '@parkflow/client/hooks/useRoadReports': { useCreateRoadReport: () => report, useRoadReports: () => ({ data: empty }) },
    '@parkflow/client/services': {
      DEFAULT_REGION: { latitude: 31.9, longitude: 35.2, latitudeDelta: 0.02, longitudeDelta: 0.02 },
      services: {
        roads: { listCheckpoints: async () => empty },
        routing: { getRoute: async (from, to) => ({ source: 'fallback', coordinates: [from, to], alternatives: empty, distanceMeters: 100, durationSeconds: 60 }) },
      },
    },
    '@parkflow/client/utils/haptics': { haptics: { light() {}, select() {} } },
  } });
  return { ...f, zone, queryClient, tree: Component => React.createElement(QueryClientProvider, { client: queryClient }, React.createElement(Component)), gpsEntered, blurMap: () => blurMap?.(), finishGps: () => finishGps({ coords: { latitude: 31.9, longitude: 35.2 } }) };
}

for (const operation of ['locate', 'navigate']) {
  test(`the real map ${operation} callback cannot persist another account GPS when its async request finishes late`, async () => {
    const f = mapFixture();
    await f.auth.getState().signIn(session(userA), userA);
    const route = f.route();
    await route.persist.rehydrate();
    const previousDev = globalThis.__DEV__;
    globalThis.__DEV__ = false;
    const MapScreen = f.load('apps/customer/app/(tabs)/map.tsx').default;
    let renderer;
    try {
      await act(async () => { renderer = create(f.tree(MapScreen)); });
      await act(async () => {
        if (operation === 'locate') renderer.root.findByType('MapControlRail').props.onLocate();
        else renderer.root.findByType('ZoneSheet').props.onNavigate(f.zone);
      });
      await f.gpsEntered;
      await act(async () => { f.blurMap(); await f.auth.getState().signIn(session(userB), userB); });
      await act(async () => { if (operation === 'navigate') { f.blurMap(); route.getState().request('zone-b'); } });
      await act(async () => { f.finishGps(); await new Promise(resolve => setTimeout(resolve, 30)); });
      assert.equal(f.auth.getState().user.id, 'driver-b');
      assert.equal(route.getState().origin, undefined);
      assert.equal(route.getState().returnToCar, undefined);
      assert.equal(route.getState().pendingZoneId, operation === 'navigate' ? 'zone-b' : undefined);
      const persisted = f.values.get(routeKey);
      if (persisted) assert.equal(JSON.parse(persisted).state.origin, undefined);
      assert.deepEqual([...f.values.keys()].filter(key => key.startsWith('pf.offline.driver-b.route.')), []);
      assert.equal(renderer.root.findByType('MapSurface').props.userLocation, undefined);
    } finally {
      await act(async () => renderer?.unmount());
      f.queryClient.clear();
      if (previousDev === undefined) delete globalThis.__DEV__;
      else globalThis.__DEV__ = previousDev;
    }
  });
}

test('the real return-to-car remove callback cannot clear the next account details after native cancellation finishes late', async () => {
  let releaseCancellation, markCancellation;
  const cancellationEntered = new Promise(resolve => { markCancellation = resolve; });
  let firstCancellation = true;
  let f;
  f = fixture({ extraStubs: {
    'react-native': { View: native('View'), Platform: { OS: 'android' }, Linking: { openURL: async () => {} } },
    'expo-router': { useRouter: () => ({ back() {} }) },
    'expo-location': { Accuracy: { Balanced: 'balanced' } },
    'expo-notifications': { cancelScheduledNotificationAsync: async id => {
      if (firstCancellation) {
        firstCancellation = false; markCancellation();
        await new Promise(resolve => { releaseCancellation = resolve; });
      }
      f.scheduled.delete(id);
    } },
    '@parkflow/client/components/ui': Object.fromEntries(['AppButton', 'AppText', 'Screen', 'TextField'].map(name => [name, native(name)])),
    '@parkflow/client/hooks/useLocale': { useLocale: () => ({ locale: 'en', t: key => key }) },
    '@parkflow/client/hooks/useParking': { useFacilityNavigation: () => ({}) },
  } });
  await f.auth.getState().signIn(session(userA), userA);
  const route = await savePersonalRoute(f);
  const ReturnScreen = f.load('apps/customer/app/parking/return.tsx').default;
  let renderer;
  try {
    await act(async () => { renderer = create(React.createElement(ReturnScreen)); });
    await act(async () => {
      renderer.root.findAllByType('AppButton').find(button => button.props.label === 'returnToCar.remove').props.onPress();
    });
    await cancellationEntered;
    await act(async () => { await f.auth.getState().signIn(session(userB), userB); });
    await act(async () => { route.getState().saveReturnToCar({ note: 'Driver B parking details' }); });
    await act(async () => { releaseCancellation(); await nextTurn(); });
    assert.equal(f.auth.getState().user.id, 'driver-b');
    assert.equal(route.getState().returnToCar?.note, 'Driver B parking details');
    assert.equal(JSON.parse(f.values.get(routeKey)).state.returnToCar.note, 'Driver B parking details');
  } finally {
    await act(async () => renderer?.unmount());
  }
});

test('the real map locate callback still saves GPS for the account that requested it', async () => {
  const f = mapFixture();
  await f.auth.getState().signIn(session(userA), userA);
  const route = f.route();
  await route.persist.rehydrate();
  const previousDev = globalThis.__DEV__;
  globalThis.__DEV__ = false;
  const MapScreen = f.load('apps/customer/app/(tabs)/map.tsx').default;
  let renderer;
  try {
    await act(async () => { renderer = create(f.tree(MapScreen)); });
    await act(async () => { renderer.root.findByType('MapControlRail').props.onLocate(); });
    await f.gpsEntered;
    await act(async () => { await f.auth.getState().signIn(session(userA, '-refreshed'), userA); });
    await act(async () => { f.finishGps(); await nextTurn(); });
    assert.deepEqual(route.getState().origin, { latitude: 31.9, longitude: 35.2 });
    assert.deepEqual(JSON.parse(f.values.get(routeKey)).state.origin, { latitude: 31.9, longitude: 35.2 });
  } finally {
    await act(async () => renderer?.unmount());
    f.queryClient.clear();
    if (previousDev === undefined) delete globalThis.__DEV__;
    else globalThis.__DEV__ = previousDev;
  }
});

test('a GPS hook request cannot finish across logout and login to the same account', async () => {
  const f = mapFixture();
  await f.auth.getState().signIn(session(userA), userA);
  const { useUserLocation } = f.load('@parkflow/client/hooks/useUserLocation');
  let latest, pending, renderer;
  function LocationProbe() {
    latest = useUserLocation(false);
    return React.createElement('LocationProbe', { location: latest.location, status: latest.status });
  }
  try {
    await act(async () => { renderer = create(React.createElement(LocationProbe)); });
    await act(async () => { pending = latest.request(); });
    await f.gpsEntered;
    await act(async () => {
      await f.auth.getState().signOut();
      await f.auth.getState().signIn(session(userA, '-new-login'), userA);
    });
    await act(async () => { f.finishGps(); await nextTurn(); });
    assert.equal(await pending, undefined);
    assert.equal(latest.location, undefined);
    assert.equal(latest.status, 'idle');
  } finally {
    await act(async () => renderer?.unmount());
    f.queryClient.clear();
  }
});

test('a real map route initiated by the current account still reaches its own offline cache', async () => {
  const f = mapFixture();
  await f.auth.getState().signIn(session(userA), userA);
  const previousDev = globalThis.__DEV__;
  globalThis.__DEV__ = false;
  const MapScreen = f.load('apps/customer/app/(tabs)/map.tsx').default;
  let renderer;
  try {
    await act(async () => { renderer = create(f.tree(MapScreen)); });
    await act(async () => { renderer.root.findByType('ZoneSheet').props.onNavigate(f.zone); });
    await f.gpsEntered;
    await act(async () => { f.finishGps(); await new Promise(resolve => setTimeout(resolve, 30)); });
    const ownRoutes = [...f.values.entries()].filter(([key]) => key.startsWith('pf.offline.driver-a.route.'));
    assert.equal(ownRoutes.length, 1);
    assert.deepEqual(JSON.parse(ownRoutes[0][1]).value.value.coordinates, [{ latitude: 31.9, longitude: 35.2 }, { latitude: 31.8, longitude: 35.1 }]);
    await act(async () => { await f.auth.getState().signIn(session(userB), userB); await nextTurn(); });
    assert.equal(renderer.root.findByType('MapSurface').props.userLocation, undefined);
    assert.deepEqual([...f.values.keys()].filter(key => key.startsWith('pf.offline.driver-b.route.')), []);
  } finally {
    await act(async () => renderer?.unmount());
    f.queryClient.clear();
    if (previousDev === undefined) delete globalThis.__DEV__;
    else globalThis.__DEV__ = previousDev;
  }
});
