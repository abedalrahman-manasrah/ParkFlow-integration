import { useEffect, useMemo } from 'react';
import type { CarServiceBounds, CarServiceCategory, GeoRegion } from '@/types';
import { useCarServicesStore } from '@/store/carServicesStore';

export function useCarServices(active: boolean, region: GeoRegion, category: CarServiceCategory) {
  const state = useCarServicesStore();
  const bounds = useMemo<CarServiceBounds>(() => ({
    north: Math.min(90, region.latitude + region.latitudeDelta / 2),
    south: Math.max(-90, region.latitude - region.latitudeDelta / 2),
    east: Math.min(180, region.longitude + region.longitudeDelta / 2),
    west: Math.max(-180, region.longitude - region.longitudeDelta / 2),
  }), [region]);
  useEffect(() => {
    if (state.category !== category) state.setCategory(category);
  }, [category, state.category, state.setCategory]);
  useEffect(() => {
    if (!active) {
      state.deactivate();
      return;
    }
    const timer = setTimeout(() => { void state.load(bounds); }, 450);
    return () => clearTimeout(timer);
  }, [active, bounds, state.category, state.load, state.deactivate]);
  useEffect(() => () => state.deactivate(), [state.deactivate]);
  const visibleServices = useMemo(
    () => state.services.filter((service) =>
      service.latitude <= bounds.north &&
      service.latitude >= bounds.south &&
      service.longitude <= bounds.east &&
      service.longitude >= bounds.west
    ),
    [state.services, bounds],
  );
  return { ...state, services: visibleServices, retry: () => { if (active) void state.load(bounds, true); } };
}
