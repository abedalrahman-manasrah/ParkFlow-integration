import type { CreateVehicleInput, VehicleService } from './types';
import type { UserVehicle, UserVehicleView, Vehicle } from '@/types';
import { AppError } from '@/utils/errors';
import { createId } from '@/utils/id';
import { networkDelay } from '@/utils/async';
import { normalizePlate, formatPlate, isValidPlate } from '@/utils/plate';
import { nowIso } from '@/utils/time';
import { getDb, mutate } from './mock/db';
import { seedVehicleHistory, seedVehiclePermits } from './mock/demo';

/** Fallback display name when the user gave no make/model. */
function displayNameFor(vehicle: Vehicle, link: UserVehicle): string {
  if (link.nickname) return link.nickname;
  const parts = [vehicle.make, vehicle.model].filter(Boolean);
  if (parts.length) return parts.join(' ');
  switch (vehicle.type) {
    case 'motorcycle':
      return 'Motorcycle';
    case 'taxi':
      return 'Taxi';
    case 'commercial':
      return 'Commercial vehicle';
    default:
      return 'My vehicle';
  }
}

function toView(vehicle: Vehicle, link: UserVehicle): UserVehicleView {
  return {
    ...vehicle,
    linkId: link.id,
    role: link.role,
    nickname: link.nickname,
    isDefault: link.isDefault,
    displayName: displayNameFor(vehicle, link),
  };
}

function activeLinks(db: Awaited<ReturnType<typeof getDb>>, userId: string): UserVehicle[] {
  return db.userVehicles.filter((l) => l.userId === userId && !l.unlinkedAt);
}

export const mockVehicleService: VehicleService = {
  async list(userId) {
    await networkDelay(180, 400);
    const db = await getDb();
    return activeLinks(db, userId)
      .map((link) => {
        const vehicle = db.vehicles.find((v) => v.id === link.vehicleId);
        return vehicle ? toView(vehicle, link) : undefined;
      })
      .filter((v): v is UserVehicleView => Boolean(v))
      .sort((a, b) => Number(b.isDefault) - Number(a.isDefault));
  },

  async get(userId, vehicleId) {
    await networkDelay(120, 300);
    const db = await getDb();
    const link = activeLinks(db, userId).find((l) => l.vehicleId === vehicleId);
    const vehicle = db.vehicles.find((v) => v.id === vehicleId);
    if (!link || !vehicle) throw new AppError('not_found', 'Vehicle not found');
    return toView(vehicle, link);
  },

  async create(userId, input) {
    await networkDelay();
    const plate = normalizePlate(input.plateNumber);
    if (!isValidPlate(plate)) {
      throw new AppError('validation', 'Enter a valid plate number');
    }

    return mutate((db) => {
      const formatted = formatPlate(plate);

      // A vehicle is keyed by plate and shared across accounts — if it already
      // exists we link to it rather than creating a duplicate record.
      let vehicle = db.vehicles.find((v) => v.plateNumber === formatted);

      if (vehicle) {
        const alreadyLinked = activeLinks(db, userId).some((l) => l.vehicleId === vehicle!.id);
        if (alreadyLinked) {
          throw new AppError('conflict', 'This vehicle is already on your account');
        }
      } else {
        vehicle = {
          id: createId('veh'),
          plateNumber: formatted,
          type: input.type,
          make: input.make?.trim() || undefined,
          model: input.model?.trim() || undefined,
          color: input.color?.trim() || undefined,
          colorHex: input.colorHex,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        };
        db.vehicles.push(vehicle);
      }

      const isFirst = activeLinks(db, userId).length === 0;
      const link: UserVehicle = {
        id: createId('uv'),
        userId,
        vehicleId: vehicle.id,
        role: 'owner',
        nickname: input.nickname?.trim() || undefined,
        isDefault: isFirst,
        linkedAt: nowIso(),
      };
      db.userVehicles.push(link);

      // The first vehicle unlocks the demo history: past sessions and the
      // violations raised against this plate.
      if (isFirst) seedVehicleHistory(db, userId, vehicle);

      return toView(vehicle, link);
    });
  },

  async update(userId, vehicleId, input) {
    await networkDelay();
    return mutate((db) => {
      const link = activeLinks(db, userId).find((l) => l.vehicleId === vehicleId);
      const vehicle = db.vehicles.find((v) => v.id === vehicleId);
      if (!link || !vehicle) throw new AppError('not_found', 'Vehicle not found');

      if (input.plateNumber) {
        const plate = normalizePlate(input.plateNumber);
        if (!isValidPlate(plate)) throw new AppError('validation', 'Enter a valid plate number');
        vehicle.plateNumber = formatPlate(plate);
      }
      if (input.type) vehicle.type = input.type;
      if (input.make !== undefined) vehicle.make = input.make.trim() || undefined;
      if (input.model !== undefined) vehicle.model = input.model.trim() || undefined;
      if (input.color !== undefined) vehicle.color = input.color.trim() || undefined;
      if (input.colorHex !== undefined) vehicle.colorHex = input.colorHex;
      if (input.nickname !== undefined) link.nickname = input.nickname.trim() || undefined;
      vehicle.updatedAt = nowIso();

      return toView(vehicle, link);
    });
  },

  async setDefault(userId, vehicleId) {
    await networkDelay(120, 280);
    await mutate((db) => {
      const links = activeLinks(db, userId);
      const target = links.find((l) => l.vehicleId === vehicleId);
      if (!target) throw new AppError('not_found', 'Vehicle not found');
      links.forEach((l) => {
        l.isDefault = l.vehicleId === vehicleId;
      });
    });
  },

  async unlink(userId, vehicleId) {
    await networkDelay();
    await mutate((db) => {
      const link = activeLinks(db, userId).find((l) => l.vehicleId === vehicleId);
      if (!link) throw new AppError('not_found', 'Vehicle not found');

      const hasActiveSession = db.sessions.some(
        (s) => s.vehicleId === vehicleId && s.status === 'ACTIVE',
      );
      if (hasActiveSession) {
        throw new AppError('conflict', 'This vehicle has an active parking session');
      }

      // Soft unlink only. Sessions and violations keep pointing at the vehicle,
      // so history and enforcement records stay intact.
      link.unlinkedAt = nowIso();

      if (link.isDefault) {
        link.isDefault = false;
        const next = activeLinks(db, userId)[0];
        if (next) next.isDefault = true;
      }
    });
  },

  async permits(vehicleId) {
    await networkDelay(120, 260);
    // Demo permits are issued on first view, so every linked vehicle has some.
    return mutate((db) => {
      seedVehiclePermits(db, vehicleId);
      return db.permits.filter((p) => p.vehicleId === vehicleId);
    });
  },
};
