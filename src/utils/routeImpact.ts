import type {
  GeoPoint,
  RoadReport,
  RoadReportDirection,
  RoadReportSeverity,
  RoadReportType,
  RouteAlternative,
  RouteResult,
} from '@/types';
import { distanceMeters } from './geo';

export interface RouteImpactConfig {
  corridorMeters: number;
  directionToleranceDegrees: number;
  behindToleranceMeters: number;
  progressSnapMeters: number;
  maxNormalTimeRatio: number;
  maxClosedRoadTimeRatio: number;
  minimumRiskReduction: number;
  minimumRiskReductionRatio: number;
}

export const DEFAULT_ROUTE_IMPACT_CONFIG: RouteImpactConfig = {
  corridorMeters: 35,
  directionToleranceDegrees: 70,
  behindToleranceMeters: 25,
  progressSnapMeters: 70,
  maxNormalTimeRatio: 1.3,
  maxClosedRoadTimeRatio: 1.75,
  minimumRiskReduction: 5,
  minimumRiskReductionRatio: 0.2,
};

export interface RouteImpact {
  report: RoadReport;
  distanceToRouteMeters: number;
  distanceAlongRouteMeters: number;
  distanceAheadMeters?: number;
  segmentHeadingDegrees: number;
  priority: number;
  riskPoints: number;
}

interface NearestRoutePoint {
  distanceMeters: number;
  distanceAlongMeters: number;
  segmentHeadingDegrees: number;
}

export interface RouteCandidate {
  id: string;
  coordinates: GeoPoint[];
  distanceMeters: number;
  durationSeconds: number;
}

export interface ScoredRouteCandidate extends RouteCandidate {
  impacts: RouteImpact[];
  riskPoints: number;
  score: number;
}

export interface RouteAlternativeAssessment {
  current: ScoredRouteCandidate;
  alternatives: ScoredRouteCandidate[];
  recommended?: ScoredRouteCandidate;
}

const ACTIVE_STATUSES = new Set(['unverified', 'confirmed', 'disputed']);
const TYPE_PRIORITY: Record<RoadReportType, number> = {
  closed_road: 1,
  accident: 2,
  road_hazard: 3,
  traffic_congestion: 4,
  checkpoint: 5,
  construction: 6,
  police: 7,
  other: 8,
};
const TYPE_RISK: Record<RoadReportType, number> = {
  closed_road: 100,
  accident: 70,
  road_hazard: 60,
  traffic_congestion: 40,
  checkpoint: 30,
  construction: 25,
  police: 12,
  other: 8,
};
const SEVERITY_WEIGHT: Record<RoadReportSeverity, number> = {
  low: 0.75,
  moderate: 1,
  high: 1.35,
  critical: 1.65,
};
const SEVERITY_RANK: Record<RoadReportSeverity, number> = { low: 1, moderate: 2, high: 3, critical: 4 };

const headingDifference = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);
const directionHeading = (direction: RoadReportDirection): number | undefined => {
  switch (direction) {
    case 'northbound': return 0;
    case 'eastbound': return 90;
    case 'southbound': return 180;
    case 'westbound': return 270;
    case 'both': return undefined;
  }
};

function closestPointOnRoute(point: GeoPoint, coordinates: GeoPoint[]): NearestRoutePoint | undefined {
  if (coordinates.length < 2) return undefined;
  const latitudeScale = 110_540;
  const longitudeScale = 111_320 * Math.max(0.01, Math.cos(point.latitude * Math.PI / 180));
  let cumulative = 0;
  let nearest: NearestRoutePoint | undefined;
  for (let index = 1; index < coordinates.length; index += 1) {
    const start = coordinates[index - 1]!;
    const end = coordinates[index]!;
    const ax = (start.longitude - point.longitude) * longitudeScale;
    const ay = (start.latitude - point.latitude) * latitudeScale;
    const bx = (end.longitude - point.longitude) * longitudeScale;
    const by = (end.latitude - point.latitude) * latitudeScale;
    const dx = bx - ax;
    const dy = by - ay;
    const lengthSquared = dx * dx + dy * dy;
    const fraction = lengthSquared ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / lengthSquared)) : 0;
    const px = ax + fraction * dx;
    const py = ay + fraction * dy;
    const distance = Math.sqrt(px * px + py * py);
    const segmentLength = distanceMeters(start, end);
    const heading = (Math.atan2(dx, dy) * 180 / Math.PI + 360) % 360;
    if (!nearest || distance < nearest.distanceMeters) {
      nearest = {
        distanceMeters: distance,
        distanceAlongMeters: cumulative + fraction * segmentLength,
        segmentHeadingDegrees: heading,
      };
    }
    cumulative += segmentLength;
  }
  return nearest;
}

function directionMatches(direction: RoadReportDirection | undefined, segmentHeading: number, tolerance: number): boolean {
  if (!direction || direction === 'both') return true;
  const expected = directionHeading(direction);
  return expected === undefined || headingDifference(expected, segmentHeading) <= tolerance;
}

