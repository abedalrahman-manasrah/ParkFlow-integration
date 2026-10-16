import type { GeoPoint } from '@/types';

const EARTH_RADIUS_M = 6_371_000;
const toRad = (deg: number) => (deg * Math.PI) / 180;

/** Haversine distance in metres. */
export function distanceMeters(a: GeoPoint, b: GeoPoint): number {
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters / 10) * 10} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

/**
 * Rough walking time. 1.35 m/s is the widely used average adult pace; this is
 * only ever shown as an approximation ("4 min walk"), never as a promise.
 */
export function walkingMinutes(meters: number): number {
  return Math.max(1, Math.round(meters / 1.35 / 60));
}

/**
 * Shortest distance from a point to a polyline, in metres. Flat-earth maths —
 * accurate at city scale, which is all it is used for (is a checkpoint on this
 * route?).
 */
export function distanceToPolyline(point: GeoPoint, line: GeoPoint[]): number {
  if (line.length === 1) return distanceMeters(point, line[0]!);
  const k = Math.cos(toRad(point.latitude));
  let best = Infinity;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1]!;
    const b = line[i]!;
    const ax = (a.longitude - point.longitude) * k;
    const ay = a.latitude - point.latitude;
    const dx = (b.longitude - point.longitude) * k - ax;
    const dy = b.latitude - point.latitude - ay;
    const lengthSq = dx * dx + dy * dy;
    const t = lengthSq ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / lengthSq)) : 0;
    const px = ax + t * dx;
    const py = ay + t * dy;
    best = Math.min(best, Math.sqrt(px * px + py * py) * 111_320);
  }
  return best;
}
