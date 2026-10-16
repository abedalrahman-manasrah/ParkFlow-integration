import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { checkpointRows } = vi.hoisted(() => ({ checkpointRows: vi.fn() }));
// Keep route selection, checkpoint-distance checks and Google parsing real.
// Only checkpoint storage and HTTP transport are replaced; no provider is called.
vi.mock('../src/modules/roads/service', () => ({ checkpoints: checkpointRows }));
vi.mock('../src/config/env', () => ({
  env: { OSRM_BASE_URL: 'https://osrm.routing.test', GOOGLE_ROUTES_API_KEY: 'routing-test-fixture' },
}));

type RouteFixture = { distance: number; duration: number; geometry: { coordinates: [number, number][] } };
type IntervalFixture = { startPolylinePointIndex: number; endPolylinePointIndex: number; speed: 'NORMAL' | 'SLOW' | 'TRAFFIC_JAM' };
let routingService: typeof import('../src/modules/routing/service.js')['routingService'];

const origin = { latitude: 31.9, longitude: 35.18 };
const destination = { latitude: 31.9, longitude: 35.22 };
const direct: [number, number][] = [[35.18, 31.9], [35.22, 31.9]];
const detour: [number, number][] = [[35.18, 31.9], [35.18, 31.91], [35.22, 31.91], [35.22, 31.9]];
const closedCheckpoint = {
  id: 'closed-checkpoint', nameEn: 'Closed checkpoint', nameAr: 'Checkpoint fixture',
  status: 'closed', location: { latitude: 31.9, longitude: 35.2 },
};

function mockProviders(
  routes: RouteFixture[],
  googleCoordinates: [number, number][],
  intervals: IntervalFixture[] = [{ startPolylinePointIndex: 0, endPolylinePointIndex: googleCoordinates.length - 1, speed: 'SLOW' }],
  googleOverrides: Record<string, unknown> = {},
) {
  const googleRequests: RequestInit[] = [];
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url.startsWith('https://osrm.routing.test/route/v1/driving/')) {
      return { ok: true, json: async () => ({ code: 'Ok', routes }) };
    }
    if (url === 'https://routes.googleapis.com/directions/v2:computeRoutes') {
      googleRequests.push(init ?? {});
      return { ok: true, json: async () => ({ routes: [{
        distanceMeters: 9999, duration: '480s', staticDuration: '400s',
        polyline: { geoJsonLinestring: { type: 'LineString', coordinates: googleCoordinates } },
        travelAdvisory: { speedReadingIntervals: intervals },
        ...googleOverrides,
      }] }) };
    }
    throw new Error('Unexpected network request in isolated routing test');
  }));
  return googleRequests;
}

beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  checkpointRows.mockResolvedValue([]);
  const { env } = await import('../src/config/env.js');
  env.GOOGLE_ROUTES_API_KEY = 'routing-test-fixture';
  ({ routingService } = await import('../src/modules/routing/service.js'));
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.doUnmock('../src/utils/geo');
});

