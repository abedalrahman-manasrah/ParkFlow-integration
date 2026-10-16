import { create } from 'zustand';
import { services } from '@/services';
import type { TourismPlace, TourismPlaceBounds, TourismPlaceCategory } from '@/types';
import { isValidGeoPoint } from '@/utils/coordinates';

interface TourismPlacesState {
  places: TourismPlace[];
  selectedPlaceId?: string;
  selectedPlace?: TourismPlace;
  loading: boolean;
  error?: 'load' | 'zoom';
  errorMessage?: string;
  categories: TourismPlaceCategory[];
  lastLoadedBounds?: TourismPlaceBounds;
  loadedAt: number;
  truncated: boolean;
  select: (place?: TourismPlace) => void;
  setCategories: (categories: TourismPlaceCategory[]) => void;
  deactivate: () => void;
  load: (bounds: TourismPlaceBounds, force?: boolean) => Promise<void>;
}

let requestVersion = 0;

const hasValidPlaceCoordinate = (place: TourismPlace) =>
  place.mapReady && isValidGeoPoint({ latitude: place.latitude, longitude: place.longitude });

export const useTourismPlacesStore = create<TourismPlacesState>((set, get) => ({
  places: [],
  categories: ['historic_landmark', 'museum', 'park_garden', 'visitor_attraction'],
  loading: false,
  loadedAt: 0,
  truncated: false,
  select: (place) => set({ selectedPlaceId: place?.id, selectedPlace: place }),
  setCategories: (categories) => {
    requestVersion++;
    set({
      categories,
      places: [],
      selectedPlaceId: undefined,
      selectedPlace: undefined,
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
    set({ selectedPlaceId: undefined, selectedPlace: undefined, loading: false });
  },
  load: async (bounds, force = false) => {
    const state = get();
    const categories = state.categories;
    if (bounds.north - bounds.south > 1.5 || bounds.east - bounds.west > 1.5 || bounds.east <= bounds.west || bounds.north <= bounds.south) {
      requestVersion++;
      set({ error: 'zoom', errorMessage: undefined, loading: false, places: [], lastLoadedBounds: undefined });
      return;
    }
    if (categories.length === 0) {
      requestVersion++;
      set({ places: [], truncated: false, loading: false, error: undefined, errorMessage: undefined, lastLoadedBounds: bounds, loadedAt: Date.now() });
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
      const results = await Promise.all(categories.map((category) => services.tourismPlaces.list(expanded, { category })));
      if (version !== requestVersion) return;
      const unique = new Map<string, TourismPlace>();
      for (const place of results.flatMap((result) => result.places)) {
        if (hasValidPlaceCoordinate(place) && !unique.has(place.id)) unique.set(place.id, place);
      }
      set({
        places: [...unique.values()].sort((a, b) => a.nameEn.localeCompare(b.nameEn) || a.id.localeCompare(b.id)),
        truncated: results.some((result) => result.truncated),
        loading: false,
        lastLoadedBounds: expanded,
        loadedAt: Date.now(),
        errorMessage: undefined,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown tourism places load failure';
      console.warn('Tourism places load failed', { categories, bounds: expanded, error });
      if (version === requestVersion) set({ loading: false, error: 'load', errorMessage: message, lastLoadedBounds: undefined });
    }
  },
}));
