export const CAR_SERVICE_CATEGORIES = ['car_wash', 'oil_change', 'maintenance', 'tire_service'] as const;
export type CarServiceCategory = typeof CAR_SERVICE_CATEGORIES[number];

export interface CarServiceBusiness {
  id: string;
  nameAr: string;
  nameEn: string;
  categories: CarServiceCategory[];
  latitude: number;
  longitude: number;
  mapReady: boolean;
  coordinateAccuracy: string;
  coordinateNoteAr?: string;
  coordinateNoteEn?: string;
  addressAr?: string;
  addressEn?: string;
  phone?: string;
  website?: string;
  openingHoursText?: string;
  servicesAr: string[];
  servicesEn: string[];
  pricing: unknown | null;
  operatingStatus: string;
  verificationStatus: string;
  sourceName: string;
  sourceUrl: string;
  secondarySourceUrl?: string;
  lastCheckedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface CarServiceBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

export interface CarServiceFilters {
  category?: CarServiceCategory;
}

export interface CarServiceResult {
  services: CarServiceBusiness[];
  truncated: boolean;
}

export interface CarServiceApi {
  list(bounds: CarServiceBounds, filters: CarServiceFilters): Promise<CarServiceResult>;
}
