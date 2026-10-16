import { create } from 'zustand';
import { services } from '@/services';
import type { CarServiceBounds, CarServiceBusiness, CarServiceCategory } from '@/types';
import { isValidGeoPoint } from '@/utils/coordinates';

interface CarServicesState {
  services: CarServiceBusiness[];
  selectedServiceId?: string;
  selectedService?: CarServiceBusiness;
  loading: boolean;
  error?: 'load' | 'zoom';
  errorMessage?: string;
  category?: CarServiceCategory;
  lastLoadedBounds?: CarServiceBounds;
  loadedAt: number;
  truncated: boolean;
  select: (service?: CarServiceBusiness) => void;
  setCategory: (category: CarServiceCategory) => void;
  deactivate: () => void;
  load: (bounds: CarServiceBounds, force?: boolean) => Promise<void>;
}

let requestVersion = 0;

const hasValidServiceCoordinate = (service: CarServiceBusiness) =>
  service.mapReady && isValidGeoPoint({ latitude: service.latitude, longitude: service.longitude });

export const useCarServicesStore = create<CarServicesState>((set, get) => ({
  services: [],
  category: 'car_wash',
  loading: false,
  loadedAt: 0,
  truncated: false,
  select: (service) => set({ selectedServiceId: service?.id, selectedService: service }),
  setCategory: (category) => {
    requestVersion++;
    set({
      category,
      services: [],
      selectedServiceId: undefined,
      selectedService: undefined,
      lastLoadedBounds: undefined,
      loadedAt: 0,
      loading: false,
      error: undefined,
      errorMessage: undefined,
      truncated: false,
    });
  },
  deactivate: () => {
    requestVersion++;
    set({ selectedServiceId: undefined, selectedService: undefined, loading: false });
  },
  load: async (bounds, force = false) => {
    const state = get();
    const category = state.category;
    if (bounds.north - bounds.south > 1.5 || bounds.east - bounds.west > 1.5 || bounds.east <= bounds.west || bounds.north <= bounds.south) {
      requestVersion++;
      set({ error: 'zoom', errorMessage: undefined, loading: false, services: [], lastLoadedBounds: undefined });
      return;
    }
    const cached = state.lastLoadedBounds;
    if (!force && cached && Date.now() - state.loadedAt < 300000 && bounds.north <= cached.north && bounds.south >= cached.south && bounds.east <= cached.east && bounds.west >= cached.west) {
      requestVersion++;
      set({ error: undefined, errorMessage: undefined, loading: false });
      return;
    }
    const latPad = (bounds.north - bounds.south) * 0.15;
    const lonPad = (bounds.east - bounds.west) * 0.15;
    const expanded = {
      north: Math.min(90, bounds.north + latPad),
      south: Math.max(-90, bounds.south - latPad),
      east: Math.min(180, bounds.east + lonPad),
      west: Math.max(-180, bounds.west - lonPad),
    };
    const version = ++requestVersion;
    set({ loading: true, error: undefined, errorMessage: undefined });
    try {
      const result = await services.carServices.list(expanded, { category });
      if (version !== requestVersion) return;
      set({
        services: result.services.filter(hasValidServiceCoordinate),
        truncated: result.truncated,
        loading: false,
        lastLoadedBounds: expanded,
        loadedAt: Date.now(),
        errorMessage: undefined,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown car services load failure';
      console.warn('Car services load failed', { category, bounds: expanded, error });
      if (version === requestVersion) set({ loading: false, error: 'load', errorMessage: message, lastLoadedBounds: undefined });
    }
  },
}));
