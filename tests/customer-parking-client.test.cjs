const { test } = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { create, act } = require('react-test-renderer');
const { QueryClient, QueryClientProvider } = require('@tanstack/react-query');
const { createClientLoader } = require('./helpers/client-loader.cjs');

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const native = name => props => React.createElement(name, props, props.children);
const ui = Object.fromEntries(['AppButton', 'AppHeader', 'AppText', 'BottomSheet', 'Card', 'DetailRow', 'Divider', 'ErrorState', 'IconButton', 'InlineNotice', 'MoneyText', 'PressableScale', 'Screen', 'Segmented', 'Skeleton', 'StatusBadge'].map(name => [name, native(name)]));
const load = createClientLoader();
const { ramallahParkingZones } = load('packages/client/src/data/ramallahParking.ts');
const { rankParkingForDestination } = load('packages/client/src/utils/parkingRecommendation.ts');
const base = ramallahParkingZones.find(zone => zone.id === 'rml_al_bireh_municipal_complex');

test('destination recommendations prefer API availability, tariff and provenance over bundled duplicates', () => {
  const live = { ...base, availability: 'full', prototypeData: false, tariff: { ...base.tariff, hourlyRate: 1500 }, availabilityProvenance: { source: 'operator', freshness: 'fresh' } };
  const recommendation = rankParkingForDestination(base.location, [live, base], new Date('2026-10-19T07:00:00Z')).find(item => item.zone.id === base.id);
  assert.ok(recommendation);
  assert.equal(recommendation.zone.availability, 'full');
  assert.equal(recommendation.zone.tariff.hourlyRate, 1500);
  assert.equal(recommendation.zone.prototypeData, false);
  assert.deepEqual(recommendation.zone.availabilityProvenance, { source: 'operator', freshness: 'fresh' });
});

test('destination recommendations retain bundled locations absent from API results', () => {
  const recommendations = rankParkingForDestination(base.location, [...ramallahParkingZones], new Date('2026-10-19T07:00:00Z'));
  assert.ok(recommendations.some(item => item.zone.id === base.id));
});

test('HTTP zone normalization preserves published restrictions and live inventory metadata', async () => {
  const live = { ...base, parkingAllowed: false, accessRestriction: 'Temporarily staff only', prototypeData: false, availability: 'unknown' };
  const client = createClientLoader({ stubs: { './apiClient': { api: async () => live, segment: encodeURIComponent }, '@parkflow/client/store/preferencesStore': { usePreferencesStore: {} } } });
  const zone = await client('packages/client/src/services/http/parkingService.ts').httpParkingService.getZone(live.id);
  assert.equal(zone.parkingAllowed, false);
  assert.equal(zone.accessRestriction, 'Temporarily staff only');
  assert.equal(zone.prototypeData, false);
  assert.equal(zone.availability, 'unknown');
});

