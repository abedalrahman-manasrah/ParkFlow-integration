import type { GeoPoint } from '../../utils/geo';
import { env } from '../../config/env';

export type TrafficState = 'normal' | 'slow' | 'traffic_jam';

export interface TrafficSegment {
  state: TrafficState;
  coordinates: GeoPoint[];
}

export interface TrafficSummary {
  provider: 'google-routes';
  level: 'light' | 'moderate' | 'heavy';
  state: TrafficState;
  durationSeconds?: number;
  staticDurationSeconds?: number;
  delaySeconds?: number;
  delayPercent?: number;
  intervalCounts: Record<TrafficState, number>;
}

export interface TrafficEnrichment {
  /** Full provider geometry, used internally to validate attribution before returning traffic. */
  routeCoordinates: GeoPoint[];
  trafficSegments: TrafficSegment[];
  trafficSummary: TrafficSummary;
}

interface GoogleRoute {
  distanceMeters?: number;
  duration?: string;
  staticDuration?: string;
  polyline?: { geoJsonLinestring?: { coordinates?: [number, number][] } };
  travelAdvisory?: {
    speedReadingIntervals?: {
      startPolylinePointIndex?: number;
      endPolylinePointIndex?: number;
      speed?: 'NORMAL' | 'SLOW' | 'TRAFFIC_JAM';
    }[];
  };
}

export interface TrafficDebugResult {
  name: string;
  origin: GeoPoint;
  destination: GeoPoint;
  routeReturned: boolean;
  distanceMeters?: number;
  durationSeconds?: number;
  staticDurationSeconds?: number;
  delaySeconds?: number;
  delayPercent?: number;
  trafficIntervals: number;
  normal: number;
  slow: number;
  trafficJam: number;
}

const GOOGLE_ROUTES_URL = 'https://routes.googleapis.com/directions/v2:computeRoutes';
const TIMEOUT_MS = 5000;
// Bound provider parsing/storage independently of the later geometry work budget.
const MAX_PROVIDER_COORDINATES = 2000;
const MAX_PROVIDER_INTERVALS = 512;
const cache = new Map<string, { value?: TrafficEnrichment; expires: number }>();

export const TRAFFIC_DELAY_THRESHOLDS = {
  slowPercent: 10,
  trafficJamPercent: 30,
} as const;

const keyOf = (from: GeoPoint, to: GeoPoint) =>
  [from.latitude, from.longitude, to.latitude, to.longitude].map((n) => n.toFixed(4)).join(',');

const recordOf = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;

const parseDurationSeconds = (value: unknown) => {
  if (typeof value !== 'string' || value.length > 64) return undefined;
  const match = value.match(/^(\d+(?:\.\d+)?)s$/);
  const seconds = match ? Math.round(Number(match[1])) : NaN;
  return Number.isFinite(seconds) ? seconds : undefined;
};

const stateOf = (speed: unknown): TrafficState | undefined => {
  if (speed === 'NORMAL') return 'normal';
  if (speed === 'SLOW') return 'slow';
  if (speed === 'TRAFFIC_JAM') return 'traffic_jam';
  return undefined;
};

function stateFromDelay(delayPercent: number): TrafficState {
  if (delayPercent > TRAFFIC_DELAY_THRESHOLDS.trafficJamPercent) return 'traffic_jam';
  if (delayPercent > TRAFFIC_DELAY_THRESHOLDS.slowPercent) return 'slow';
  return 'normal';
}

const levelFromState = (state: TrafficState): TrafficSummary['level'] =>
  state === 'traffic_jam' ? 'heavy' : state === 'slow' ? 'moderate' : 'light';

