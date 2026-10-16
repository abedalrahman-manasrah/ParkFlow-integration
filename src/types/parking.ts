import type { GeoPoint, ID, ISODateString } from './common';
import type { CrowdAvailability } from './road';

export type ParkingMode = 'start_stop' | 'prepaid';

/** Availability is deliberately coarse — we never claim exact free-space counts. */
export type AvailabilityLevel = 'available' | 'limited' | 'full' | 'unknown';

export type ParkingKind = 'street' | 'garage' | 'lot' | 'private';

export type ParkingOwnership = 'municipal' | 'public' | 'private' | 'public_transport';

/** How the driver identified the zone. Never assume GPS is the only entry path. */
export type ParkingEntryMethod = 'gps' | 'qr' | 'zone_code' | 'anpr' | 'manual';

export interface OperatingHours {
  /** 0 = Sunday. */
  weekday: number;
  opensAt: string;
  closesAt: string;
  closed?: boolean;
}

/**
 * The price rules in force for a zone. A snapshot of this is frozen onto every
 * session at start time so later tariff changes cannot re-price a live session.
 */
export interface Tariff {
  id: ID;
  name: string;
  /** Minor units per hour. */
  hourlyRate: number;
  currency: 'ILS';
  /** Billing granularity, minutes. Cost rounds up to this increment. */
  incrementMinutes: number;
  /** Free grace period before billing starts. */
  freeMinutes: number;
  minimumCharge: number;
  dailyCap?: number;
  maxStayMinutes?: number;
  validFrom: ISODateString;
  validTo?: ISODateString;
}

export interface ParkingZone {
  id: ID;
  /** Human-facing short code used for manual entry and signage: "RML-023". */
  code: string;
  name: string;
  nameAr: string;
  city: string;
  cityAr: string;
  kind: ParkingKind;
  location: GeoPoint;
  /** Which pricing model this zone runs. Never hard-code one globally. */
  supportedModes: ParkingMode[];
  defaultMode: ParkingMode;
  tariff: Tariff;
  operatingHours: OperatingHours[];
  availability: AvailabilityLevel;
  /** Present only when a trustworthy occupancy source exists. */
  capacity?: number;
  facilityId?: ID;
  operatorName?: string;
  /** Optional facility metadata used by collected off-street locations. */
  ownership?: ParkingOwnership;
  accessRestriction?: string;
  accessRestrictionAr?: string;
  /** False for facilities that are visible/routable but not open to normal public parking. */
  parkingAllowed?: boolean;
  /** Reserved spaces for drivers with a disability permit — 0 when none are marked. */
  accessibleSpots?: number;
  /** Marks temporary prototype metadata that must be verified before production use. */
  prototypeData?: boolean;
  supportedEntryMethods: ParkingEntryMethod[];
  updatedAt: ISODateString;
  /** Recent driver reports; when present, `availability` reflects them. */
  crowd?: CrowdAvailability;
}

/** A garage / structured facility. Zones may belong to one. */
export interface ParkingFacility {
  id: ID;
  name: string;
  nameAr: string;
  operatorName: string;
  location: GeoPoint;
  levels: number;
  /** ANPR gates let a session open/close without the driver tapping anything. */
  hasAnpr: boolean;
  hasBarrier: boolean;
  availability: AvailabilityLevel;
}

export interface ParkingSpot {
  id: ID;
  facilityId?: ID;
  zoneId: ID;
  label: string;
  level?: number;
  isAccessible?: boolean;
}

export type ParkingSessionStatus =
  | 'ACTIVE'
  | 'COMPLETED'
  | 'EXPIRED'
  | 'CANCELLED'
  | 'PAYMENT_PENDING'
  | 'PAYMENT_FAILED';

export type SessionPaymentStatus = 'unpaid' | 'authorized' | 'paid' | 'failed' | 'refunded';

/** Frozen copy of the rules applied when the session began. */
export interface RateSnapshot {
  tariffId: ID;
  hourlyRate: number;
  currency: 'ILS';
  incrementMinutes: number;
  freeMinutes: number;
  minimumCharge: number;
  dailyCap?: number;
  maxStayMinutes?: number;
  capturedAt: ISODateString;
  /** Loyalty discount (percent) already applied to the money fields above. */
  loyaltyDiscountPercent?: number;
}

export interface PricingRulesSnapshot {
  mode: ParkingMode;
  operatingHours: OperatingHours[];
  entryMethod: ParkingEntryMethod;
  zoneCode: string;
  zoneName: string;
  zoneNameAr: string;
  city: string;
}

/**
 * The core record. Elapsed time and cost are DERIVED from `startedAt` — the
 * client never counts seconds as the source of truth, it only renders them.
 */
export interface ParkingSession {
  id: ID;
  userId: ID;
  vehicleId: ID;
  parkingZoneId: ID;
  parkingFacilityId?: ID;
  parkingSpotId?: ID;
  parkingMode: ParkingMode;
  startedAt: ISODateString;
  /** Prepaid: the paid-through time. Start/stop: undefined until stopped. */
  endsAt?: ISODateString;
  stoppedAt?: ISODateString;
  rateSnapshot: RateSnapshot;
  pricingRulesSnapshot: PricingRulesSnapshot;
  /** Server-side accrual at last sync, minor units. */
  currentCost: number;
  finalCost?: number;
  paymentStatus: SessionPaymentStatus;
  paymentTransactionId?: ID;
  status: ParkingSessionStatus;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

/** Computed view model — never persisted. */
export interface SessionCostBreakdown {
  elapsedSeconds: number;
  billableMinutes: number;
  cost: number;
  isCapped: boolean;
  remainingSeconds?: number;
  isOverstay: boolean;
}
