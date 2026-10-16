import type { Currency, GeoPoint, ID, ISODateString } from './common';

export type ParkingReservationStatus =
  | 'confirmed'
  | 'cancelled'
  | 'expired'
  | 'checked_in'
  | 'completed';

export interface ReservationParkingZone {
  id: ID;
  code: string;
  name: string;
  nameAr: string;
  location: GeoPoint;
}

export interface ParkingReservation {
  id: ID;
  parkingZoneId: ID;
  userId: ID;
  spotId?: ID;
  spotCode?: string;
  startTime: ISODateString;
  endTime: ISODateString;
  durationMinutes: number;
  hourlyRateSnapshot: number;
  estimatedTotalPriceSnapshot: number;
  currency: Currency;
  priceIsDemo: boolean;
  isDemoReservation: true;
  status: ParkingReservationStatus;
  publicCode: string;
  qrValue: string;
  zone: ReservationParkingZone;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export interface CreateParkingReservationInput {
  zoneId: ID;
  spotId: ID;
  startTime: ISODateString;
  durationMinutes: number;
}

export interface QrValidationResult {
  valid: boolean;
  reason?: ParkingReservationStatus | 'not_found';
  reservation?: ParkingReservation;
}
