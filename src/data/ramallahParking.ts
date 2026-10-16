import source from './ramallah_parking_locations.json';
import type { ParkingKind, ParkingZone, RamallahParkingDataset, RamallahParkingLocation } from '@/types';
import { normalizeGeoPoint } from '@/utils/coordinates';

/**
 * Single typed gateway to the supplied development dataset. Components consume
 * these objects directly so names, coordinates and prices are never duplicated.
 */
export const ramallahParkingDataset = source as RamallahParkingDataset;
export const ramallahParkingLocations = ramallahParkingDataset.parkingLocations.map((location) => {
  const normalized = normalizeGeoPoint(location.location);
  if (!normalized) throw new Error(`Parking location ${location.id} has invalid coordinates`);
  return { ...location, location: normalized };
});

const toParkingKind = (location: RamallahParkingLocation): ParkingKind => {
  if (location.ownership === 'private') return 'private';
  if (location.kind === 'multi_storey_garage' || location.kind === 'parking_garage') return 'garage';
  return 'lot';
};

/**
 * Converts collected map data into the app's canonical parking model. Prices,
 * coordinates and names stay sourced from the JSON; prototype-only operational
 * fields remain explicitly marked on the resulting zone.
 */
export function toParkingZone(location: RamallahParkingLocation): ParkingZone {
  const hourlyRate = Math.round(location.price.hourlyRateNis * 100);
  return {
    id: location.id,
    code: location.code,
    name: location.name,
    nameAr: location.nameAr,
    city: ramallahParkingDataset.city.name,
    cityAr: ramallahParkingDataset.city.nameAr,
    kind: toParkingKind(location),
    location: location.location,
    supportedModes: location.supportedModes,
    defaultMode: location.defaultMode,
    tariff: {
      id: `tar_${location.id}`,
      name: `${location.name} prototype tariff`,
      hourlyRate,
      currency: location.price.currency,
      incrementMinutes: location.price.billingUnitMinutes,
      freeMinutes: 0,
      minimumCharge: hourlyRate,
      maxStayMinutes: location.maxStayMinutes ?? undefined,
      validFrom: `${ramallahParkingDataset.generatedAt}T00:00:00.000Z`,
    },
    operatingHours: location.operatingHours,
    availability: location.availability,
    capacity: location.capacity,
    operatorName: location.operatorName,
    ownership: location.ownership,
    accessRestriction: location.accessRestriction,
    accessRestrictionAr: location.accessRestrictionAr,
    parkingAllowed: location.parkingAllowed,
    prototypeData: true,
    supportedEntryMethods: location.supportedEntryMethods,
    updatedAt: `${ramallahParkingDataset.generatedAt}T00:00:00.000Z`,
  };
}

export const ramallahParkingZones = ramallahParkingLocations.map(toParkingZone);
export const ramallahParkingZoneIds = new Set(ramallahParkingZones.map((zone) => zone.id));
