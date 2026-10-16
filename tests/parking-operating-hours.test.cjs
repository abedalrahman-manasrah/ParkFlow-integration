const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createClientLoader } = require('./helpers/client-loader.cjs');
const load = createClientLoader();
const { isWithinOperatingHours } = load('packages/client/src/utils/time.ts');
const { assertOpen } = load('server/src/modules/parking/pricing.ts');

const hours = (weekday, opensAt, closesAt, closed = false) => ({ weekday, opensAt, closesAt, closed });
const daily = (opensAt, closesAt, closed = false) => Array.from({ length: 7 }, (_, weekday) => hours(weekday, opensAt, closesAt, closed));

const cases = [
  { name: 'no configured hours', rows: [], at: '2026-01-05T10:00:00Z', want: false },
  { name: 'midnight-to-midnight is open at midday', rows: daily('00:00', '00:00'), at: '2026-01-05T10:00:00Z', want: true },
  { name: 'midnight-to-midnight stays open at midnight', rows: daily('00:00', '00:00'), at: '2026-01-04T22:00:00Z', want: true },
  { name: 'an explicitly closed all-day schedule is closed', rows: daily('00:00', '00:00', true), at: '2026-01-05T10:00:00Z', want: false },
  { name: 'normal hours reject the minute before opening', rows: [hours(1, '08:00', '18:00')], at: '2026-01-05T05:59:00Z', want: false },
  { name: 'normal opening boundary is inclusive', rows: [hours(1, '08:00', '18:00')], at: '2026-01-05T06:00:00Z', want: true },
  { name: 'normal closing boundary is inclusive', rows: [hours(1, '08:00', '18:00')], at: '2026-01-05T16:00:00Z', want: true },
  { name: 'normal hours reject the minute after closing', rows: [hours(1, '08:00', '18:00')], at: '2026-01-05T16:01:00Z', want: false },
  { name: 'today overnight hours do not open early this morning', rows: [hours(1, '22:00', '02:00')], at: '2026-01-04T23:00:00Z', want: false },
  { name: 'today overnight window opens this evening', rows: [hours(1, '22:00', '02:00')], at: '2026-01-05T20:00:00Z', want: true },
  { name: 'previous day overnight window stays open when today is closed', rows: [hours(0, '22:00', '02:00'), hours(1, '08:00', '18:00', true)], at: '2026-01-04T23:00:00Z', want: true },
  { name: 'previous day overnight closing boundary is inclusive', rows: [hours(0, '22:00', '02:00'), hours(1, '08:00', '18:00', true)], at: '2026-01-05T00:00:00Z', want: true },
  { name: 'previous day overnight ends after its closing minute', rows: [hours(0, '22:00', '02:00'), hours(1, '08:00', '18:00', true)], at: '2026-01-05T00:01:00Z', want: false },
  { name: 'closed previous day cannot open today before tonight', rows: [hours(0, '22:00', '02:00', true), hours(1, '22:00', '02:00')], at: '2026-01-04T23:00:00Z', want: false },
  { name: 'equal non-midnight times start a full window at opening', rows: [hours(1, '08:00', '08:00')], at: '2026-01-05T10:00:00Z', want: true },
  { name: 'equal non-midnight times continue into the following day', rows: [hours(1, '08:00', '08:00')], at: '2026-01-06T05:59:00Z', want: true },
  { name: 'equal non-midnight times end at the next closing boundary', rows: [hours(1, '08:00', '08:00')], at: '2026-01-06T06:01:00Z', want: false },
  { name: 'summer opening uses the daylight-saving offset', rows: [hours(1, '12:00', '13:00')], at: '2026-07-06T09:00:00Z', want: true },
  { name: 'winter opening uses the standard-time offset', rows: [hours(1, '12:00', '13:00')], at: '2026-01-05T10:00:00Z', want: true },
  { name: 'spring clock jump remains in the previous overnight window', rows: [hours(5, '22:00', '04:00'), hours(6, '00:00', '00:00', true)], at: '2026-03-28T00:30:00Z', want: true },
  { name: 'autumn first repeated hour is open', rows: [hours(6, '01:00', '02:00')], at: '2026-10-23T22:30:00Z', want: true },
  { name: 'autumn second repeated hour is also open', rows: [hours(6, '01:00', '02:00')], at: '2026-10-23T23:30:00Z', want: true },
];

for (const scenario of cases) {
  test('parking hours: ' + scenario.name, () => {
    const at = new Date(scenario.at);
    let serverOpen = true;
    try { assertOpen(scenario.rows, at); }
    catch (error) {
      assert.equal(error.code, 'ZONE_CLOSED');
      serverOpen = false;
    }
    assert.equal(serverOpen, scenario.want, 'Server contract differs from the hand-checked boundary');
    assert.equal(isWithinOperatingHours(scenario.rows, at), scenario.want);
  });
}

test('parking hours use the zone clock independently of device-local date getters', () => {
  // Date's local getters represent the device timezone. Intl must use the
  // instant itself in Asia/Hebron, so a traveller's local clock cannot change it.
  const at = new Date('2026-01-05T10:00:00Z');
  at.getDay = () => 6;
  at.getHours = () => 23;
  at.getMinutes = () => 59;
  const rows = [hours(1, '12:00', '13:00')];
  assert.doesNotThrow(() => assertOpen(rows, at));
  assert.equal(isWithinOperatingHours(rows, at), true);
});
