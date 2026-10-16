import dataset from '../../../ramallah_tourism_places.json';
import feature9Dataset from '../../../parkflow_feature9_ramallah_albireh_expanded.json';
import type { TourismPlace, TourismPlaceApi, TourismPlaceCategory, TourismPlaceSource } from '@/types';

/**
 * Shape of each entry in the dataset file. It mirrors `TourismPlace` but uses
 * `null` (JSON has no `undefined`) for every field the source data may omit.
 */
type RawTourismPlaceSource = TourismPlaceSource | Omit<TourismPlaceSource, 'supports'>;

interface RawTourismPlace {
  id: string;
  nameAr: string;
  nameEn: string;
  primaryCategory: TourismPlaceCategory;
  categories: TourismPlaceCategory[];
  descriptionAr: string | null;
  cityAr: string | null;
  regionAr: string | null;
  addressAr: string | null;
  latitude: number | null;
  longitude: number | null;
  mapReady: boolean;
  coordinateReferenceSystem: string | null;
  coordinateSourceUrl: string | null;
  locationStatus: string;
  coordinateMeaning: string | null;
  locationNoteAr?: string | null;
  fieldVerified: boolean;
  phone: string | null;
  email?: string | null;
  website: string | null;
  imageUrl: string | null;
  imageLicense: string | null;
  imageUsageRightsVerified?: boolean;
  nearbyParkingIds: string[];
  officialSourceId?: number | null;
  sources: RawTourismPlaceSource[];
  sourcesCheckedOn: string;
}

const undef = <T>(value: T | null): T | undefined => value ?? undefined;

const isValidCoordinatePair = (place: RawTourismPlace) =>
  typeof place.latitude === 'number' &&
  Number.isFinite(place.latitude) &&
  place.latitude >= -90 &&
  place.latitude <= 90 &&
  typeof place.longitude === 'number' &&
  Number.isFinite(place.longitude) &&
  place.longitude >= -180 &&
  place.longitude <= 180;

const rawPlaces = [
  ...(dataset.places as unknown as RawTourismPlace[]),
  ...(feature9Dataset.places as unknown as RawTourismPlace[]),
];

const placesById = new Map<string, TourismPlace>();

rawPlaces
  .filter((place) => place.mapReady && isValidCoordinatePair(place))
  .forEach((place) => {
    const checkedOnIso = `${place.sourcesCheckedOn}T00:00:00.000Z`;
    if (placesById.has(place.id)) return;
    placesById.set(place.id, {
      id: place.id,
      nameAr: place.nameAr,
      nameEn: place.nameEn,
      primaryCategory: place.primaryCategory,
      categories: place.categories,
      descriptionAr: undef(place.descriptionAr),
      cityAr: undef(place.cityAr),
      regionAr: undef(place.regionAr),
      addressAr: undef(place.addressAr),
      latitude: place.latitude!,
      longitude: place.longitude!,
      mapReady: place.mapReady,
      coordinateReferenceSystem: undef(place.coordinateReferenceSystem),
      coordinateSourceUrl: undef(place.coordinateSourceUrl),
      locationStatus: place.locationStatus,
      coordinateMeaning: undef(place.coordinateMeaning),
      locationNoteAr: undef(place.locationNoteAr),
      fieldVerified: place.fieldVerified,
      phone: undef(place.phone),
      email: undef(place.email),
      website: undef(place.website),
      imageUrl: place.imageUrl,
      imageLicense: undef(place.imageLicense),
      imageUsageRightsVerified: place.imageUsageRightsVerified ?? false,
      nearbyParkingIds: place.nearbyParkingIds,
      officialSourceId: undef(place.officialSourceId),
      sources: place.sources.map((source) => ({ supports: [], ...source })),
      sourcesCheckedOn: checkedOnIso,
      createdAt: checkedOnIso,
      updatedAt: checkedOnIso,
    });
  });

const places = [...placesById.values()];

export const httpTourismPlaceService: TourismPlaceApi = {
  list: async (bounds, filters) => {
    const filtered = places
      .filter((place) =>
        place.latitude <= bounds.north &&
        place.latitude >= bounds.south &&
        place.longitude <= bounds.east &&
        place.longitude >= bounds.west &&
        (!filters.category || place.categories.includes(filters.category))
      )
      .sort((a, b) => a.nameEn.localeCompare(b.nameEn) || a.id.localeCompare(b.id));
    return { places: filtered.slice(0, 200), truncated: filtered.length > 200 };
  },
};