function buildTraffic(value: unknown): TrafficEnrichment | undefined {
  const route = recordOf(value);
  const polyline = recordOf(route?.polyline);
  const geometry = recordOf(polyline?.geoJsonLinestring);
  const rawCoordinates = geometry?.coordinates;
  if (!route || (geometry?.type !== undefined && geometry.type !== 'LineString') ||
    !Array.isArray(rawCoordinates) || rawCoordinates.length < 2 || rawCoordinates.length > MAX_PROVIDER_COORDINATES ||
    rawCoordinates.some((point) =>
      !Array.isArray(point) || !Number.isFinite(point[0]) || !Number.isFinite(point[1]) ||
      Math.abs(point[0]) > 180 || Math.abs(point[1]) > 90,
    )
  ) return undefined;
  if (route.distanceMeters !== undefined &&
    (typeof route.distanceMeters !== 'number' || !Number.isFinite(route.distanceMeters) || route.distanceMeters < 0)
  ) return undefined;

  const advisory = recordOf(route.travelAdvisory);
  if (route.travelAdvisory !== undefined && !advisory) return undefined;
  const rawIntervals = advisory?.speedReadingIntervals;
  if (rawIntervals !== undefined && (!Array.isArray(rawIntervals) || rawIntervals.length > MAX_PROVIDER_INTERVALS)) return undefined;
  const intervals: unknown[] = rawIntervals === undefined ? [] : rawIntervals as unknown[];

  const durationSeconds = parseDurationSeconds(route.duration);
  const staticDurationSeconds = parseDurationSeconds(route.staticDuration);
  if (durationSeconds === undefined || staticDurationSeconds === undefined ||
    staticDurationSeconds <= 0 || durationSeconds < 0
  ) return undefined;
  const delaySeconds = Math.max(0, durationSeconds - staticDurationSeconds);
  const delayPercent = delaySeconds / staticDurationSeconds * 100;
  if (!Number.isFinite(delaySeconds) || !Number.isFinite(delayPercent)) return undefined;

  const intervalCounts: Record<TrafficState, number> = { normal: 0, slow: 0, traffic_jam: 0 };
  const validatedIntervals: { state: TrafficState; start: number; end: number }[] = [];
  let coveredThrough = 0;
  let completeCoverage = intervals.length > 0;
  for (const value of intervals) {
    const interval = recordOf(value);
    const state = stateOf(interval?.speed);
    // Proto3 may omit a zero start. The end is required; missing it must not invent coverage.
    const start = interval?.startPolylinePointIndex === undefined ? 0 : interval.startPolylinePointIndex;
    const end = interval?.endPolylinePointIndex;
    if (!interval || !state || typeof start !== 'number' || typeof end !== 'number' ||
      !Number.isInteger(start) || !Number.isInteger(end) ||
      start < 0 || end >= rawCoordinates.length || end <= start
    ) return undefined;
    if (start !== coveredThrough) completeCoverage = false;
    coveredThrough = end;
    intervalCounts[state] += 1;
    validatedIntervals.push({ state, start, end });
  }
  const coordinates = rawCoordinates.map(([longitude, latitude]) => ({ latitude, longitude }));
  // Validate complete, contiguous coverage before allocating slices. Valid ranges
  // then copy at most N + intervals points; gaps/overlaps retain only the summary.
  const trafficSegments = completeCoverage && coveredThrough === coordinates.length - 1
    ? validatedIntervals.map(({ state, start, end }) => ({ state, coordinates: coordinates.slice(start, end + 1) }))
    : [];
  const intervalState = intervalCounts.traffic_jam > 0
    ? 'heavy'
    : intervalCounts.slow > 0
      ? 'moderate'
      : 'light';
  const state = trafficSegments.length
    ? intervalState === 'heavy'
      ? 'traffic_jam'
      : intervalState === 'moderate'
        ? 'slow'
        : 'normal'
    : stateFromDelay(delayPercent);

  return {
    routeCoordinates: coordinates,
    trafficSegments,
    trafficSummary: {
      provider: 'google-routes',
      level: trafficSegments.length ? intervalState : levelFromState(state),
      state,
      durationSeconds,
      staticDurationSeconds,
      delaySeconds: delaySeconds > 0 ? delaySeconds : undefined,
      delayPercent,
      intervalCounts,
    },
  };
}

