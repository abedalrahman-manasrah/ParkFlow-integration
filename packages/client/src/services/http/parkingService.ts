import type { ParkingService } from '@parkflow/contracts/services';
import type { ParkingFeedback, ParkingSession, ParkingZone } from '@parkflow/contracts';
import { ramallahParkingZones } from '../../data/ramallahParking';
import { normalizeGeoPoint } from '../../utils/coordinates';
import { AppError } from '../../utils/errors';
import { api, mutation, query, segment } from './apiClient';

const collectedZoneMetadata = new Map(ramallahParkingZones.map((zone) => [zone.id, zone]));

/** Published API values take precedence; collected data only fills missing metadata. */
type ApiParkingZone = Omit<ParkingZone, 'location'> & {
  location?: unknown;
  latitude?: number | string;
  longitude?: number | string;
  lat?: number | string;
  lng?: number | string;
  lon?: number | string;
};

const normalizeZone = (zone: ApiParkingZone): ParkingZone => {
  const metadata = collectedZoneMetadata.get(zone.id);
  const location = normalizeGeoPoint(zone.location) ?? normalizeGeoPoint(zone) ?? metadata?.location;
  if (!location) {
    throw new AppError('validation', `Parking zone ${zone.id} has invalid coordinates`);
  }
  const normalized = { ...zone, location };
  return metadata ? { ...metadata, ...normalized } : normalized;
};

export const httpParkingService: ParkingService = {
  async listZones(options) {
    const zones = await api<ApiParkingZone[]>(
      '/parking/zones' +
        query({
          search: options?.search,
          lat: options?.near?.latitude,
          lng: options?.near?.longitude,
          radius: options?.radiusMeters,
        }),
    );
    return zones.map(normalizeZone);
  },
  async getZone(id) {
    return normalizeZone(await api<ApiParkingZone>(`/parking/zones/${segment(id)}`));
  },
  async getZoneByCode(code) {
    return normalizeZone(await api<ApiParkingZone>(`/parking/zones/code/${segment(code)}`));
  },
  getFacility: (id) => api(`/parking/facilities/${segment(id)}`),
  getFacilityNavigation: (id) => api(`/parking/facilities/${segment(id)}/navigation`),
  getLayout: (id) => api(`/parking/zones/${segment(id)}/layout`),
  startSession: ({ userId, idempotencyKey, ...body }) =>
    api('/parking/sessions', { method: 'POST', body, key: idempotencyKey }),
  stopSession: (id) => mutation(`/parking/sessions/${segment(id)}/stop`),
  extendSession: (id, additionalMinutes) =>
    mutation(`/parking/sessions/${segment(id)}/extend`, { additionalMinutes }),
  settleSession: (id) => mutation(`/parking/sessions/${segment(id)}/settle`),
  submitParkingFeedback: ({ userId: _userId, idempotencyKey, zoneId, ...body }) =>
    api<ParkingFeedback>(`/parking/zones/${segment(zoneId)}/feedback`, { method: 'POST', body, key: idempotencyKey }),
  getSession: (id) => api(`/parking/sessions/${segment(id)}`),
  listActiveSessions: () => api('/parking/sessions/active'),
  async getActiveSessionForVehicle(vehicleId) {
    return (
      await api<ParkingSession[]>('/parking/sessions/active' + query({ vehicleId }))
    )[0];
  },
  listSessions: ({ userId, ...options }) => api('/parking/sessions' + query(options)),
  quoteReservation: (body) => api('/parking/reservations/quote', { method: 'POST', body }),
  createReservation: (body) => mutation('/parking/reservations', body),
  listReservations: () => api('/parking/reservations'),
  getReservation: (id) => api(`/parking/reservations/${segment(id)}`),
  cancelReservation: (id) => mutation(`/parking/reservations/${segment(id)}/cancel`),
  validateReservationQr: (token) => mutation('/parking/reservations/qr/validate', { token }),
};