function screenHarness({ entryMethod, session, zone = base } = {}) {
  const params = { zoneId: zone.id, id: session?.id, ...(entryMethod ? { entryMethod } : {}) };
  const starts = [], routes = [];
  const selected = { id: 'vehicle-1', displayName: 'My car', plateNumber: '123-456' };
  const router = { push: route => routes.push(route), replace: route => routes.push(route) };
  const stubs = {
    'react-native': { View: native('View'), Platform: { OS: 'web', select: values => values.default } },
    'expo-router': { useLocalSearchParams: () => params, useRouter: () => router },
    'expo-linear-gradient': { LinearGradient: native('LinearGradient') },
    'expo-status-bar': { StatusBar: native('StatusBar') },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) },
    'expo-camera': { CameraView: native('CameraView'), useCameraPermissions: () => [{ granted: true }, () => {}] },
    'lucide-react-native': new Proxy({}, { get: (_, name) => native(String(name)) }),
    '@parkflow/client/components/ui': ui,
    '@parkflow/client/theme/ThemeProvider': { useTheme: () => ({ colors: new Proxy({}, { get: () => '#000000' }) }) },
    '@parkflow/client/hooks/useLocale': { useLocale: () => ({ t: key => key, row: 'row', dateLocale: 'en-US', locale: 'en' }) },
    '@parkflow/client/hooks/useSession': { useUserId: () => 'driver-1' },
    '@parkflow/client/hooks/useVehicles': { useSelectedVehicle: () => ({ vehicles: [selected], selected, select() {} }), useVehicle: () => ({ data: selected }) },
    '@parkflow/client/hooks/useWallet': { useWallet: () => ({ data: { balance: 100000 } }) },
    '@parkflow/client/hooks/useCommunity': { useTrust: () => ({ data: { discountPercent: 0 } }) },
    '@parkflow/client/hooks/useParking': {
      useZone: () => ({ data: zone }),
      useActiveSessions: () => ({ data: [] }),
      useStartParking: () => ({ mutate: input => starts.push(input) }),
      useSessionById: () => ({ data: session }),
      useSessionBreakdown: () => ({ elapsedSeconds: 0, remainingSeconds: 3600, cost: session?.currentCost }),
      useStopParking: () => ({}), useExtendParking: () => ({}),
    },
    '@parkflow/client/utils/haptics': { haptics: { light() {}, select() {}, success() {}, error() {} } },
    '@parkflow/client/utils/voice': { speak() {} },
    '@parkflow/client/store/preferencesStore': { usePreferencesStore: selector => selector({ voiceAlerts: false }) },
    '@parkflow/client/services': { services: { parking: { getZoneByCode: async () => zone } } },
    '../../src/components/domain/PlateBadge': { PlateBadge: native('PlateBadge') },
    '../../src/components/domain/VehicleSelectorSheet': { VehicleSelectorSheet: native('VehicleSelectorSheet') },
    '../../../src/components/domain/PlateBadge': { PlateBadge: native('PlateBadge') },
    '../../../src/components/domain/TimerRing': { TimerRing: native('TimerRing') },
    '../../src/components/map/ZoneMarker': { availabilityTone: () => 'neutral' },
  };
  const loader = createClientLoader({ stubs });
  let renderer;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false, gcTime: Infinity } } });
  return {
    starts, routes,
    async mount(path) {
      const Screen = loader(path).default;
      await act(async () => { renderer = create(React.createElement(QueryClientProvider, { client }, React.createElement(Screen))); });
    },
    async press(testID) { await act(async () => renderer.root.findByProps({ testID }).props.onPress()); },
    tree() { return renderer; },
    async close() { await act(async () => renderer?.unmount()); client.clear(); },
  };
}

for (const entryMethod of ['qr', 'zone_code', undefined]) {
  test('start parking sends the ' + (entryMethod ?? 'default GPS') + ' entry method used to identify the zone', async () => {
    const harness = screenHarness({ entryMethod });
    try {
      await harness.mount('apps/customer/app/parking/start.tsx');
      await harness.press('start-parking-cta');
      assert.equal(harness.starts.length, 1);
      assert.equal(harness.starts[0].entryMethod, entryMethod ?? 'gps');
    } finally { await harness.close(); }
  });
}

test('QR scan carries its entry method into parking confirmation', async () => {
  const harness = screenHarness();
  try {
    await harness.mount('apps/customer/app/scan.tsx');
    await act(async () => {
      harness.tree().root.findByType('CameraView').props.onBarcodeScanned({ data: base.code });
      await new Promise(resolve => setTimeout(resolve, 10));
    });
    assert.equal(harness.routes.length, 1);
    assert.deepEqual(harness.routes[0], { pathname: '/parking/start', params: { zoneId: base.id, entryMethod: 'qr' } });
  } finally { await harness.close(); }
});

