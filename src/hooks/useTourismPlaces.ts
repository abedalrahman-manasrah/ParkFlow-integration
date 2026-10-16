import { useEffect, useMemo } from 'react';
import type { GeoRegion, TourismPlaceBounds, TourismPlaceCategory } from '@/types';
import { useTourismPlacesStore } from '@/store/tourismPlacesStore';

export function useTourismPlaces(active: boolean, region: GeoRegion, categories: TourismPlaceCategory[]) {
  const state = useTourismPlacesStore();
  const categoryKey = categories.join('|');
  const bounds = useMemo<TourismPlaceBounds>(() => ({
    north: Math.min(90, region.latitude + region.latitudeDelta / 2),
    south: Math.max(-90, region.latitude - region.latitudeDelta / 2),
    east: Math.min(180, region.longitude + region.longitudeDelta / 2),
    west: Math.max(-180, region.longitude - region.longitudeDelta / 2),
  }), [region]);
  useEffect(() => {
    if (state.categories.join('|') !== categoryKey) state.setCategories(categories);
  }, [categories, categoryKey, state.categories, state.setCategories]);
  useEffect(() => {
    if (!active) {
      state.deactivate();
      return;
    }
    const timer = setTimeout(() => { void state.load(bounds); }, 450);
    return () => clearTimeout(timer);
  }, [active, bounds, state.categories, state.load, state.deactivate]);
  useEffect(() => () => state.deactivate(), [state.deactivate]);
  const visiblePlaces = useMemo(
    () => state.places.filter((place) =>
      place.latitude <= bounds.north &&
      place.latitude >= bounds.south &&
      place.longitude <= bounds.east &&
      place.longitude >= bounds.west
    ),
    [state.places, bounds],
  );
  return { ...state, places: visiblePlaces, retry: () => { if (active) void state.load(bounds, true); } };
}