function priorityOf(report: RoadReport): number {
  return TYPE_PRIORITY[report.type];
}

export function reportRiskPoints(report: RoadReport): number {
  const severity = report.severity ? SEVERITY_WEIGHT[report.severity] : 1;
  const statusWeight = report.status === 'confirmed' ? 1 : report.status === 'disputed' ? 0.45 : 0.65;
  const confidenceWeight = 0.5 + Math.max(0, Math.min(1, report.confidenceScore)) * 0.5;
  return TYPE_RISK[report.type] * severity * statusWeight * confidenceWeight;
}

export function reportsAffectingRoute(
  coordinates: GeoPoint[],
  reports: RoadReport[],
  routeStart?: GeoPoint,
  config: RouteImpactConfig = DEFAULT_ROUTE_IMPACT_CONFIG,
  now = Date.now(),
): RouteImpact[] {
  if (coordinates.length < 2) return [];
  const progress = routeStart ? closestPointOnRoute(routeStart, coordinates) : undefined;
  const reliableProgress = progress && progress.distanceMeters <= config.progressSnapMeters ? progress.distanceAlongMeters : undefined;
  return reports.flatMap((report): RouteImpact[] => {
    if (!ACTIVE_STATUSES.has(report.status) || Date.parse(report.expiresAt) <= now) return [];
    const nearest = closestPointOnRoute(report, coordinates);
    if (!nearest || nearest.distanceMeters > config.corridorMeters) return [];
    if (!directionMatches(report.direction, nearest.segmentHeadingDegrees, config.directionToleranceDegrees)) return [];
    const distanceAhead = reliableProgress === undefined ? undefined : nearest.distanceAlongMeters - reliableProgress;
    if (distanceAhead !== undefined && distanceAhead < -config.behindToleranceMeters) return [];
    return [{
      report,
      distanceToRouteMeters: nearest.distanceMeters,
      distanceAlongRouteMeters: nearest.distanceAlongMeters,
      distanceAheadMeters: distanceAhead === undefined ? undefined : Math.max(0, distanceAhead),
      segmentHeadingDegrees: nearest.segmentHeadingDegrees,
      priority: priorityOf(report),
      riskPoints: reportRiskPoints(report),
    }];
  }).sort((a, b) =>
    a.priority - b.priority
    || (a.distanceAheadMeters ?? a.distanceAlongRouteMeters) - (b.distanceAheadMeters ?? b.distanceAlongRouteMeters)
    || (SEVERITY_RANK[b.report.severity ?? 'moderate'] - SEVERITY_RANK[a.report.severity ?? 'moderate'])
    || b.report.confidenceScore - a.report.confidenceScore
    || Date.parse(b.report.createdAt) - Date.parse(a.report.createdAt),
  );
}

/** Score = duration seconds + risk points × 60 + 60 seconds per report + distance metres ÷ 100. */
export function scoreRoute(candidate: RouteCandidate, reports: RoadReport[], routeStart?: GeoPoint, config = DEFAULT_ROUTE_IMPACT_CONFIG): ScoredRouteCandidate {
  const impacts = reportsAffectingRoute(candidate.coordinates, reports, routeStart, config);
  const riskPoints = impacts.reduce((sum, impact) => sum + impact.riskPoints, 0);
  return {
    ...candidate,
    impacts,
    riskPoints,
    score: candidate.durationSeconds + riskPoints * 60 + impacts.length * 60 + candidate.distanceMeters / 100,
  };
}

export function assessRouteAlternatives(
  route: RouteResult,
  reports: RoadReport[],
  routeStart?: GeoPoint,
  config = DEFAULT_ROUTE_IMPACT_CONFIG,
): RouteAlternativeAssessment {
  const current = scoreRoute({ id: 'current', coordinates: route.coordinates, distanceMeters: route.distanceMeters, durationSeconds: route.durationSeconds }, reports, routeStart, config);
  const alternatives = route.alternatives.map((alternative: RouteAlternative) => scoreRoute(alternative, reports, routeStart, config));
  const hasConfirmedClosure = current.impacts.some(({ report }) => report.type === 'closed_road' && report.status === 'confirmed');
  const maximumTimeRatio = hasConfirmedClosure ? config.maxClosedRoadTimeRatio : config.maxNormalTimeRatio;
  const requiredReduction = Math.max(config.minimumRiskReduction, current.riskPoints * config.minimumRiskReductionRatio);
  const recommended = alternatives
    .filter((alternative) => alternative.riskPoints < current.riskPoints)
    .filter((alternative) => current.riskPoints - alternative.riskPoints >= requiredReduction)
    .filter((alternative) => alternative.durationSeconds <= current.durationSeconds * maximumTimeRatio)
    .sort((a, b) => a.score - b.score)[0];
  return { current, alternatives, recommended };
}
