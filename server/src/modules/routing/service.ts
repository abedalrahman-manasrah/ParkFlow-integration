
import type { GeoPoint } from '../../utils/geo';
import { env } from '../../config/env';
import { checkpoints } from '../roads/service';
type CheckpointState = Awaited<ReturnType<typeof checkpoints>>[number];
interface RouteClosure {checkpointId:string;nameAr:string;nameEn:string;status:'closed'|'congested'}
import { distanceMeters, distanceToPolyline } from '../../utils/geo';
import { enrichTraffic } from './traffic';
import { alignTrafficToRoute } from './trafficGeometry';


/**
 * Checkpoint-aware routing, ported from Wusool: ask the public OSRM server for
 * alternatives, then score each one by travel time plus a penalty for every
 * live closure it passes. The rejected alternatives come back too, so the map
 * can show the road the driver did NOT take and name the closure that ruled it
 * out. Offline, it degrades to a straight line rather than failing.
 */

const OSRM = env.OSRM_BASE_URL;
const NEAR_METERS = 250;
const PENALTY_SECONDS = { closed: 3600, congested: 900 } as const;
const TIMEOUT_MS = 6000;
/** Rough urban driving speed for the offline estimate, m/s (~30 km/h). */
const FALLBACK_SPEED = 8.3;

interface OsrmRoute {
  coordinates: GeoPoint[];
  distance: number;
  duration: number;
}

interface OsrmResponse {
  code?: string;
  routes?: { distance: number; duration: number; geometry: { coordinates: [number, number][] } }[];
}

interface OsrmNearestResponse {
  code?: string;
  waypoints?: { location: [number, number] }[];
}

interface RouteOptions {
  mode?: 'checkpoint-aware' | 'fastest';
  snapDestination?: boolean;
  maxAlternatives?: number;
}

/** Geometry is cached per origin/destination; scoring is redone on every call. */
const cache = new Map<string, {routes:OsrmRoute[];expires:number}>();

const keyOf = (from: GeoPoint, to: GeoPoint) =>
  [from.latitude, from.longitude, to.latitude, to.longitude].map((n) => n.toFixed(4)).join(',');

async function fetchRoutes(from: GeoPoint, to: GeoPoint): Promise<OsrmRoute[]> {
  const key = keyOf(from, to);
  const hit = cache.get(key);
  if (hit && hit.expires>Date.now()) return hit.routes;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const url =
      `${OSRM}/route/v1/driving/${from.longitude},${from.latitude};${to.longitude},${to.latitude}` +
      '?alternatives=true&overview=full&geometries=geojson';
    const response = await fetch(url, { signal: controller.signal });
    const json = (await response.json()) as OsrmResponse;
    if (json.code !== 'Ok' || !json.routes?.length) return [];

    const routes = json.routes.map((route) => ({
      distance: route.distance,
      duration: route.duration,
      coordinates: route.geometry.coordinates.map(([longitude, latitude]) => ({ latitude, longitude })),
    }));
    if(cache.size>500)cache.clear();
    cache.set(key, {routes,expires:Date.now()+60000});
    return routes;
  } catch {
    // Offline or OSRM down — the caller falls back to a straight line.
    return [];
  } finally {
    clearTimeout(timer);
  }
}

/** OSRM's driving profile returns the closest road point reachable by a car. */
async function snapToDrivableRoad(point: GeoPoint): Promise<GeoPoint> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(
      `${OSRM}/nearest/v1/driving/${point.longitude},${point.latitude}?number=1`,
      { signal: controller.signal },
    );
    const json = (await response.json()) as OsrmNearestResponse;
    const snapped = json.code === 'Ok' ? json.waypoints?.[0]?.location : undefined;
    return snapped ? { latitude: snapped[1], longitude: snapped[0] } : point;
  } catch {
    return point;
  } finally {
    clearTimeout(timer);
  }
}

function closuresNear(line: GeoPoint[], states: CheckpointState[]): RouteClosure[] {
  return states
    .filter((s) => s.status !== 'open' && distanceToPolyline(s.location, line) <= NEAR_METERS)
    .map((s) => ({
      checkpointId: s.id,
      nameAr: s.nameAr,
      nameEn: s.nameEn,
      status: s.status as RouteClosure['status'],
    }));
}

const penaltyOf = (closures: RouteClosure[]) =>
  closures.reduce((total, c) => total + PENALTY_SECONDS[c.status], 0);

const worstOf = (closures: RouteClosure[]) =>
  closures.find((c) => c.status === 'closed') ?? closures[0];

