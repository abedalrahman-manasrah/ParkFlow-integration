import type { RoadReportStatus } from '@prisma/client';

export interface ConfidenceResult {
  confidenceScore: number;
  status: RoadReportStatus;
}

const clamp = (value: number) => Math.max(0, Math.min(1, value));

/** Deterministic phase-one scoring. Creation is the report, not a confirmation. */
export function calculateConfidence(
  confirmationCount: number,
  rejectionCount: number,
  expired: boolean,
): ConfidenceResult {
  if (expired) return { confidenceScore: 0, status: 'expired' };
  const confidenceScore = clamp(0.35 + confirmationCount * 0.15 - rejectionCount * 0.2);
  if (rejectionCount >= 3 && rejectionCount >= confirmationCount + 2) {
    return { confidenceScore, status: 'resolved' };
  }
  if (rejectionCount >= 2 && rejectionCount > confirmationCount) {
    return { confidenceScore, status: 'disputed' };
  }
  if (confirmationCount >= 2 && confirmationCount > rejectionCount) {
    return { confidenceScore, status: 'confirmed' };
  }
  return { confidenceScore, status: 'unverified' };
}