describe('traffic enrichment of the selected route', () => {
  it('keeps the closure-avoiding route when Google returns the rejected road', async () => {
    checkpointRows.mockResolvedValue([closedCheckpoint]);
    mockProviders([
      { distance: 3800, duration: 100, geometry: { coordinates: direct } },
      { distance: 6000, duration: 400, geometry: { coordinates: detour } },
    ], direct);

    const result = await routingService.getRoute(origin, destination);

    expect(result.coordinates).toEqual([
      { latitude: 31.9, longitude: 35.18 }, { latitude: 31.91, longitude: 35.18 },
      { latitude: 31.91, longitude: 35.22 }, { latitude: 31.9, longitude: 35.22 },
    ]);
    expect(result).toMatchObject({
      distanceMeters: 6000, durationSeconds: 400, penaltySeconds: 0, closuresOnRoute: [], source: 'osrm',
      alternatives: [{ id: 'alternative-1', distanceMeters: 3800, durationSeconds: 100 }],
      rejected: [{ blockedBy: { checkpointId: 'closed-checkpoint', status: 'closed' } }],
      snappedDestination: { latitude: 31.9, longitude: 35.22 },
    });
    expect(result).not.toHaveProperty('trafficSegments');
    expect(result).not.toHaveProperty('trafficSummary');
  });

  it('does not replace a chosen road with a different Google road even with no closures', async () => {
    mockProviders([{ distance: 6000, duration: 400, geometry: { coordinates: detour } }], direct);

    const result = await routingService.getRoute(origin, destination, { mode: 'fastest' });

    expect(result.distanceMeters).toBe(6000);
    expect(result.durationSeconds).toBe(400);
    expect(result).not.toHaveProperty('trafficSegments');
    expect(result).not.toHaveProperty('trafficSummary');
  });

  it('projects traffic colors onto the approved line while retaining the Google delay', async () => {
    mockProviders([{ distance: 6000, duration: 400, geometry: { coordinates: detour } }], [
      [35.18, 31.9], [35.18, 31.905], [35.18, 31.91], [35.2, 31.91], [35.22, 31.91], [35.22, 31.9],
    ], [
      { startPolylinePointIndex: 0, endPolylinePointIndex: 2, speed: 'NORMAL' },
      { startPolylinePointIndex: 2, endPolylinePointIndex: 5, speed: 'SLOW' },
    ]);

    const result = await routingService.getRoute(origin, destination);

    expect(result).toMatchObject({
      distanceMeters: 6000, durationSeconds: 400,
      trafficSummary: {
        provider: 'google-routes', level: 'moderate', state: 'slow',
        durationSeconds: 480, staticDurationSeconds: 400, delaySeconds: 80, delayPercent: 20,
        intervalCounts: { normal: 1, slow: 1, traffic_jam: 0 },
      },
      trafficSegments: [
        { state: 'normal', coordinates: [
          { latitude: 31.9, longitude: 35.18 }, { latitude: 31.91, longitude: 35.18 },
        ] },
        { state: 'slow', coordinates: [
          { latitude: 31.91, longitude: 35.18 }, { latitude: 31.91, longitude: 35.22 },
          { latitude: 31.9, longitude: 35.22 },
        ] },
      ],
    });
    expect(result).not.toHaveProperty('routeCoordinates');
  });

  it('rechecks cached Google geometry against newly reported closures near the chosen road', async () => {
    // The OSRM road is 267 m from the checkpoint. Google's road is only 234 m
    // away, so it is geometrically close but newly exposes the driver to it.
    const nearOrigin = { latitude: 31.9024, longitude: 35.18 };
    const nearDestination = { latitude: 31.9024, longitude: 35.22 };
    mockProviders([{ distance: 3800, duration: 400, geometry: {
      coordinates: [[35.18, 31.9024], [35.22, 31.9024]],
    } }], [[35.18, 31.9024], [35.19, 31.9021], [35.21, 31.9021], [35.22, 31.9024]]);

    const beforeClosure = await routingService.getRoute(nearOrigin, nearDestination);
    expect(beforeClosure).toMatchObject({
      trafficSummary: { delaySeconds: 80 },
      trafficSegments: [{ state: 'slow', coordinates: [
        { latitude: 31.9024, longitude: 35.18 }, { latitude: 31.9024, longitude: 35.22 },
      ] }],
    });

    checkpointRows.mockResolvedValue([closedCheckpoint]);
    const afterClosure = await routingService.getRoute(nearOrigin, nearDestination);

    expect(afterClosure).toMatchObject({ closuresOnRoute: [], penaltySeconds: 0, distanceMeters: 3800, durationSeconds: 400 });
    expect(afterClosure).not.toHaveProperty('trafficSegments');
    expect(afterClosure).not.toHaveProperty('trafficSummary');
  });

  it('rejects shortcuts whose endpoints are on the approved line but segment interiors leave it', async () => {
    const crossedDetour: [number, number][] = [
      [35.18, 31.9], [35.22, 31.91], [35.18, 31.91], [35.22, 31.9],
    ];
    mockProviders([{ distance: 6000, duration: 400, geometry: { coordinates: detour } }], crossedDetour);

    const result = await routingService.getRoute(origin, destination);

    expect(result).not.toHaveProperty('trafficSegments');
    expect(result).not.toHaveProperty('trafficSummary');
  });

  it('checks Google closure exposure in fastest mode without changing fastest ranking or closure metadata', async () => {
    checkpointRows.mockResolvedValue([closedCheckpoint]);
    const nearOrigin = { latitude: 31.9024, longitude: 35.18 };
    const nearDestination = { latitude: 31.9024, longitude: 35.22 };
    mockProviders([
      { distance: 3800, duration: 100, geometry: { coordinates: [[35.18, 31.9024], [35.22, 31.9024]] } },
      { distance: 6000, duration: 400, geometry: { coordinates: detour } },
    ], [[35.18, 31.9024], [35.19, 31.9021], [35.21, 31.9021], [35.22, 31.9024]]);

    const result = await routingService.getRoute(nearOrigin, nearDestination, { mode: 'fastest', maxAlternatives: 1 });

    expect(result).toMatchObject({
      distanceMeters: 3800, durationSeconds: 100, closuresOnRoute: [], penaltySeconds: 0,
      alternatives: [{ id: 'alternative-1', distanceMeters: 6000, durationSeconds: 400 }],
    });
    expect(result).not.toHaveProperty('trafficSegments');
    expect(result).not.toHaveProperty('trafficSummary');
  });

  it('keeps the approved base line visible when Google traffic intervals have a gap', async () => {
    mockProviders([{ distance: 6000, duration: 400, geometry: { coordinates: detour } }], detour, [
      { startPolylinePointIndex: 0, endPolylinePointIndex: 1, speed: 'NORMAL' },
      { startPolylinePointIndex: 2, endPolylinePointIndex: 3, speed: 'SLOW' },
    ]);

    const result = await routingService.getRoute(origin, destination);

    expect(result).toMatchObject({
      trafficSegments: [],
      trafficSummary: { durationSeconds: 480, staticDurationSeconds: 400, delaySeconds: 80, state: 'slow' },
    });
  });

  it('rejects a Google route that doubles back along the selected road', async () => {
    mockProviders([{ distance: 6000, duration: 400, geometry: { coordinates: detour } }], [
      [35.18, 31.9], [35.18, 31.91], [35.22, 31.91],
      [35.18, 31.91], [35.22, 31.91], [35.22, 31.9],
    ]);

    const result = await routingService.getRoute(origin, destination);

    expect(result).not.toHaveProperty('trafficSegments');
    expect(result).not.toHaveProperty('trafficSummary');
  });


  it('preserves fastest routing without a checkpoint lookup when Google traffic is disabled', async () => {
    const { env } = await import('../src/config/env.js');
    env.GOOGLE_ROUTES_API_KEY = undefined;
    checkpointRows.mockRejectedValue(new Error('Fastest mode must not need checkpoint storage without traffic'));
    mockProviders([{ distance: 3800, duration: 100, geometry: { coordinates: direct } }], direct);

    const result = await routingService.getRoute(origin, destination, { mode: 'fastest' });

    expect(result).toMatchObject({ distanceMeters: 3800, durationSeconds: 100, closuresOnRoute: [], penaltySeconds: 0 });
    expect(result).not.toHaveProperty('trafficSegments');
    expect(result).not.toHaveProperty('trafficSummary');
  });


  it('requests the colored traffic intervals from Google when enrichment is enabled', async () => {
    const googleRequests = mockProviders([
      { distance: 3800, duration: 400, geometry: { coordinates: direct } },
    ], direct);

    const result = await routingService.getRoute(origin, destination);

    expect(result).toHaveProperty('trafficSummary');
    const request = JSON.parse(String(googleRequests[0]?.body));
    expect(request.extraComputations).toEqual(['TRAFFIC_ON_POLYLINE']);
  });


  it('returns the fastest OSRM route without enrichment when checkpoint storage is unavailable', async () => {
    checkpointRows.mockRejectedValue(new Error('Checkpoint storage unavailable'));
    const googleRequests = mockProviders([{ distance: 3800, duration: 100, geometry: { coordinates: direct } }], direct);

    const result = await routingService.getRoute(origin, destination, { mode: 'fastest' });

    expect(result).toMatchObject({ source: 'osrm', distanceMeters: 3800, durationSeconds: 100, closuresOnRoute: [] });
    expect(result).not.toHaveProperty('trafficSummary');
    expect(result).not.toHaveProperty('trafficSegments');
    expect(googleRequests).toEqual([]);
  });

  it('continues to fail checkpoint-aware routing when current checkpoint storage is unavailable', async () => {
    const unavailable = new Error('Checkpoint storage unavailable');
    checkpointRows.mockRejectedValue(unavailable);
    mockProviders([{ distance: 3800, duration: 100, geometry: { coordinates: direct } }], direct);

    await expect(routingService.getRoute(origin, destination)).rejects.toBe(unavailable);
  });

  it.each([
    { name: 'interval map', fields: { travelAdvisory: { speedReadingIntervals: {} } } },
    { name: 'null interval', fields: { travelAdvisory: { speedReadingIntervals: [null] } } },
    { name: 'numeric interval', fields: { travelAdvisory: { speedReadingIntervals: [7] } } },
    { name: 'numeric duration', fields: { duration: 480 } },
    { name: 'overflowing duration', fields: { duration: '9'.repeat(400) + 's' } },
    { name: 'overflowing static duration', fields: { staticDuration: '9'.repeat(400) + 's' } },
    { name: 'overflowing delay percentage', fields: { duration: '1' + '0'.repeat(308) + 's', staticDuration: '1s' } },
    { name: 'missing interval end', fields: { travelAdvisory: { speedReadingIntervals: [{ speed: 'SLOW' }] } } },
    { name: 'string interval end', fields: { travelAdvisory: { speedReadingIntervals: [{ speed: 'SLOW', endPolylinePointIndex: '1' }] } } },
    { name: 'null interval start', fields: { travelAdvisory: { speedReadingIntervals: [{ speed: 'SLOW', startPolylinePointIndex: null, endPolylinePointIndex: 1 }] } } },
  ])('omits malformed Google traffic safely: $name', async ({ fields }) => {
    mockProviders([{ distance: 3800, duration: 100, geometry: { coordinates: direct } }], direct, undefined, fields);

    const result = await routingService.getRoute(origin, destination);

    expect(result).toMatchObject({ source: 'osrm', distanceMeters: 3800, durationSeconds: 100 });
    expect(result).not.toHaveProperty('trafficSummary');
    expect(result).not.toHaveProperty('trafficSegments');
  });

  it('rejects excessive provider point counts before constructing traffic', async () => {
    const points: [number, number][] = Array.from({ length: 2001 }, (_value, index) => [35.18 + index / 2000 * 0.04, 31.9]);
    mockProviders([], points);
    const { enrichTraffic } = await import('../src/modules/routing/traffic.js');

    expect(await enrichTraffic(origin, destination) === undefined).toBe(true);
  });

  it('rejects excessive provider interval counts before constructing traffic slices', async () => {
    const intervals: IntervalFixture[] = Array.from({ length: 513 }, () => ({
      startPolylinePointIndex: 0, endPolylinePointIndex: 1, speed: 'NORMAL',
    }));
    mockProviders([], direct, intervals);
    const { enrichTraffic } = await import('../src/modules/routing/traffic.js');

    expect(await enrichTraffic(origin, destination) === undefined).toBe(true);
  });

  it('rejects matching dense lines over the work budget before pairwise projection', async () => {
    let distanceCalculations = 0;
    vi.doMock('../src/utils/geo', async () => {
      const actual = await vi.importActual<typeof import('../src/utils/geo.js')>('../src/utils/geo');
      return { ...actual, distanceMeters: (...points: Parameters<typeof actual.distanceMeters>) => {
        distanceCalculations++;
        return actual.distanceMeters(...points);
      } };
    });
    vi.resetModules();
    ({ routingService } = await import('../src/modules/routing/service.js'));
    const points: [number, number][] = Array.from({ length: 1500 }, (_value, index) => [35.18 + index / 1499 * 0.04, 31.9]);
    mockProviders([{ distance: 3800, duration: 100, geometry: { coordinates: points } }], points);

    const result = await routingService.getRoute(origin, destination);

    // Only linear indexing is needed to decline this 4.5-million-check match.
    expect(distanceCalculations).toBeLessThan(10000);
    expect(result).toMatchObject({ source: 'osrm', distanceMeters: 3800, durationSeconds: 100 });
    expect(result).not.toHaveProperty('trafficSummary');
  });

});
