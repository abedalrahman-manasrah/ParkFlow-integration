import type { GeoPoint, RoadReportBounds } from '@/types';

const pointKey = (point?: GeoPoint) =>
  point ? `${point.latitude.toFixed(5)},${point.longitude.toFixed(5)}` : '';

/**
 * Central query-key registry. Keeping them here (rather than inline strings)
 * makes invalidation after a mutation explicit and greppable.
 */
export const queryKeys = {
  vehicles: (userId: string) => ['vehicles', userId] as const,
  vehicle: (userId: string, vehicleId: string) => ['vehicles', userId, vehicleId] as const,
  vehiclePermits: (vehicleId: string) => ['permits', vehicleId] as const,

  zones: (search?: string) => ['zones', search ?? ''] as const,
  zone: (zoneId: string) => ['zone', zoneId] as const,
  parkingLayout: (parkingId: string) => ['parking-layout', parkingId] as const,

  activeSessions: (userId: string) => ['sessions', 'active', userId] as const,
  session: (sessionId: string) => ['session', sessionId] as const,
  sessions: (userId: string, vehicleId?: string) =>
    ['sessions', userId, vehicleId ?? 'all'] as const,
  reservations: (userId: string) => ['reservations', userId] as const,
  reservation: (reservationId: string) => ['reservation', reservationId] as const,

  wallet: (userId: string) => ['wallet', userId] as const,
  paymentMethods: (userId: string) => ['payment-methods', userId] as const,
  transactions: (userId: string, filter: string) => ['transactions', userId, filter] as const,
  transaction: (transactionId: string) => ['transaction', transactionId] as const,

  violations: (userId: string, vehicleId?: string) =>
    ['violations', userId, vehicleId ?? 'all'] as const,
  violation: (violationId: string) => ['violation', violationId] as const,
  evidence: (violationId: string) => ['evidence', violationId] as const,
  appeal: (appealId: string) => ['appeal', appealId] as const,

  notifications: (userId: string) => ['notifications', userId] as const,
  unreadCount: (userId: string) => ['notifications', userId, 'unread'] as const,

  profile: (userId: string) => ['profile', userId] as const,

  checkpoints: () => ['roads', 'checkpoints'] as const,
  roadFeed: () => ['roads', 'feed'] as const,
  roadReportLists: () => ['road-reports', 'list'] as const,
  roadReports: (bounds: RoadReportBounds) => ['road-reports', 'list', bounds.north, bounds.south, bounds.east, bounds.west] as const,
  roadReport: (reportId: string) => ['road-reports', 'detail', reportId] as const,
  route: (from?: GeoPoint, to?: GeoPoint, mode = 'checkpoint-aware') =>
    ['route', pointKey(from), pointKey(to), mode] as const,
  trust: (userId: string) => ['trust', userId] as const,

  rideSearch: (search: { from?: string; to?: string; after?: string; before?: string }) =>
    ['rides', 'search', search.from ?? '', search.to ?? '', search.after ?? '', search.before ?? ''] as const,
  myRides: () => ['rides', 'mine'] as const,
  ride: (rideId: string) => ['ride', rideId] as const,
  spots: (near?: GeoPoint) => ['spots', 'list', pointKey(near)] as const,
  mySpots: () => ['spots', 'mine'] as const,
  spot: (spotId: string) => ['spot', spotId] as const,
} as const;

/** Everything that changes when money moves. */
export const moneyKeys = (userId: string) => [
  ['wallet', userId],
  ['transactions', userId],
  ['sessions', userId],
  ['sessions', 'active', userId],
  ['notifications', userId],
];