for (const scenario of [
  { name: 'minimum already paid', rate: { hourlyRate: 300, minimumCharge: 300 }, paid: 300, expected: '1.50 ' },
  { name: 'frozen loyalty discount after zone tariff changes', rate: { hourlyRate: 570, minimumCharge: 95 }, paid: 570, expected: '2.85 ' },
  { name: 'daily cap already reached', rate: { hourlyRate: 600, minimumCharge: 100, dailyCap: 600 }, paid: 600, expected: '0.00 ' },
]) {
  test('extension sheet quotes the incremental frozen price: ' + scenario.name, async () => {
    const session = { id: 'session-1', vehicleId: 'vehicle-1', parkingZoneId: base.id, status: 'ACTIVE', parkingMode: 'prepaid',
      startedAt: '2030-01-01T10:00:00Z', endsAt: '2030-01-01T11:00:00Z', currentCost: scenario.paid,
      rateSnapshot: { ...base.tariff, ...scenario.rate }, pricingRulesSnapshot: { zoneName: base.name, zoneNameAr: base.nameAr, zoneCode: base.code } };
    const zone = { ...base, tariff: { ...base.tariff, hourlyRate: 2000, minimumCharge: 500 } };
    const harness = screenHarness({ session, zone });
    try {
      await harness.mount('apps/customer/app/parking/active/[id].tsx');
      const sheet = harness.tree().root.findAllByType('BottomSheet').find(node => node.props.title === 'parking.extendTitle');
      const price = sheet.findAllByType('AppText').find(node => node.props.variant === 'caption');
      assert.ok(price);
      assert.ok(String(price.props.children).startsWith(scenario.expected), 'Quoted ' + String(price.props.children));
    } finally { await harness.close(); }
  });
}
test('collected map pins show API prices and coordinates while retaining absent demo pins', () => {
  const { parkingLocationsForZones } = load('packages/client/src/data/ramallahParking.ts');
  assert.equal(typeof parkingLocationsForZones, 'function');
  const live = { ...base, name: 'Updated parking', tariff: { ...base.tariff, hourlyRate: 1500 },
    location: { latitude: 31.91, longitude: 35.21 }, availability: 'full', parkingAllowed: false };
  const locations = parkingLocationsForZones([live]);
  const marker = locations.find(location => location.id === base.id);
  assert.equal(marker.price.hourlyRateNis, 15);
  assert.equal(marker.name, 'Updated parking');
  assert.deepEqual(marker.location, { latitude: 31.91, longitude: 35.21 });
  assert.equal(marker.availability, 'full');
  assert.equal(marker.parkingAllowed, false);
  const unnamedOperator = parkingLocationsForZones([{ ...live, operatorName: undefined }]).find(location => location.id === base.id);
  assert.equal(unnamedOperator.operatorName, 'Al-Bireh Municipality');
  assert.equal(locations.length, ramallahParkingZones.length);
  const fallback = locations.find(location => location.id === 'rml_manara_municipal_complex');
  assert.equal(fallback.price.hourlyRateNis, 3);
});

test('a successful zone-code lookup retains a newly published zone missing from the original map cache', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  client.setQueryData(['zones', ''], [base]);
  const loader = createClientLoader({ stubs: {
    'react-native': {},
    '@parkflow/client/services': { services: {} },
    '@parkflow/client/hooks/useSession': { useUserId: () => 'driver-1' },
    '@parkflow/client/offline/retryQueue': {},
    '@parkflow/client/offline/storage': {},
    '@parkflow/client/store/preferencesStore': { usePreferencesStore: {} },
  } });
  const { useCacheParkingZone } = loader('packages/client/src/hooks/useParking.ts');
  assert.equal(typeof useCacheParkingZone, 'function');
  let cacheZone, renderer;
  function LookupResult() { cacheZone = useCacheParkingZone(); return null; }
  const newlyPublished = { ...base, id: 'qa-customer-zone', code: 'QA-CUSTOMER', name: 'Freshly published zone' };
  let resolveOldList;
  const oldList = client.fetchQuery({ queryKey: ['zones', ''], queryFn: () => new Promise(resolve => { resolveOldList = resolve; }) }).catch(() => undefined);
  try {
    await act(async () => { renderer = create(React.createElement(QueryClientProvider, { client }, React.createElement(LookupResult))); });
    await act(async () => { await cacheZone(newlyPublished); });
    resolveOldList([base]);
    await oldList;
    const zones = client.getQueryData(['zones', '']);
    assert.equal(zones.find(zone => zone.id === newlyPublished.id)?.code, 'QA-CUSTOMER');
    assert.equal(zones.find(zone => zone.id === base.id)?.name, base.name);
    assert.equal(client.getQueryData(['zone', newlyPublished.id]).name, 'Freshly published zone');
    const updated = { ...newlyPublished, name: 'Updated from lookup', parkingAllowed: false };
    await act(async () => { await cacheZone(updated); });
    assert.equal(client.getQueryData(['zones', '']).filter(zone => zone.id === newlyPublished.id).length, 1);
    assert.equal(client.getQueryData(['zones', '']).find(zone => zone.id === newlyPublished.id).parkingAllowed, false);
    // A subsequent live list update supersedes the resolved lookup normally.
    client.setQueryData(['zones', ''], [{ ...updated, name: 'Latest live feed' }]);
    assert.equal(client.getQueryData(['zones', ''])[0].name, 'Latest live feed');
  } finally { await act(async () => renderer?.unmount()); client.clear(); }
});

