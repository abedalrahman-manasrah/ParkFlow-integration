import { create } from 'zustand';
import type { AppNotification } from '@/types';

interface InAppNotificationState {
  /** The notification currently shown as an on-screen banner. */
  current?: AppNotification;
  /** Ids already shown, so the API response and the socket echo pop it only once. */
  shown: Set<string>;
  show: (notification?: AppNotification | null) => void;
  dismiss: () => void;
}

/** Holds the latest live notification so the banner can pop over any screen. */
export const useInAppNotificationStore = create<InAppNotificationState>((set, get) => ({
  current: undefined,
  shown: new Set(),
  show: (notification) => {
    if (!notification?.id || get().shown.has(notification.id)) return;
    get().shown.add(notification.id);
    set({ current: notification });
  },
  dismiss: () => set({ current: undefined }),
}));
