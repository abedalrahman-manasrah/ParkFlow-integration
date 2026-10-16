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

interface GoogleRoutesResponse {
  routes?: GoogleRoute[];
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
const cache = new Map<string, { value?: TrafficEnrichment; expires: number }>();

export const TRAFFIC_DELAY_THRESHOLDS = {
  slowPercent: 10,
  trafficJamPercent: 30,
} as const;

const keyOf = (from: GeoPoint, to: GeoPoint) =>
  [from.latitude, from.longitude, to.latitude, to.longitude].map((n) => n.toFixed(4)).join(',');

const parseDurationSeconds = (value?: string) => {
  const match = value?.match(/^(\d+(?:\.\d+)?)s$/);
  return match ? Math.round(Number(match[1])) : undefined;
};

const stateOf = (speed?: string): TrafficState | undefined => {
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

function buildTraffic(route: GoogleRoute): TrafficEnrichment | undefined {
  const coordinates = route.polyline?.geoJsonLinestring?.coordinates
    ?.map(([longitude, latitude]) => ({ latitude, longitude }))
    .filter((point) => Number.isFinite(point.latitude) && Number.isFinite(point.longitude));
  const intervals = route.travelAdvisory?.speedReadingIntervals ?? [];
  if (!coordinates || coordinates.length < 2) return undefined;

  const durationSeconds = parseDurationSeconds(route.duration);
  const staticDurationSeconds = parseDurationSeconds(route.staticDuration);
  if (
    durationSeconds === undefined ||
    staticDurationSeconds === undefined ||
    staticDurationSeconds <= 0 ||
    durationSeconds < 0
  ) {
    return undefined;
  }
  const delaySeconds = Math.max(0, durationSeconds - staticDurationSeconds);
  const delayPercent = delaySeconds / staticDurationSeconds * 100;

  const intervalCounts: Record<TrafficState, number> = { normal: 0, slow: 0, traffic_jam: 0 };
  const trafficSegments = intervals.flatMap((interval): TrafficSegment[] => {
    const state = stateOf(interval.speed);
    if (!state) return [];
    const start = Math.max(0, Math.min(coordinates.length - 2, interval.startPolylinePointIndex ?? 0));
    const end = Math.max(
      start + 1,
      Math.min(coordinates.length - 1, interval.endPolylinePointIndex ?? coordinates.length - 1),
    );
    const segment = coordinates.slice(start, end + 1);
    if (segment.length < 2) return [];
    intervalCounts[state] += 1;
    return [{ state, coordinates: segment }];
  });
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
        computeAlternativeRoutes: false,
        departureTime: new Date(Date.now() + 120_000).toISOString(),
        polylineEncoding: 'GEO_JSON_LINESTRING',
      }),
    });
    if (!response.ok) return undefined;
    const json = (await response.json()) as GoogleRoutesResponse;
    return json.routes?.[0];
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
  const value = route ? buildTraffic(route) : undefined;
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