test('zone-code lookup cannot be overwritten by an older pending zone-detail request', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  const loader = createClientLoader({ stubs: {
    'react-native': {},
    '@parkflow/client/services': { services: {} },
    '@parkflow/client/hooks/useSession': { useUserId: () => 'driver-1' },
    '@parkflow/client/offline/retryQueue': {},
    '@parkflow/client/offline/storage': {},
    '@parkflow/client/store/preferencesStore': { usePreferencesStore: {} },
  } });
  const { useCacheParkingZone } = loader('packages/client/src/hooks/useParking.ts');
  let cacheZone, renderer, resolveOldDetail;
  function LookupResult() { cacheZone = useCacheParkingZone(); return null; }
  const oldDetail = client.fetchQuery({ queryKey: ['zone', base.id], queryFn: () => new Promise(resolve => { resolveOldDetail = resolve; }) }).catch(() => undefined);
  const latest = { ...base, parkingAllowed: false, accessRestriction: 'Staff only', tariff: { ...base.tariff, hourlyRate: 1500 } };
  try {
    await act(async () => { renderer = create(React.createElement(QueryClientProvider, { client }, React.createElement(LookupResult))); });
    await act(async () => { await cacheZone(latest); });
    resolveOldDetail(base);
    await oldDetail;
    assert.equal(client.getQueryData(['zone', base.id]).parkingAllowed, false);
    assert.equal(client.getQueryData(['zone', base.id]).accessRestriction, 'Staff only');
    assert.equal(client.getQueryData(['zone', base.id]).tariff.hourlyRate, 1500);
  } finally { await act(async () => renderer?.unmount()); client.clear(); }
});

