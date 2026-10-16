import type {
  RoadDirection,
  RoadReportSeverity,
  RoadReportType,
  RoadReportVoteType,
} from '@prisma/client';
import { atomic, db, lock, type Tx } from '../../database/client';
import { assert, requireValue } from '../../utils/errors';
import { calculateConfidence } from './confidence';
import { distanceMeters } from '../../utils/geo';
import { awardIncidentReport, settlePoints } from '../trust/rewards';

const DEFAULT_EXPIRATION_MINUTES: Record<RoadReportType, number> = {
  traffic_congestion: 30,
  accident: 90,
  checkpoint: 60,
  road_hazard: 240,
  construction: 1440,
  closed_road: 360,
  police: 45,
  other: 60,
};

interface DuplicateRule { distanceMeters: number; windowMinutes: number }
const DEFAULT_DUPLICATE_RULES: Record<RoadReportType, DuplicateRule> = {
  traffic_congestion: { distanceMeters: 150, windowMinutes: 30 },
  checkpoint: { distanceMeters: 120, windowMinutes: 60 },
  police: { distanceMeters: 120, windowMinutes: 45 },
  accident: { distanceMeters: 100, windowMinutes: 90 },
  closed_road: { distanceMeters: 100, windowMinutes: 360 },
  road_hazard: { distanceMeters: 75, windowMinutes: 240 },
  construction: { distanceMeters: 100, windowMinutes: 1440 },
  other: { distanceMeters: 75, windowMinutes: 60 },
};

function configuredPositiveInt(name: string, fallback: number, maximum: number): number {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value > 0 && value <= maximum ? value : fallback;
}

export function duplicateRule(type: RoadReportType): DuplicateRule {
  const defaults = DEFAULT_DUPLICATE_RULES[type];
  const prefix = `ROAD_REPORT_DUPLICATE_${type.toUpperCase()}`;
  return {
    distanceMeters: configuredPositiveInt(`${prefix}_METERS`, defaults.distanceMeters, 5000),
    windowMinutes: configuredPositiveInt(`${prefix}_MINUTES`, defaults.windowMinutes, 10080),
  };
}

function directionsCompatible(a?: RoadDirection | null, b?: RoadDirection | null): boolean {
  if (!a || !b || a === 'both' || b === 'both') return true;
  const opposite = (a === 'northbound' && b === 'southbound')
    || (a === 'southbound' && b === 'northbound')
    || (a === 'eastbound' && b === 'westbound')
    || (a === 'westbound' && b === 'eastbound');
  return !opposite;
}

const envKey = (type: RoadReportType) => `ROAD_REPORT_EXPIRY_${type.toUpperCase()}_MINUTES`;
export function expirationMinutes(type: RoadReportType): number {
  const configured = Number(process.env[envKey(type)]);
  return Number.isInteger(configured) && configured > 0 && configured <= 10080
    ? configured
    : DEFAULT_EXPIRATION_MINUTES[type];
}

export interface CreateRoadReportInput {
  type: RoadReportType;
  latitude: number;
  longitude: number;
  direction?: RoadDirection;
  severity?: RoadReportSeverity;
  description?: string;
}

export interface RoadReportBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

const activeStatuses = ['unverified', 'confirmed', 'disputed'] as const;

async function expireOldReports(tx: Tx | typeof db, now = new Date()) {
  await tx.roadReport.updateMany({
    where: { status: { in: [...activeStatuses] }, expiresAt: { lte: now } },
    data: { status: 'expired', confidenceScore: 0 },
  });
}

function toDto<T extends {
  reporterUserId: string;
  status: string;
  expiresAt: Date;
  votes?: { vote: RoadReportVoteType }[];
}>(report: T, viewerUserId: string) {
  const { votes, reporterUserId, ...safe } = report;
  const viewerVote = votes?.[0]?.vote ?? null;
  const isOwnReport = reporterUserId === viewerUserId;
  const isActive = activeStatuses.includes(report.status as typeof activeStatuses[number]) && report.expiresAt.getTime() > Date.now();
  return { ...safe, isOwnReport, viewerVote, canVote: isActive && !isOwnReport && viewerVote === null };
}

/**
 * Other drivers' votes settle the reporter's points early: a confirmed report pays
 * out right away, a disputed or resolved one is revoked. Anything still unverified
 * waits for the maintenance job's time window.
 */
async function settleReporterPoints(tx: Tx, report: { id: string; status: string }) {
  const verified = report.status === 'confirmed';
  if (!verified && report.status !== 'disputed' && report.status !== 'resolved') return;
  const pending = await tx.pointsEntry.findMany({ where: { incidentReportId: report.id, state: 'pending' } });
  for (const entry of pending) await settlePoints(tx, entry, verified);
}

