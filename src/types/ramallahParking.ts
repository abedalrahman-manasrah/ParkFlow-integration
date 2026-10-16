import type { GeoPoint } from './common';
import type {
  AvailabilityLevel,
  OperatingHours,
  ParkingEntryMethod,
  ParkingMode,
  ParkingOwnership,
} from './parking';

export type RamallahParkingOwnership = ParkingOwnership;

export type RamallahParkingPriceStatus =
  | 'demo_estimate'
  | 'map_listed_free_reconfirm'
  | 'published_2021_reconfirm_current';

export type RamallahParkingKind =
  | 'multi_storey_garage'
  | 'parking_lot'
  | 'parking_garage'
  | 'transport_terminal_parking'
  | 'public_parking_space';

export interface RamallahParkingPrice {
  currency: 'ILS';
  hourlyRateNis: number;
  billingUnitMinutes: number;
  status: RamallahParkingPriceStatus;
  note: string;
}

export interface RamallahParkingLocation {
  id: string;
  code: string;
  name: string;
  nameAr: string;
  nameStatus: string;
  ownership: RamallahParkingOwnership;
  kind: RamallahParkingKind;
  operatorName: string;
  operatorNameAr: string;
  address?: string;
  addressAr?: string;
  mapListingNameAr?: string;
  location: GeoPoint;
  capacity?: number;
  price: RamallahParkingPrice;
  maxStayMinutes: number | null;
  operatingHours: OperatingHours[];
  availability: AvailabilityLevel;
  supportedModes: ParkingMode[];
  defaultMode: ParkingMode;
  supportedEntryMethods: ParkingEntryMethod[];
  parkingAllowed: boolean;
  accessRestriction?: string;
  accessRestrictionAr?: string;
  locationSource: {
    provider: string;
    url: string;
  };
}

export interface RamallahParkingDataset {
  schemaVersion: number;
  generatedAt: string;
  city: {
    name: string;
    nameAr: string;
    country: string;
    currency: 'ILS';
  };
  usage: string;
  parkingLocations: RamallahParkingLocation[];
}
