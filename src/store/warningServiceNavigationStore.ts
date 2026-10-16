import { create } from 'zustand';
import type { CarServiceBusiness } from '@/types';

// One-shot map handoff; neither photos nor analysis are persisted.
export const useWarningServiceNavigationStore = create<{
  pending?: CarServiceBusiness;
  open: (service: CarServiceBusiness) => void;
  clear: () => void;
}>(set => ({ open: pending => set({ pending }), clear: () => set({ pending: undefined }) }));