export async function create(userId: string, input: CreateRoadReportInput) {
  return atomic(async (tx) => {
    await lock(tx, `road-report-create:${userId}`);
    // Serializing creation per type closes the race between duplicate lookup and insert.
    await lock(tx, `road-report-duplicate:${input.type}`);
    const now = new Date();
    const rule = duplicateRule(input.type);
    const latitudeDelta = rule.distanceMeters / 111_320;
    const longitudeDelta = rule.distanceMeters / (111_320 * Math.max(0.01, Math.cos(input.latitude * Math.PI / 180)));
    const candidates = await tx.roadReport.findMany({
      where: {
        type: input.type,
        isDemo: false,
        status: { in: [...activeStatuses] },
        expiresAt: { gt: now },
        createdAt: { gte: new Date(now.getTime() - rule.windowMinutes * 60_000) },
        latitude: { gte: input.latitude - latitudeDelta, lte: input.latitude + latitudeDelta },
        longitude: { gte: input.longitude - longitudeDelta, lte: input.longitude + longitudeDelta },
      },
      orderBy: { createdAt: 'desc' },
    });
    const duplicate = candidates
      .filter((candidate) => directionsCompatible(input.direction, candidate.direction))
      .map((candidate) => ({ candidate, distance: distanceMeters(input, candidate) }))
      .filter(({ distance }) => distance <= rule.distanceMeters)
      .sort((a, b) => a.distance - b.distance || b.candidate.createdAt.getTime() - a.candidate.createdAt.getTime())[0]?.candidate;
    if (duplicate) {
      await lock(tx, `road-report-vote:${duplicate.id}:${userId}`);
      let report = duplicate;
      let confirmationAdded = false;
      let viewerVote = await tx.roadReportVote.findUnique({
        where: { roadReportId_userId: { roadReportId: duplicate.id, userId } },
        select: { vote: true },
      });
      if (duplicate.reporterUserId !== userId && !viewerVote) {
        await lock(tx, `road-report-vote-rate:${userId}`);
        const recentVotes = await tx.roadReportVote.count({
          where: { userId, createdAt: { gt: new Date(now.getTime() - 10 * 60_000) } },
        });
        assert(recentVotes < 30, 'VOTE_RATE_LIMITED', 'Too many votes. Try again later.', 429);
        viewerVote = await tx.roadReportVote.create({
          data: { roadReportId: duplicate.id, userId, vote: 'still_there' },
          select: { vote: true },
        });
        const confirmationCount = duplicate.confirmationCount + 1;
        report = await tx.roadReport.update({
          where: { id: duplicate.id },
          data: {
            confirmationCount,
            ...calculateConfidence(confirmationCount, duplicate.rejectionCount, false),
          },
        });
        confirmationAdded = true;
      }
      if (confirmationAdded) await settleReporterPoints(tx, report);
      return {
        created: false,
        duplicate: true,
        confirmationAdded,
        points: null,
        report: toDto({ ...report, votes: viewerVote ? [viewerVote] : [] }, userId),
      };
    }
    const recentCount = await tx.roadReport.count({
      where: { reporterUserId: userId, createdAt: { gt: new Date(now.getTime() - 10 * 60_000) } },
    });
    assert(recentCount < 5, 'REPORT_RATE_LIMITED', 'Too many reports. Try again later.', 429);
    const expiresAt = new Date(now.getTime() + expirationMinutes(input.type) * 60_000);
    const report = await tx.roadReport.create({
      data: {
        reporterUserId: userId,
        ...input,
        description: input.description?.trim() || null,
        expiresAt,
      },
    });
    const points = await awardIncidentReport(tx, userId, report.id);
    return {
      created: true,
      duplicate: false,
      confirmationAdded: false,
      points,
      report: toDto(report, userId),
    };
  });
}

export async function active(userId: string, bounds: RoadReportBounds) {
  assert(bounds.north > bounds.south, 'VALIDATION', 'North must be greater than south');
  assert(bounds.east > bounds.west, 'VALIDATION', 'East must be greater than west');
  await expireOldReports(db);
  const reports = await db.roadReport.findMany({
    where: {
      status: { in: [...activeStatuses] },
      expiresAt: { gt: new Date() },
      latitude: { gte: bounds.south, lte: bounds.north },
      longitude: { gte: bounds.west, lte: bounds.east },
    },
    include: { votes: { where: { userId }, select: { vote: true } } },
    orderBy: { createdAt: 'desc' },
    take: 500,
  });
  return reports.map((report) => toDto(report, userId));
}

export async function get(userId: string, id: string) {
  await expireOldReports(db);
  const report = requireValue(await db.roadReport.findUnique({
    where: { id },
    include: { votes: { where: { userId }, select: { vote: true } } },
  }));
  return toDto(report, userId);
}

export async function vote(userId: string, id: string, voteType: RoadReportVoteType) {
  return atomic(async (tx) => {
    await lock(tx, `road-report-vote:${id}:${userId}`);
    await lock(tx, `road-report-vote-rate:${userId}`);
    await expireOldReports(tx);
    const report = requireValue(await tx.roadReport.findUnique({ where: { id } }));
    assert(report.status !== 'expired' && report.expiresAt.getTime() > Date.now(), 'REPORT_EXPIRED', 'This report has expired', 409);
    assert(activeStatuses.includes(report.status as typeof activeStatuses[number]), 'REPORT_INACTIVE', 'This report is no longer active', 409);
    assert(report.reporterUserId !== userId, 'SELF_VOTE_NOT_ALLOWED', 'You cannot vote on your own report', 409);
    assert(!await tx.roadReportVote.findUnique({ where: { roadReportId_userId: { roadReportId: id, userId } } }), 'ALREADY_VOTED', 'You already voted on this report', 409);
    const recentVotes = await tx.roadReportVote.count({
      where: { userId, createdAt: { gt: new Date(Date.now() - 10 * 60_000) } },
    });
    assert(recentVotes < 30, 'VOTE_RATE_LIMITED', 'Too many votes. Try again later.', 429);
    await tx.roadReportVote.create({ data: { roadReportId: id, userId, vote: voteType } });
    const confirmationCount = report.confirmationCount + (voteType === 'still_there' ? 1 : 0);
    const rejectionCount = report.rejectionCount + (voteType === 'not_there' ? 1 : 0);
    const confidence = calculateConfidence(confirmationCount, rejectionCount, false);
    const updated = await tx.roadReport.update({
      where: { id },
      data: { confirmationCount, rejectionCount, ...confidence },
    });
    await settleReporterPoints(tx, updated);
    return toDto({ ...updated, votes: [{ vote: voteType }] }, userId);
  });
}
