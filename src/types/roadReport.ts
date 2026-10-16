import type { AppNotification } from './notification';
import type { GeoPoint, ID, ISODateString } from './common';

export const ROAD_REPORT_TYPES = [
  'accident',
  'traffic_congestion',
  'closed_road',
  'checkpoint',
  'road_hazard',
  'construction',
  'police',
  'other',
] as const;

export type RoadReportType = typeof ROAD_REPORT_TYPES[number];
export type RoadReportDirection = 'northbound' | 'southbound' | 'eastbound' | 'westbound' | 'both';
export type RoadReportSeverity = 'low' | 'moderate' | 'high' | 'critical';
export type RoadReportStatus = 'unverified' | 'confirmed' | 'disputed' | 'resolved' | 'expired';
export type RoadReportViewerVote = 'still_there' | 'not_there';

export interface RoadReport {
  id: ID;
  type: RoadReportType;
  latitude: number;
  longitude: number;
  direction?: RoadReportDirection;
  severity?: RoadReportSeverity;
  description?: string;
  status: RoadReportStatus;
  confidenceScore: number;
  confirmationCount: number;
  rejectionCount: number;
  isDemo: boolean;
  createdAt: ISODateString;
  updatedAt: ISODateString;
  expiresAt: ISODateString;
  isOwnReport: boolean;
  viewerVote: RoadReportViewerVote | null;
  canVote: boolean;
}

export interface RoadReportBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

export interface CreateRoadReportInput extends GeoPoint {
  type: RoadReportType;
  direction?: RoadReportDirection;
  severity?: RoadReportSeverity;
  description?: string;
}

export interface CreateRoadReportResult {
  created: boolean;
  duplicate: boolean;
  confirmationAdded: boolean;
  /** Pending points for a brand-new report; null for duplicates or past the daily cap. */
  points?: {
    id: string;
    points: number;
    state: 'pending';
    rewardMinor: number;
    /** The "you earned points" notification, shown on screen straight away. */
    notification?: AppNotification | null;
  } | null;
  report: RoadReport;
}
