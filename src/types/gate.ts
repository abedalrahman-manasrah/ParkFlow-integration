import type { ID, ISODateString } from './common';

/** The short-lived QR a driver shows at a QR gate. */
export interface GatePass {
  value: string;
  plateNumber: string;
  expiresAt: ISODateString;
}

export interface OverstayRules {
  overstayGraceMinutes: number;
  /** Minor units per charge. */
  overstayFee: number;
  overstayRepeatMinutes: number;
  overstayMaxPerStay: number;
}

export interface GateZone extends OverstayRules {
  id: ID;
  code: string;
  name: string;
  nameAr: string;
  city: string;
  cityAr: string;
  operator: { name: string; type: string };
}

export type VisitStatus = 'covered' | 'grace' | 'overstaying' | 'unregistered' | 'left';

/** One car's stay in a lot, as the gate operator sees it. */
export interface ParkingVisit {
  id: ID;
  plateNumber: string;
  registered: boolean;
  enteredAt: ISODateString;
  exitedAt?: ISODateString;
  entrySource: 'camera' | 'qr' | 'manual';
  status: VisitStatus;
  paidUntil?: ISODateString;
  graceEndsAt?: ISODateString;
  sessionId?: ID;
  violationCount: number;
  violationTotal: number;
}

export interface PatrolCheck {
  plateNumber: string;
  registered: boolean;
  allowed: boolean;
  reason: 'permit' | 'paid' | 'grace' | 'expired' | 'unpaid';
  graceEndsAt?: ISODateString;
  paidUntil?: ISODateString;
  insideSince?: ISODateString;
  /** Recorded by a gate, so overstay charges are issued automatically. */
  gateTracked: boolean;
  recentViolations: number;
  fee: number;
}

export interface GateScan { zoneId: ID; plate?: string; pass?: string }

export interface GateService {
  gatePass(vehicleId: ID): Promise<GatePass>;
  zones(): Promise<GateZone[]>;
  visits(zoneId: ID): Promise<ParkingVisit[]>;
  entry(scan: GateScan): Promise<ParkingVisit>;
  exit(scan: GateScan): Promise<ParkingVisit>;
  saveRules(zoneId: ID, rules: OverstayRules): Promise<OverstayRules>;
  patrolCheck(zoneId: ID, plate: string): Promise<PatrolCheck>;
  patrolIssue(zoneId: ID, plate: string): Promise<{ id: ID; amount: number; type: string }>;
}
