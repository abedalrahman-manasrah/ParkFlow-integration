import { create } from 'zustand';
import type { GeoPoint } from '@/types';

interface ReservationRouteState {
  pendingZoneId?: string;
  origin?: GeoPoint;
  originMode?: 'test' | 'gps';
  request: (zoneId: string) => void;
  setOrigin: (origin?: GeoPoint, mode?: 'test' | 'gps') => void;
  consume: () => void;
}

export const useReservationRouteStore = create<ReservationRouteState>((set) => ({
  request: (pendingZoneId) => set({ pendingZoneId }),
  setOrigin: (origin, originMode) => set({ origin, originMode: origin ? originMode : undefined }),
  consume: () => set({ pendingZoneId: undefined }),
}));
