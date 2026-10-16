import type { GeoPoint, GeoRegion } from '@/types';

type CoordinateRecord = Record<string, unknown>;

const asRecord = (value: unknown): CoordinateRecord | undefined =>
  typeof value === 'object' && value !== null ? (value as CoordinateRecord) : undefined;

const asFiniteNumber = (value: unknown): number | undefined => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value !== 'string' || value.trim() === '') return undefined;
  const converted = Number(value);
  return Number.isFinite(converted) ? converted : undefined;
};

export function isValidGeoPoint(value: unknown): value is GeoPoint {
  const point = asRecord(value);
  if (!point) return false;
  const { latitude, longitude } = point;
  return (
    typeof latitude === 'number' &&
    Number.isFinite(latitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    typeof longitude === 'number' &&
    Number.isFinite(longitude) &&
    longitude >= -180 &&
    longitude <= 180
  );
}

/** Normalizes supported API coordinate shapes into the client GeoPoint contract. */
export function normalizeGeoPoint(value: unknown): GeoPoint | undefined {
  const record = asRecord(value);
  if (!record) return undefined;
  const nested = asRecord(record.location);
  for (const source of nested ? [nested, record] : [record]) {
    const latitude = asFiniteNumber(source.latitude ?? source.lat);
    const longitude = asFiniteNumber(source.longitude ?? source.lng ?? source.lon);
    const point = { latitude, longitude };
    if (isValidGeoPoint(point)) return point;
  }
  return undefined;
}

export function normalizeGeoPoints(values: unknown): GeoPoint[] {
  if (!Array.isArray(values)) return [];
  const points: GeoPoint[] = [];
  for (const value of values) {
    const point = normalizeGeoPoint(value);
    if (point) points.push(point);
  }
  return points;
}

export function isValidGeoRegion(value: unknown): value is GeoRegion {
  if (!isValidGeoPoint(value)) return false;
  const region = value as unknown as CoordinateRecord;
  return (
    typeof region.latitudeDelta === 'number' &&
    Number.isFinite(region.latitudeDelta) &&
    region.latitudeDelta > 0 &&
    typeof region.longitudeDelta === 'number' &&
    Number.isFinite(region.longitudeDelta) &&
    region.longitudeDelta > 0
  );
}
