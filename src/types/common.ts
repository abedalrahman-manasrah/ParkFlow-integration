/** ISO-8601 timestamp string. All times cross service boundaries as ISO strings. */
export type ISODateString = string;

export type ID = string;

export type Currency = 'ILS';

/** Money is always stored in minor units (agora) to avoid float drift. */
export interface Money {
  amount: number;
  currency: Currency;
}

export interface GeoPoint {
  latitude: number;
  longitude: number;
}

export interface GeoRegion extends GeoPoint {
  latitudeDelta: number;
  longitudeDelta: number;
}

export type AsyncStatus = 'idle' | 'loading' | 'success' | 'error';

export interface Paginated<T> {
  items: T[];
  nextCursor?: string;
  total: number;
}