async function fetchGoogleRoute(from: GeoPoint, to: GeoPoint): Promise<GoogleRoute | undefined> {
  if (!env.GOOGLE_ROUTES_API_KEY) return undefined;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(GOOGLE_ROUTES_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': env.GOOGLE_ROUTES_API_KEY,
        'X-Goog-FieldMask': [
          'routes.distanceMeters',
          'routes.duration',
          'routes.staticDuration',
          'routes.polyline.geoJsonLinestring',
          'routes.travelAdvisory.speedReadingIntervals',
        ].join(','),
      },
      body: JSON.stringify({
        origin: { location: { latLng: { latitude: from.latitude, longitude: from.longitude } } },
        destination: { location: { latLng: { latitude: to.latitude, longitude: to.longitude } } },
        travelMode: 'DRIVE',
        routingPreference: 'TRAFFIC_AWARE',
        // Colored intervals require this computation and Google's higher traffic-aware polyline billing tier.
        // https://developers.google.com/maps/documentation/routes/traffic_on_polylines
        extraComputations: ['TRAFFIC_ON_POLYLINE'],
        computeAlternativeRoutes: false,
        departureTime: new Date(Date.now() + 120_000).toISOString(),
        polylineEncoding: 'GEO_JSON_LINESTRING',
      }),
    });
    if (!response.ok) return undefined;
    const json = recordOf(await response.json());
    const routes = json?.routes;
    return Array.isArray(routes) && recordOf(routes[0]) ? routes[0] as GoogleRoute : undefined;
  } catch {
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}

export async function enrichTraffic(from: GeoPoint, to: GeoPoint): Promise<TrafficEnrichment | undefined> {
  if (!env.GOOGLE_ROUTES_API_KEY) return undefined;
  const key = keyOf(from, to);
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.value;
  const route = await fetchGoogleRoute(from, to);
  let value: TrafficEnrichment | undefined;
  try {
    value = route ? buildTraffic(route) : undefined;
  } catch {
    // Optional provider parsing must never take down the selected OSRM route.
    value = undefined;
  }
  if (cache.size > 500) cache.clear();
  cache.set(key, { value, expires: Date.now() + 60_000 });
  return value;
}

export async function debugRamallahTraffic(): Promise<TrafficDebugResult[]> {
  const routes = [
    {
      name: 'Al-Manara -> Al-Irsal',
      from: { latitude: 31.90378, longitude: 35.20359 },
      to: { latitude: 31.89932, longitude: 35.21225 },
    },
    {
      name: 'Al-Manara -> Ramallah Municipality',
      from: { latitude: 31.90378, longitude: 35.20359 },
      to: { latitude: 31.90441, longitude: 35.20028 },
    },
    {
      name: 'Al-Manara -> Al-Tireh',
      from: { latitude: 31.90378, longitude: 35.20359 },
      to: { latitude: 31.91465, longitude: 35.19178 },
    },
    {
      name: 'Al-Manara -> Palestine Medical Complex',
      from: { latitude: 31.90378, longitude: 35.20359 },
      to: { latitude: 31.9097, longitude: 35.20408 },
    },
    {
      name: 'Al-Irsal -> Al-Tireh',
      from: { latitude: 31.89932, longitude: 35.21225 },
      to: { latitude: 31.91465, longitude: 35.19178 },
    },
  ];
  const results: TrafficDebugResult[] = [];
  for (const route of routes) {
    const googleRoute = await fetchGoogleRoute(route.from, route.to);
    const enrichment = googleRoute ? buildTraffic(googleRoute) : undefined;
    results.push({
      name: route.name,
      origin: route.from,
      destination: route.to,
      routeReturned: Boolean(googleRoute),
      distanceMeters: googleRoute?.distanceMeters,
      durationSeconds: parseDurationSeconds(googleRoute?.duration),
      staticDurationSeconds: parseDurationSeconds(googleRoute?.staticDuration),
      delaySeconds: enrichment?.trafficSummary.delaySeconds ?? 0,
      delayPercent: enrichment?.trafficSummary.delayPercent,
      trafficIntervals: googleRoute?.travelAdvisory?.speedReadingIntervals?.length ?? 0,
      normal: enrichment?.trafficSummary.intervalCounts.normal ?? 0,
      slow: enrichment?.trafficSummary.intervalCounts.slow ?? 0,
      trafficJam: enrichment?.trafficSummary.intervalCounts.traffic_jam ?? 0,
    });
  }
  return results;
}
