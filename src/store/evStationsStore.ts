import { create } from 'zustand';
import { services } from '@/services';
import type { EvChargingStation, EvStationBounds, EvStationFilters } from '@/types';

interface EvStationsState {
  stations: EvChargingStation[]; selectedStationId?: string; selectedStation?: EvChargingStation;
  loading: boolean; error?: 'load' | 'zoom'; filters: EvStationFilters;
  lastLoadedBounds?: EvStationBounds; loadedAt: number; truncated: boolean;
  select: (station?: EvChargingStation) => void;
  setFilters: (filters: EvStationFilters) => void;
  deactivate: () => void;
  load: (bounds: EvStationBounds, force?: boolean) => Promise<void>;
}
let requestVersion = 0;
export const useEvStationsStore = create<EvStationsState>((set, get) => ({
  stations: [], filters: {}, loading: false, loadedAt: 0, truncated: false,
  select: (station) => set({ selectedStationId: station?.id, selectedStation: station }),
  setFilters: (filters) => {
    requestVersion++;
    set({ filters, stations: [], selectedStationId: undefined, selectedStation: undefined, lastLoadedBounds: undefined, loadedAt: 0, loading: false, error: undefined, truncated: false });
  },
  deactivate: () => {
    requestVersion++;
    set({ selectedStationId: undefined, selectedStation: undefined, loading: false });
  },
  load: async (bounds, force = false) => {
    const state = get();
    if (bounds.north - bounds.south > 1.5 || bounds.east - bounds.west > 1.5 || bounds.east <= bounds.west || bounds.north <= bounds.south) {
      requestVersion++;
      set({ error: 'zoom', loading: false, stations: [], lastLoadedBounds: undefined });
      return;
    }
    const cached = state.lastLoadedBounds;
    if (!force && cached && Date.now() - state.loadedAt < 300000 && bounds.north <= cached.north && bounds.south >= cached.south && bounds.east <= cached.east && bounds.west >= cached.west) {
      requestVersion++;
      set({ error: undefined, loading: false });
      return;
    }
    const latPad = (bounds.north - bounds.south) * 0.15;
    const lonPad = (bounds.east - bounds.west) * 0.15;
    const expanded = { north: Math.min(90, bounds.north + latPad), south: Math.max(-90, bounds.south - latPad), east: Math.min(180, bounds.east + lonPad), west: Math.max(-180, bounds.west - lonPad) };
    const version = ++requestVersion;
    set({ loading: true, error: undefined });
    try {
      const result = await services.evStations.list(expanded, state.filters);
      if (version !== requestVersion) return;
      set({ stations: result.stations, truncated: result.truncated, loading: false, lastLoadedBounds: expanded, loadedAt: Date.now() });
    } catch {
      if (version === requestVersion) set({ loading: false, error: 'load', lastLoadedBounds: undefined });
    }
  },
}));
