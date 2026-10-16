import type { ID, ISODateString } from './common';

export type ParkingLayoutTemplate = 'parallel_rows' | 'u_shape' | 'angled_parking' | 'split_zones';
export type ParkingSpotState = 'available' | 'reserved' | 'occupied' | 'out_of_service';
export type ParkingSpotType = 'regular' | 'accessible' | 'ev';

export interface ParkingLayoutSpot {
  id: ID;
  code: string;
  section: 'A' | 'B' | 'C' | 'D';
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  state: ParkingSpotState;
  type: ParkingSpotType;
}

export interface ParkingLayoutLane {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  kind: 'driving_lane' | 'one_way_lane';
  direction?: 'left' | 'right';
}

export interface ParkingLayout {
  parkingId: ID;
  parkingName: string;
  parkingNameAr: string;
  template: ParkingLayoutTemplate;
  dimensions: { width: number; height: number };
  section: { name: string; nameAr: string; spaceCount: 40 };
  entrance: { x: number; y: number; label: string };
  exit: { x: number; y: number; label: string };
  lanes: ParkingLayoutLane[];
  islands: Array<{ id: string; x: number; y: number; width: number; height: number }>;
  spots: ParkingLayoutSpot[];
  legend: {
    statuses: Array<{ id: ParkingSpotState; label: string; labelAr: string; color: string }>;
    types: Array<{ id: Exclude<ParkingSpotType, 'regular'>; label: string; labelAr: string; marker: string }>;
  };
  isDemo: true;
  lastUpdated: ISODateString;
}
