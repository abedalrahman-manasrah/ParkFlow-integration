import type { GeoPoint, ID, ISODateString } from './common';

export type ViolationType =
  | 'no_active_parking'
  | 'expired_parking'
  | 'wrong_zone'
  | 'no_permit'
  | 'obstruction'
  | 'disabled_bay';

export type ViolationStatus = 'unpaid' | 'paid' | 'appealed' | 'cancelled' | 'overdue';

export type DetectionSource = 'anpr_vehicle' | 'fixed_camera' | 'inspector' | 'sensor';

export interface ViolationEvidence {
  id: ID;
  violationId: ID;
  /** Wide shot of the vehicle in place. */
  vehiclePhotoUrl: string;
  plateCropUrl?: string;
  additionalPhotoUrls: string[];
  detectedPlate: string;
  detectionSource: DetectionSource;
  /** ANPR normally requires two passes before issuing. */
  firstDetectionAt: ISODateString;
  secondDetectionAt?: ISODateString;
  location: GeoPoint;
  deviceId?: string;
  officerId?: string;
}

/**
 * A violation is raised against a PLATE + place + time. It is surfaced to a user
 * because they have a link to that vehicle, not because they "own" the fine.
 */
export interface Violation {
  id: ID;
  /** Official notice number shown on paperwork. */
  reference: string;
  vehicleId: ID;
  plateNumber: string;
  /** Null when the plate is not linked to any account yet. */
  issuedToUserId?: ID;
  type: ViolationType;
  status: ViolationStatus;
  amount: number;
  currency: 'ILS';
  parkingZoneId?: ID;
  zoneCode?: string;
  locationName: string;
  locationNameAr: string;
  location: GeoPoint;
  issuedAt: ISODateString;
  dueAt: ISODateString;
  reason: string;
  reasonAr: string;
  issuingAuthority: string;
  issuingAuthorityAr: string;
  evidenceId?: ID;
  paidAt?: ISODateString;
  paymentTransactionId?: ID;
  appealId?: ID;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export type AppealReason =
  | 'paid_not_recognized'
  | 'wrong_vehicle'
  | 'wrong_location'
  | 'special_permit'
  | 'technical_issue'
  | 'other';

export type AppealStatus = 'submitted' | 'under_review' | 'approved' | 'rejected' | 'more_info';

export interface AppealAttachment {
  id: ID;
  name: string;
  uri: string;
  mimeType: string;
  sizeBytes: number;
}

export interface Appeal {
  id: ID;
  reference: string;
  violationId: ID;
  userId: ID;
  reason: AppealReason;
  notes: string;
  attachments: AppealAttachment[];
  status: AppealStatus;
  decisionNote?: string;
  submittedAt: ISODateString;
  updatedAt: ISODateString;
}

export type PermitType = 'resident' | 'disabled' | 'business' | 'staff';

export interface Permit {
  id: ID;
  vehicleId: ID;
  userId: ID;
  type: PermitType;
  reference: string;
  zoneIds: ID[];
  validFrom: ISODateString;
  validTo: ISODateString;
  status: 'active' | 'expired' | 'revoked' | 'pending';
}