function mapHarness() {
  const routes = [], noop = () => {}, zones = [base, { ...base, id: 'other-zone', code: 'OTHER-1' }];
  const router = { push: route => routes.push(route) };
  const store = state => Object.assign(selector => selector(state), { getState: () => state });
  const routeState = { setOrigin: noop, consume: noop, saveReturnToCar: noop };
  const emptyPlaces = { select: noop, stations: [], services: [], places: [] };
  const t = key => key;
  const stubs = {
    'react-native': { View: native('View'), Platform: { OS: 'web', select: values => values.default }, Linking: { openURL: noop } },
    'expo-router': { useRouter: () => router, useFocusEffect: callback => React.useEffect(callback, [callback]) },
    'expo-status-bar': { StatusBar: native('StatusBar') },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) },
    '@parkflow/client/components/ui': { Reveal: native('Reveal') },
    '@parkflow/client/components/ui/OfflineStaleNotice': { OfflineStaleNotice: native('OfflineStaleNotice') },
    '@parkflow/client/theme/ThemeProvider': { useTheme: () => ({ colors: {} }) },
    '@parkflow/client/hooks/useLocale': { useLocale: () => ({ t, locale: 'en' }) },
    '@parkflow/client/hooks/useVehicles': { useSelectedVehicle: () => ({ vehicles: [], select: noop }) },
    '@parkflow/client/hooks/useParking': { useZones: () => ({ data: zones }), useActiveSessions: () => ({ data: [] }), useCacheParkingZone: () => async () => {} },
    '@parkflow/client/hooks/useCommunity': { useCheckpoints: () => ({ data: [] }), useRoute: () => ({}) },
    '@parkflow/client/hooks/useNotifications': { useUnreadNotificationCount: () => ({ data: 0 }) },
    '@parkflow/client/hooks/useUserLocation': { useUserLocation: () => ({ location: { latitude: 31.9, longitude: 35.2 }, status: 'granted', request: noop }) },
    '@parkflow/client/hooks/useRoadReports': { useCreateRoadReport: () => ({}), useRoadReports: () => ({ data: [] }) },
    '@parkflow/client/hooks/useEvStations': { useEvStations: () => emptyPlaces },
    '@parkflow/client/hooks/useCarServices': { useCarServices: () => emptyPlaces },
    '@parkflow/client/hooks/useTourismPlaces': { useTourismPlaces: () => emptyPlaces },
    '@parkflow/client/store/warningServiceNavigationStore': { useWarningServiceNavigationStore: store({}) },
    '@parkflow/client/store/carServicesStore': { useCarServicesStore: store(emptyPlaces) },
    '@parkflow/client/store/mapLayersStore': { useMapLayersStore: store({ primaryCategory: 'parking', tourismPlaceCategories: [], roadReportsEnabled: false, businessOffersEnabled: false }) },
    '@parkflow/client/store/reservationRouteStore': { useReservationRouteStore: store(routeState) },
    '@parkflow/client/store/authStore': { useAuthStore: store({ user: { id: 'driver-1' } }) },
    '@parkflow/client/services': { DEFAULT_REGION: { latitude: 31.9, longitude: 35.2, latitudeDelta: 0.02, longitudeDelta: 0.02 }, services: {} },
    '@parkflow/client/services/placeSearchService': { searchPlaces: async () => [] },
    '@parkflow/client/utils/tripNeedsRouting': { planRouteWithNeeds: noop },
    '@parkflow/client/utils/haptics': { haptics: { select: noop } },
  };
  for (const name of ['MapSurface', 'MapTopBar', 'MapControlRail', 'NearbyParkingPanel', 'CompactRoutePanel', 'TestLocationControl',
    'RoadReportLocationPanel', 'RoadReportCreationSheet', 'RoadReportDetailsSheet', 'MapLayersSheet', 'EvStationDetailsSheet',
    'EvFiltersSheet', 'EvMapStatus', 'CarServiceDetailsSheet', 'CarServiceMapStatus', 'TourismPlaceDetailsSheet',
    'TourismPlaceMapStatus', 'DestinationSearchBox', 'DestinationParkingPanel']) {
    stubs['../../src/components/map/' + name] = { [name]: native(name) };
  }
  for (const name of ['VehicleSelectorSheet', 'ZoneSheet', 'ActiveSessionBanner', 'ZoneCodeSheet']) {
    stubs['../../src/components/domain/' + name] = { [name]: native(name) };
  }
  const Screen = createClientLoader({ stubs })('apps/customer/app/(tabs)/map.tsx').default;
  let renderer;
  return {
    routes, zones,
    async mount() { globalThis.__DEV__ = false; await act(async () => { renderer = create(React.createElement(Screen)); }); },
    props(name) { return renderer.root.findByType(name).props; },
    async close() { await act(async () => renderer?.unmount()); },
  };
}

test('manual code entry survives Navigate and route Start, while unrelated map selection uses GPS', async () => {
  const harness = mapHarness();
  try {
    await harness.mount();
    await act(async () => { await harness.props('ZoneCodeSheet').onResolved(base); });
    assert.equal(harness.props('ZoneSheet').visible, true);
    await act(async () => { harness.props('ZoneSheet').onNavigate(base); });
    assert.equal(harness.props('ZoneSheet').visible, false);
    await act(async () => { harness.props('CompactRoutePanel').onStartParking(); });
    assert.equal(harness.routes[0].params.entryMethod, 'zone_code');

    await act(async () => { harness.props('MapSurface').onSelectZone(harness.zones[1]); });
    await act(async () => { harness.props('ZoneSheet').onStartParking(harness.zones[1]); });
    assert.equal(harness.routes[1].params.entryMethod, 'gps');

    await act(async () => { harness.props('MapSurface').onSelectZone(base); });
    await act(async () => { harness.props('ZoneSheet').onStartParking(base); });
    assert.equal(harness.routes[2].params.entryMethod, 'gps');
  } finally { await harness.close(); }
});
