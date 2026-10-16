import type { CarServiceCategory } from './carService';
import type { TourismPlaceCategory } from './tourismPlace';

export const PRIMARY_MAP_CATEGORIES = [
  'parking',
  'ev_charging',
  'car_services',
  'tourism_places',
  'roadside_help',
] as const;

export type PrimaryMapCategory = typeof PRIMARY_MAP_CATEGORIES[number];

/** Extension switches for categories whose data sources and markers arrive later. */
export const MAP_LAYER_AVAILABILITY: Record<PrimaryMapCategory, boolean> = {
  parking: true,
  ev_charging: true,
  car_services: true,
  tourism_places: true,
  roadside_help: false,
};

export const BUSINESS_OFFERS_AVAILABLE = false;

export const isAvailablePrimaryCategory = (value: unknown): value is PrimaryMapCategory =>
  typeof value === 'string'
  && PRIMARY_MAP_CATEGORIES.includes(value as PrimaryMapCategory)
  && MAP_LAYER_AVAILABILITY[value as PrimaryMapCategory];

export const isCarServiceCategory = (value: unknown): value is CarServiceCategory =>
  typeof value === 'string'
  && ['car_wash', 'oil_change', 'maintenance', 'tire_service'].includes(value);

export const isTourismPlaceCategory = (value: unknown): value is TourismPlaceCategory =>
  typeof value === 'string'
  && ['historic_landmark', 'museum', 'park_garden', 'visitor_attraction', 'family_rest', 'prayer_place'].includes(value);
