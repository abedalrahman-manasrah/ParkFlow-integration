import type { GeoPoint } from './common';
import type { ParkingZone } from './parking';
import type { EvChargingStation } from './evStation';
import type { CarServiceBusiness } from './carService';
import type { TourismPlace } from './tourismPlace';

export type RouteDestination =
  | { type: 'parking'; id: string; name: string; nameAr: string; location: GeoPoint; zone: ParkingZone }
  | { type: 'ev_station'; id: string; name: string; location: GeoPoint; station: EvChargingStation }
  | { type: 'car_service'; id: string; name: string; nameAr: string; location: GeoPoint; service: CarServiceBusiness }
  | { type: 'tourism_place'; id: string; name: string; nameAr: string; location: GeoPoint; place: TourismPlace }
  | { type: 'place'; id: string; name: string; nameAr?: string; location: GeoPoint };
export const parkingDestination = (zone: ParkingZone): RouteDestination => ({
  type: 'parking', id: zone.id, name: zone.name, nameAr: zone.nameAr, location: zone.location, zone,
});
export const evDestination = (station: EvChargingStation): RouteDestination => ({
  type: 'ev_station', id: station.id, name: station.name,
  location: { latitude: station.latitude, longitude: station.longitude }, station,
});
export const carServiceDestination = (service: CarServiceBusiness): RouteDestination => ({
  type: 'car_service',
  id: service.id,
  name: service.nameEn,
  nameAr: service.nameAr,
  location: { latitude: service.latitude, longitude: service.longitude },
  service,
});
export const tourismPlaceDestination = (place: TourismPlace): RouteDestination => ({
  type: 'tourism_place',
  id: place.id,
  name: place.nameEn,
  nameAr: place.nameAr,
  location: { latitude: place.latitude, longitude: place.longitude },
  place,
});
export const placeDestination = (place: { id: string; name: string; nameAr?: string; location: GeoPoint }): RouteDestination => ({
  type: 'place', id: place.id, name: place.name, nameAr: place.nameAr, location: place.location,
});
