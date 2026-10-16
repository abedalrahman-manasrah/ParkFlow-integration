import type { RoutingService } from '../types';
import type { RouteResult } from '@/types';
import { normalizeGeoPoint, normalizeGeoPoints } from '@/utils/coordinates';
import { api } from './apiClient';

const normalizeRoute = (route: RouteResult): RouteResult => ({
  ...route,
  coordinates: normalizeGeoPoints(route.coordinates),
  rejected: route.rejected.map((item) => ({
    ...item,
    coordinates: normalizeGeoPoints(item.coordinates),
  })),
  alternatives: route.alternatives.map((alternative) => ({
    ...alternative,
    coordinates: normalizeGeoPoints(alternative.coordinates),
  })),
  trafficSegments: route.trafficSegments
    ?.map((segment) => ({
      ...segment,
      coordinates: normalizeGeoPoints(segment.coordinates),
    }))
    .filter((segment) => segment.coordinates.length >= 2),
  snappedDestination: normalizeGeoPoint(route.snappedDestination),
});

export const httpRoutingService: RoutingService = {
  async getRoute(origin, destination, options) {
    const route = await api<RouteResult>('/routes/plan', {
      method: 'POST',
      body: { origin, destination, ...options },
    });
    return normalizeRoute(route);
  },
};
