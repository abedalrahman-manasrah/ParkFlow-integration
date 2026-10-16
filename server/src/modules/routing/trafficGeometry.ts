import { distanceMeters, type GeoPoint } from '../../utils/geo';
import type { TrafficEnrichment, TrafficSegment } from './traffic';

const ROUTE_TOLERANCE_METERS = 50;
const SAMPLE_SPACING_METERS = 25;
// Optional enrichment is declined above two million segment checks per request.
const MAX_PROJECTION_SEGMENT_CHECKS = 2_000_000;

interface IndexedLine {
  coordinates: GeoPoint[];
  progress: number[];
  length: number;
}

interface Projection {
  point: GeoPoint;
  progress: number;
  distance: number;
}

function indexLine(coordinates: GeoPoint[]): IndexedLine | undefined {
  if (coordinates.length < 2 || coordinates.some((point) =>
    !Number.isFinite(point.latitude) || !Number.isFinite(point.longitude) ||
    Math.abs(point.latitude) > 90 || Math.abs(point.longitude) > 180,
  )) return undefined;
  const progress = [0];
  for (let index = 1; index < coordinates.length; index++) {
    progress.push(progress[index - 1]! + distanceMeters(coordinates[index - 1]!, coordinates[index]!));
  }
  const length = progress[progress.length - 1]!;
  return length > 0 && Number.isFinite(length) ? { coordinates, progress, length } : undefined;
}

function interpolate(from: GeoPoint, to: GeoPoint, fraction: number): GeoPoint {
  if (fraction === 0) return from;
  if (fraction === 1) return to;
  return {
    latitude: from.latitude + (to.latitude - from.latitude) * fraction,
    longitude: from.longitude + (to.longitude - from.longitude) * fraction,
  };
}

function project(point: GeoPoint, line: IndexedLine): Projection {
  let best: Projection = { point: line.coordinates[0]!, progress: 0, distance: Infinity };
  const longitudeScale = Math.cos(point.latitude * Math.PI / 180);
  for (let index = 1; index < line.coordinates.length; index++) {
    const from = line.coordinates[index - 1]!;
    const to = line.coordinates[index]!;
    const x = (from.longitude - point.longitude) * longitudeScale;
    const y = from.latitude - point.latitude;
    const dx = (to.longitude - from.longitude) * longitudeScale;
    const dy = to.latitude - from.latitude;
    const squaredLength = dx * dx + dy * dy;
    const fraction = squaredLength ? Math.max(0, Math.min(1, -(x * dx + y * dy) / squaredLength)) : 0;
    const projectedPoint = interpolate(from, to, fraction);
    const distance = distanceMeters(point, projectedPoint);
    if (distance < best.distance) {
      best = {
        point: projectedPoint,
        progress: line.progress[index - 1]! + (line.progress[index]! - line.progress[index - 1]!) * fraction,
        distance,
      };
    }
  }
  return best;
}

/** Count the exact nearest-segment loops plus interval scans in O(N + M). */
function projectionWork(approved: IndexedLine, google: IndexedLine, intervalCount: number): number {
  const samples = (line: IndexedLine) => {
    let count = 1;
    for (let index = 1; index < line.progress.length; index++) {
      count += Math.max(1, Math.ceil((line.progress[index]! - line.progress[index - 1]!) / SAMPLE_SPACING_METERS));
    }
    return count;
  };
  const approvedSegments = approved.coordinates.length - 1;
  const googleSegments = google.coordinates.length - 1;
  return samples(google) * approvedSegments + samples(approved) * googleSegments +
    Math.max(0, intervalCount - 1) * approvedSegments + intervalCount * approved.coordinates.length;
}

/** Check segment interiors as well as vertices, and reject detours that double back. */
function follows(source: IndexedLine, reference: IndexedLine): boolean {
  let furthestProgress = 0;
  for (let index = 1; index < source.coordinates.length; index++) {
    const steps = Math.max(1, Math.ceil((source.progress[index]! - source.progress[index - 1]!) / SAMPLE_SPACING_METERS));
    for (let step = index === 1 ? 0 : 1; step <= steps; step++) {
      const point = interpolate(source.coordinates[index - 1]!, source.coordinates[index]!, step / steps);
      const nearest = project(point, reference);
      if (nearest.distance > ROUTE_TOLERANCE_METERS || nearest.progress + 0.01 < furthestProgress) return false;
      furthestProgress = Math.max(furthestProgress, nearest.progress);
    }
  }
  return true;
}

/**
 * Google supplies traffic for its own route. Only a matching, forward-moving
 * route may color the approved path, and every emitted point stays on OSRM.
 */
export function alignTrafficToRoute(
  traffic: TrafficEnrichment,
  approvedCoordinates: GeoPoint[],
): Pick<TrafficEnrichment, 'trafficSegments' | 'trafficSummary'> | undefined {
  const approved = indexLine(approvedCoordinates);
  const google = indexLine(traffic.routeCoordinates);
  if (!approved || !google ||
    projectionWork(approved, google, traffic.trafficSegments.length) > MAX_PROJECTION_SEGMENT_CHECKS ||
    distanceMeters(approved.coordinates[0]!, google.coordinates[0]!) > ROUTE_TOLERANCE_METERS ||
    distanceMeters(approved.coordinates.at(-1)!, google.coordinates.at(-1)!) > ROUTE_TOLERANCE_METERS ||
    !follows(google, approved) || !follows(approved, google)
  ) return undefined;

  let start: Projection = { point: approved.coordinates[0]!, progress: 0, distance: 0 };
  const trafficSegments: TrafficSegment[] = [];
  for (let index = 0; index < traffic.trafficSegments.length; index++) {
    const segment = traffic.trafficSegments[index]!;
    const end = index === traffic.trafficSegments.length - 1
      ? { point: approved.coordinates.at(-1)!, progress: approved.length, distance: 0 }
      : project(segment.coordinates.at(-1)!, approved);
    if (end.progress < start.progress) return undefined;
    if (end.progress > start.progress) {
      trafficSegments.push({
        state: segment.state,
        coordinates: [
          start.point,
          ...approved.coordinates.filter((_point, pointIndex) =>
            approved.progress[pointIndex]! > start.progress && approved.progress[pointIndex]! < end.progress,
          ),
          end.point,
        ],
      });
    }
    start = end;
  }
  return { trafficSegments, trafficSummary: traffic.trafficSummary };
}
