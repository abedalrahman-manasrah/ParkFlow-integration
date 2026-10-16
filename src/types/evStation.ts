export const EV_CONNECTOR_TYPES = ['type_2', 'ccs_2', 'chademo', 'gb_t', 'type_1', 'other'] as const;
export const EV_STATION_STATUSES = ['operational', 'temporarily_unavailable', 'planned', 'unknown'] as const;
export type EvConnectorType = typeof EV_CONNECTOR_TYPES[number];
export type EvStationStatus = typeof EV_STATION_STATUSES[number];
export type EvAccessType = 'public' | 'customers_only' | 'private' | 'unknown';
export interface EvConnector { type: EvConnectorType; powerKw: number; quantity: number }
export interface EvChargingStation {
  id: string; name: string; operatorName?: string; latitude: number; longitude: number;
  address?: string; city?: string; connectors: EvConnector[]; status: EvStationStatus;
  accessType: EvAccessType; pricingText?: string; openingHoursText?: string; phone?: string;
  sourceName?: string; sourceUrl?: string; lastVerifiedAt?: string; createdAt: string; updatedAt: string;
}
export interface EvStationBounds { north: number; south: number; east: number; west: number }
export interface EvStationFilters { connectorType?: EvConnectorType; minPowerKw?: number; status?: EvStationStatus }
export interface EvStationResult { stations: EvChargingStation[]; truncated: boolean }
export interface EvStationApi { list(bounds: EvStationBounds, filters: EvStationFilters): Promise<EvStationResult> }
