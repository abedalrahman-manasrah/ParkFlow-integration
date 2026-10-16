export const TOURISM_PLACE_CATEGORIES = ['historic_landmark', 'museum', 'park_garden', 'visitor_attraction', 'family_rest', 'prayer_place'] as const;
export type TourismPlaceCategory = typeof TOURISM_PLACE_CATEGORIES[number];

export interface TourismPlaceSource {
  url: string;
  publisher: string;
  type: string;
  supports: string[];
  accessedOn: string;
}

export interface TourismPlace {
  id: string;
  nameAr: string;
  nameEn: string;
  primaryCategory: TourismPlaceCategory;
  categories: TourismPlaceCategory[];
  descriptionAr?: string;
  cityAr?: string;
  regionAr?: string;
  addressAr?: string;
  latitude: number;
  longitude: number;
  mapReady: boolean;
  coordinateReferenceSystem?: string;
  coordinateSourceUrl?: string;
  locationStatus: string;
  coordinateMeaning?: string;
  locationNoteAr?: string;
  fieldVerified: boolean;
  phone?: string;
  email?: string;
  website?: string;
  imageUrl: string | null;
  imageLicense?: string;
  imageUsageRightsVerified: boolean;
  nearbyParkingIds: string[];
  officialSourceId?: number;
  sources: TourismPlaceSource[];
  sourcesCheckedOn: string;
  createdAt: string;
  updatedAt: string;
}

export interface TourismPlaceBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

export interface TourismPlaceFilters {
  category?: TourismPlaceCategory;
}

export interface TourismPlaceResult {
  places: TourismPlace[];
  truncated: boolean;
}

export interface TourismPlaceApi {
  list(bounds: TourismPlaceBounds, filters: TourismPlaceFilters): Promise<TourismPlaceResult>;
}
