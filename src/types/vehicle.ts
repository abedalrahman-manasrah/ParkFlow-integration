import type { ID, ISODateString } from './common';

export type VehicleType = 'private' | 'commercial' | 'taxi' | 'motorcycle';

/**
 * A Vehicle is an independent entity keyed by plate — it is NOT owned by a user
 * row. Violations and historical sessions attach to the vehicle, which is what
 * lets a car be transferred, shared or company-owned later on.
 */
export interface Vehicle {
  id: ID;
  plateNumber: string;
  type: VehicleType;
  make?: string;
  model?: string;
  color?: string;
  colorHex?: string;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export type UserVehicleRole = 'owner' | 'driver' | 'manager';

/**
 * Join between a user and a vehicle. Multiple users may link the same vehicle
 * (family / fleet), and unlinking only ends this relationship — it never deletes
 * the vehicle or its history.
 */
export interface UserVehicle {
  id: ID;
  userId: ID;
  vehicleId: ID;
  role: UserVehicleRole;
  nickname?: string;
  isDefault: boolean;
  linkedAt: ISODateString;
  unlinkedAt?: ISODateString;
}

/** What screens actually render: the vehicle joined with this user's link. */
export interface UserVehicleView extends Vehicle {
  linkId: ID;
  role: UserVehicleRole;
  nickname?: string;
  isDefault: boolean;
  displayName: string;
}