export const routingService = {
  async getRoute(from: GeoPoint, to: GeoPoint, options: RouteOptions = {}) {
    const destination = options.snapDestination ? await snapToDrivableRoad(to) : to;
    const [routes, currentStates] = await Promise.all([
      fetchRoutes(from, destination),
      // Fastest ranking ignores checkpoints, but Google attribution still needs live safety checks.
      options.mode === 'fastest'
        ? env.GOOGLE_ROUTES_API_KEY ? checkpoints().catch(() => undefined) : Promise.resolve([] as CheckpointState[])
        : checkpoints(),
    ]);
    const states = options.mode === 'fastest' ? [] : currentStates ?? [];

    if (!routes.length) {
      const line = [from, destination];
      const distance = distanceMeters(from, destination);
      const closures = closuresNear(line, states);
      return {
        coordinates: line,
        distanceMeters: Math.round(distance),
        durationSeconds: Math.round(distance / FALLBACK_SPEED),
        penaltySeconds: penaltyOf(closures),
        closuresOnRoute: closures,
        rejected: [],
        alternatives: [],
        source: 'straight-line',
        snappedDestination: destination,
      };
    }

    const scored = routes
      .map((route) => {
        const closures = closuresNear(route.coordinates, states);
        return { ...route, closures, penalty: penaltyOf(closures) };
      })
      .sort((a, b) =>
        options.mode === 'fastest'
          ? a.duration - b.duration
          : a.duration + a.penalty - (b.duration + b.penalty),
      );

    const best = scored[0]!;
    const alternatives = scored.slice(1, 1 + (options.maxAlternatives ?? scored.length));
    // Without current safety data, fastest routing still works but optional traffic is omitted.
    const candidateTraffic = currentStates ? await enrichTraffic(from, destination) : undefined;
    const selectedClosures = closuresNear(best.coordinates, currentStates ?? []);
    // Recheck even cached Google geometry: reports or the selected OSRM alternative may have changed.
    const addsClosure = candidateTraffic && closuresNear(candidateTraffic.routeCoordinates, currentStates ?? [])
      .some((closure) => !selectedClosures.some((selected) => selected.checkpointId === closure.checkpointId));
    const traffic = candidateTraffic && !addsClosure ? alignTrafficToRoute(candidateTraffic, best.coordinates) : undefined;
    return {
      coordinates: best.coordinates,
      distanceMeters: Math.round(best.distance),
      durationSeconds: Math.round(best.duration),
      ...(traffic ?? {}),
      penaltySeconds: best.penalty,
      closuresOnRoute: best.closures,
      rejected: alternatives.map((route) => ({
        coordinates: route.coordinates,
        blockedBy: worstOf(route.closures),
      })),
      alternatives: alternatives.map((route, index) => ({
        id: `alternative-${index + 1}`,
        coordinates: route.coordinates,
        distanceMeters: Math.round(route.distance),
        durationSeconds: Math.round(route.duration),
      })),
      source: 'osrm',
      snappedDestination: destination,
    };
  },
};

export interface ParkingScoreInput {
  driveSeconds?: number | null; walkMeters?: number | null; price?: number | null;
  provenance?: { confidence?: number | null; freshness?: string | null } | null;
  accessibility?: boolean | null; evCompatible?: boolean | null;
}
export interface ParkingScoreBreakdown { time: number; walking: number; price: number; confidence: number; accessibility: number; ev: number; total: number; reasons: string[] }
/** Deterministic, bounded ranking score. Missing metadata contributes zero and never throws. */
export function scoreParkingOption(input: ParkingScoreInput): ParkingScoreBreakdown {
  const n = (v: unknown) => typeof v === 'number' && Number.isFinite(v) ? Math.max(0, v) : undefined;
  const drive = n(input.driveSeconds), walk = n(input.walkMeters), price = n(input.price);
  const time = drive == null ? 0 : Math.max(0, 30 - drive / 120);
  const walking = walk == null ? 0 : Math.max(0, 20 - walk / 50);
  const priceScore = price == null ? 0 : Math.max(0, 20 - price / 25);
  const confidence = input.provenance?.confidence == null ? 0 : Math.round(Math.min(1, Math.max(0, input.provenance.confidence)) * 20);
  const accessibility = input.accessibility === true ? 5 : 0;
  const ev = input.evCompatible === true ? 5 : 0;
  const total = Math.round((time + walking + priceScore + confidence + accessibility + ev) * 100) / 100;
  const reasons: string[] = [];
  if (drive != null) reasons.push('drive-time'); if (walk != null) reasons.push('walking-distance'); if (price != null) reasons.push('price');
  if (input.provenance?.confidence != null) reasons.push('availability-confidence'); if (input.accessibility === true) reasons.push('accessible'); if (input.evCompatible === true) reasons.push('ev-compatible');
  return { time, walking, price: priceScore, confidence, accessibility, ev, total, reasons };
}
