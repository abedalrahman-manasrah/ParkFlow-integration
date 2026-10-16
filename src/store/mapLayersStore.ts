import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { appStorage, STORAGE_KEYS } from '@/services/storage';
import {
  BUSINESS_OFFERS_AVAILABLE,
  isCarServiceCategory,
  isTourismPlaceCategory,
  isAvailablePrimaryCategory,
  type CarServiceCategory,
  type PrimaryMapCategory,
  type TourismPlaceCategory,
} from '@/types';

interface PersistedMapLayers {
  primaryCategory: PrimaryMapCategory;
  roadReportsEnabled: boolean;
  businessOffersEnabled: boolean;
  accessibleParkingOnly: boolean;
  carServiceCategory: CarServiceCategory;
  tourismPlaceCategories: TourismPlaceCategory[];
}

interface MapLayersState extends PersistedMapLayers {
  setPrimaryCategory: (category: PrimaryMapCategory) => void;
  setRoadReportsEnabled: (enabled: boolean) => void;
  setBusinessOffersEnabled: (enabled: boolean) => void;
  setAccessibleParkingOnly: (enabled: boolean) => void;
  setCarServiceCategory: (category: CarServiceCategory) => void;
  toggleTourismPlaceCategory: (category: TourismPlaceCategory) => void;
  resetLayers: () => void;
}

const defaults: PersistedMapLayers = {
  primaryCategory: 'parking',
  roadReportsEnabled: true,
  businessOffersEnabled: false,
  accessibleParkingOnly: false,
  carServiceCategory: 'car_wash',
  tourismPlaceCategories: ['historic_landmark'],
};

export const useMapLayersStore = create<MapLayersState>()(
  persist(
    (set) => ({
      ...defaults,
      setPrimaryCategory: (primaryCategory) => {
        if (isAvailablePrimaryCategory(primaryCategory)) set({ primaryCategory });
      },
      setRoadReportsEnabled: (roadReportsEnabled) => set({ roadReportsEnabled }),
      setBusinessOffersEnabled: (businessOffersEnabled) => {
        if (BUSINESS_OFFERS_AVAILABLE) set({ businessOffersEnabled });
      },
      setAccessibleParkingOnly: (accessibleParkingOnly) => set({ accessibleParkingOnly }),
      setCarServiceCategory: (carServiceCategory) => set({ carServiceCategory }),
      toggleTourismPlaceCategory: (category) => set({ tourismPlaceCategories: [category] }),
      resetLayers: () => set(defaults),
    }),
    {
      name: STORAGE_KEYS.mapLayers,
      storage: createJSONStorage(() => appStorage),
      partialize: ({ primaryCategory, roadReportsEnabled, businessOffersEnabled, accessibleParkingOnly, carServiceCategory, tourismPlaceCategories }) => ({
        primaryCategory,
        roadReportsEnabled,
        businessOffersEnabled,
        accessibleParkingOnly,
        carServiceCategory,
        tourismPlaceCategories,
      }),
      merge: (persisted, current) => {
        const stored = persisted as Partial<PersistedMapLayers>;
        const storedTourismCategories = Array.isArray(stored.tourismPlaceCategories)
          ? stored.tourismPlaceCategories.filter(isTourismPlaceCategory).slice(0, 1)
          : [];
        return {
          ...current,
          primaryCategory: isAvailablePrimaryCategory(stored.primaryCategory)
            ? stored.primaryCategory
            : defaults.primaryCategory,
          roadReportsEnabled: typeof stored.roadReportsEnabled === 'boolean'
            ? stored.roadReportsEnabled
            : defaults.roadReportsEnabled,
          businessOffersEnabled: BUSINESS_OFFERS_AVAILABLE && stored.businessOffersEnabled === true,
          accessibleParkingOnly: typeof stored.accessibleParkingOnly === 'boolean'
            ? stored.accessibleParkingOnly
            : defaults.accessibleParkingOnly,
          carServiceCategory: isCarServiceCategory(stored.carServiceCategory)
            ? stored.carServiceCategory
            : defaults.carServiceCategory,
          tourismPlaceCategories: storedTourismCategories.length ? storedTourismCategories : defaults.tourismPlaceCategories,
        };
      },
    },
  ),
);
