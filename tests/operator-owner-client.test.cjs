const { test } = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { create, act } = require('react-test-renderer');
const { QueryClient, QueryClientProvider } = require('@tanstack/react-query');
const { createClientLoader } = require('./helpers/client-loader.cjs');

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const components = ['AppButton', 'AppHeader', 'AppText', 'Card', 'EmptyState', 'ErrorState', 'InlineNotice', 'Screen', 'Segmented', 'SkeletonGroup', 'StatusBadge', 'SwitchRow', 'TextField'];
const ui = Object.fromEntries(components.map(name => [name, props => React.createElement(name, props, props.children)]));
const zone = { id: 'owned-zone', operatorId: 'organization', name: 'Owned parking', nameAr: 'موقف المالك', code: 'LOT', city: 'Ramallah', cityAr: 'رام الله', capacity: 20, latitude: 31.9, longitude: 35.2, kind: 'lot', defaultMode: 'start_stop', supportedModes: ['start_stop'], supportedEntryMethods: ['manual'], version: 1, lifecycle: 'draft', operatingHours: [], tariffs: [], closures: [], operator: { name: 'Organization' }, canEdit: true, metadata: null, feedHealth: { stale: false, conflict: false } };
const reservations = ['a', 'b'].map(id => ({ id: `reservation-${id}`, publicCode: id.toUpperCase(), status: 'confirmed', operatorResolution: 'none' }));
const wait = () => new Promise(resolve => setTimeout(resolve, 15));

async function harness({ locale = 'en', operator = {}, analytics, management = {} } = {}) {
  const calls = [];
  const services = { operator: { summary: async () => ({ assignedZones: [zone] }), listReservations: async () => reservations, updateAvailability: async () => ({}), checkIn: async (...args) => { calls.push(['checkIn', ...args]); return {}; }, resolveReservation: async (...args) => { calls.push(['recovery', ...args]); return {}; }, ...operator } };
  const load = createClientLoader({ application: 'management', stubs: {
    'react-native': { View: props => React.createElement('View', props, props.children), Image: props => React.createElement('Image', props) },
    'expo-router': { useLocalSearchParams: () => ({ id: zone.id }) },
    '@parkflow/client/components/ui': ui,
    '@parkflow/client/utils/errors': { AppError: class AppError extends Error {} },
    '@parkflow/client/hooks/useLocale': { useLocale: () => ({ t: key => key, locale, textAlign: locale === 'ar' ? 'right' : 'left' }) },
    '@parkflow/client/services': { services },
    '@parkflow/client/services/http/apiClient': { api: async (...args) => { calls.push(['api', ...args]); return analytics?.(...args) ?? { zones: [] }; }, captureLoginGuard: () => () => {} },
    '@parkflow/client/services/http/managementService': { managementService: { tariff: async (...args) => { calls.push(['tariff', ...args]); return zone; }, ...management } },
  } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false, gcTime: Infinity } } });
  let renderer;
  return {
    calls, client,
    async mount(file, props) { const exported = load(file); const Component = exported.default ?? exported.ZoneEditor; await act(async () => { renderer = create(React.createElement(QueryClientProvider, { client }, React.createElement(Component, props))); await wait(); }); await act(wait); },
    fields(label) { return renderer.root.findAllByType('TextField').filter(node => node.props.label === label); },
    buttons(label) { return renderer.root.findAllByType('AppButton').filter(node => node.props.label === label); },
    nodes(name) { return renderer.root.findAllByType(name); },
    async press(button) { await act(async () => { button.props.onPress(); await wait(); }); await act(wait); },
    async change(field, value) { await act(async () => field.props.onChangeText(value)); },
    async cleanup() { await act(async () => renderer?.unmount()); client.clear(); },
  };
}

const zonePage = 'apps/management/app/operator/zones/[id].tsx';
const analyticsPage = 'apps/management/app/operator/analytics.tsx';

test('operator keeps QR tokens and recovery notes with their reservation', async () => {
  const h = await harness();
  try {
    await h.mount(zonePage);
    await h.change(h.fields('operator.qrToken')[0], 'parkflow://reservation/token-a');
    await h.change(h.fields('operator.recoveryNote')[0], 'Alternative reserved for A');
    assert.equal(h.fields('operator.qrToken')[1].props.value, '');
    assert.equal(h.fields('operator.recoveryNote')[1].props.value, '');
    await h.press(h.buttons('operator.checkIn')[1]);
    await h.press(h.buttons('operator.offerAlternative')[1]);
    assert.deepEqual(h.calls.filter(call => call[0] === 'checkIn'), [['checkIn', 'reservation-b', undefined]]);
    assert.deepEqual(h.calls.filter(call => call[0] === 'recovery'), [['recovery', 'reservation-b', { resolution: 'alternative', note: undefined }]]);
  } finally { await h.cleanup(); }
});

