import { useEffect, useMemo } from 'react';
import type { EvStationBounds, GeoRegion } from '@/types';
import { useEvStationsStore } from '@/store/evStationsStore';

export function useEvStations(active: boolean, region: GeoRegion) {
  const state = useEvStationsStore();
  const bounds = useMemo<EvStationBounds>(() => ({
    north: Math.min(90, region.latitude + region.latitudeDelta / 2), south: Math.max(-90, region.latitude - region.latitudeDelta / 2),
    east: Math.min(180, region.longitude + region.longitudeDelta / 2), west: Math.max(-180, region.longitude - region.longitudeDelta / 2),
  }), [region]);
  useEffect(() => {
    if (!active) { state.deactivate(); return; }
    const timer = setTimeout(() => { void state.load(bounds); }, 450);
    return () => clearTimeout(timer);
  }, [active, bounds, state.filters, state.load, state.deactivate]);
  useEffect(() => () => state.deactivate(), [state.deactivate]);
  // Expanded fetches are cached, but marker counts/empty state describe the visible view.
  const stations = useMemo(() => state.stations.filter((s) => s.latitude <= bounds.north && s.latitude >= bounds.south && s.longitude <= bounds.east && s.longitude >= bounds.west), [state.stations, bounds]);
  return { ...state, stations, retry: () => { if (active) void state.load(bounds, true); } };
}
