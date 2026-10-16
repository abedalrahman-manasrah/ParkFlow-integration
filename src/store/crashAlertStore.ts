import { create } from 'zustand';
import type { CrashDetection } from '@/utils/crashDetector';
import type { GeoPoint } from '@/types';

export interface CrashAlert {
  detection: CrashDetection;
  detectedAt: string;
  location?: GeoPoint;
}

interface CrashAlertState {
  /** Set when a possible crash is detected; drives the full-screen countdown. */
  alert?: CrashAlert;
  raise: (alert: CrashAlert) => void;
  clear: () => void;
}

export const useCrashAlertStore = create<CrashAlertState>((set, get) => ({
  alert: undefined,
  // A second detection while the countdown is up must not restart it.
  raise: (alert) => {
    if (!get().alert) set({ alert });
  },
  clear: () => set({ alert: undefined }),
}));