test('operator displays check-in and recovery failures next to the affected reservation', async () => {
  const qrError = new Error('The QR code does not match this reservation');
  const recoveryError = new Error('Your role does not allow recovery');
  const h = await harness({ operator: { checkIn: async () => { throw qrError; }, resolveReservation: async () => { throw recoveryError; } } });
  try {
    await h.mount(zonePage);
    await h.press(h.buttons('operator.checkIn')[0]);
    await h.press(h.buttons('operator.offerAlternative')[1]);
    assert.ok(h.nodes('ErrorState').some(node => node.props.error === qrError));
    assert.ok(h.nodes('ErrorState').some(node => node.props.error === recoveryError));
  } finally { await h.cleanup(); }
});

test('operator confirms successful check-in and recovery', async () => {
  const h = await harness();
  try {
    await h.mount(zonePage);
    await h.press(h.buttons('operator.checkIn')[0]);
    await h.press(h.buttons('operator.offerAlternative')[1]);
    assert.equal(h.nodes('InlineNotice').filter(node => node.props.tone === 'success').length, 2);
  } finally { await h.cleanup(); }
});

test('operator reservations query failure offers a retry', async () => {
  let attempts = 0;
  const failure = new Error('Reservations could not load');
  const h = await harness({ operator: { listReservations: async () => { if (++attempts === 1) throw failure; return reservations; } } });
  try {
    await h.mount(zonePage);
    const error = h.nodes('ErrorState').find(node => node.props.error === failure);
    assert.ok(error);
    assert.equal(typeof error.props.onRetry, 'function');
    await act(async () => { error.props.onRetry(); await wait(); });
    await act(wait);
    assert.equal(h.fields('operator.qrToken').length, 2);
  } finally { await h.cleanup(); }
});

test('operator analytics failure offers retry and then shows the Arabic location name', async () => {
  let attempts = 0;
  const failure = new Error('Analytics unavailable');
  const h = await harness({ locale: 'ar', analytics: async () => { if (++attempts === 1) throw failure; return { zones: [{ zoneId: zone.id, name: zone.name, nameAr: zone.nameAr, reservationConversion: { total: 4, checkedIn: 2 }, feedQuality: { samples: 5 } }] }; } });
  try {
    await h.mount(analyticsPage);
    const error = h.nodes('ErrorState').find(node => node.props.error === failure);
    assert.ok(error);
    await act(async () => { error.props.onRetry(); await wait(); });
    await act(wait);
    assert.ok(h.nodes('AppText').some(node => node.props.children === zone.nameAr));
  } finally { await h.cleanup(); }
});

test('operator analytics explains an empty result', async () => {
  const h = await harness();
  try { await h.mount(analyticsPage); assert.equal(h.nodes('EmptyState').length, 1); }
  finally { await h.cleanup(); }
});

for (const explicit of [false, true]) {
  test(`tariff submission ${explicit ? 'preserves an explicit schedule' : 'uses a fresh default start after editing details'}`, async () => {
    const realNow = Date.now;
    const openedAt = Date.parse('2026-10-16T10:00:00.000Z');
    let now = openedAt;
    Date.now = () => now;
    const h = await harness();
    try {
      await h.mount('apps/management/src/components/management/ZoneEditor.tsx', { zone, operators: [], isAdmin: false, onSaved() {}, onClose() {}, onReload() {} });
      await act(async () => h.nodes('Segmented')[0].props.onChange('tariff'));
      const chosen = '2026-10-17T09:00:00+03:00';
      if (explicit) await h.change(h.fields('Effective from, including timezone')[0], chosen);
      now += 5 * 60000;
      await h.press(h.buttons('Add tariff')[0]);
      const input = h.calls.find(call => call[0] === 'tariff')[3];
      if (explicit) assert.equal(input.validFrom, new Date(chosen).toISOString());
      else assert.ok(Date.parse(input.validFrom) >= now, `Default tariff start ${input.validFrom} precedes submission`);
    } finally { Date.now = realNow; await h.cleanup(); }
  });
}

