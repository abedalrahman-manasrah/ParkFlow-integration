import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { NotificationPreferences } from '@/types';
import { DEFAULT_LOCALE, type Locale } from '@/i18n';
import { appStorage, STORAGE_KEYS } from '@/services/storage';

export type ThemeMode = 'light' | 'dark' | 'system';

interface PreferencesState {
  locale: Locale;
  /** False for old installs that still had the original English default. */
  localeChosen: boolean;
  themeMode: ThemeMode;
  /** Which of the user's vehicles the map / start-parking flow is aimed at. */
  selectedVehicleId?: string;
  notifications: NotificationPreferences;
  /** True once the first-run flow (email -> name -> vehicle) has finished. */
  onboardingComplete: boolean;
  /** Speak parking-time alerts aloud. Opt-in, kept on this device only. */
  voiceAlerts: boolean;
  /** Language the microphone listens in. Separate from the app language. */
  voiceLanguage: 'ar' | 'en';
  /** Watch for crashes while driving and call for help if the driver does not answer. */
  crashDetection: boolean;
  /** Notification and call permissions are asked once, the first time crash detection turns on. */
  crashPermissionsAsked: boolean;
  /** True once persisted preferences have been read — describes this run only. */
  hydrated: boolean;

  setLocale: (locale: Locale) => void;
  setThemeMode: (mode: ThemeMode) => void;
  setSelectedVehicleId: (id?: string) => void;
  setNotificationPreference: (key: keyof NotificationPreferences, value: boolean) => void;
  completeOnboarding: () => void;
  setVoiceAlerts: (enabled: boolean) => void;
  setVoiceLanguage: (language: 'ar' | 'en') => void;
  setCrashDetection: (enabled: boolean) => void;
  markCrashPermissionsAsked: () => void;
  setHydrated: () => void;
  reset: () => void;
}

const defaultNotifications: NotificationPreferences = {
  parkingReminders: true,
  expiryWarnings: true,
  lowBalance: true,
  violations: true,
  promotions: false,
};

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set) => ({
      locale: DEFAULT_LOCALE,
      localeChosen: false,
      themeMode: 'light',
      selectedVehicleId: undefined,
      notifications: defaultNotifications,
      onboardingComplete: false,
      voiceAlerts: false,
      voiceLanguage: 'ar',
      crashDetection: true,
      crashPermissionsAsked: false,
      hydrated: false,

      setLocale: (locale) => set({ locale, localeChosen: true }),
      setThemeMode: (themeMode) => set({ themeMode }),
      setSelectedVehicleId: (selectedVehicleId) => set({ selectedVehicleId }),
      setNotificationPreference: (key, value) =>
        set((state) => ({ notifications: { ...state.notifications, [key]: value } })),
      completeOnboarding: () => set({ onboardingComplete: true }),
      setVoiceAlerts: (voiceAlerts) => set({ voiceAlerts }),
      setVoiceLanguage: (voiceLanguage) => set({ voiceLanguage }),
      setCrashDetection: (crashDetection) => set({ crashDetection }),
      markCrashPermissionsAsked: () => set({ crashPermissionsAsked: true }),
      setHydrated: () => set({ hydrated: true }),
      reset: () =>
        set({
          locale: DEFAULT_LOCALE,
          localeChosen: false,
          selectedVehicleId: undefined,
          notifications: defaultNotifications,
          onboardingComplete: false,
        }),
    }),
    {
      name: STORAGE_KEYS.preferences,
      version: 2,
      storage: createJSONStorage(() => ({
        getItem: (name) => appStorage.getItem(name),
        setItem: (name, value) => appStorage.setItem(name, value),
        removeItem: (name) => appStorage.removeItem(name),
      })),
      migrate: (persisted) => {
        const state = persisted as Partial<PreferencesState> | undefined;
        if (!state) return persisted;
        return {
          ...state,
          locale: state.localeChosen ? state.locale ?? DEFAULT_LOCALE : DEFAULT_LOCALE,
          localeChosen: Boolean(state.localeChosen),
        };
      },
      partialize: (state) => ({
        locale: state.locale,
        localeChosen: state.localeChosen,
        themeMode: state.themeMode,
        selectedVehicleId: state.selectedVehicleId,

        onboardingComplete: state.onboardingComplete,
        voiceAlerts: state.voiceAlerts,
        voiceLanguage: state.voiceLanguage,
        crashDetection: state.crashDetection,
        crashPermissionsAsked: state.crashPermissionsAsked,
      }),
      onRehydrateStorage: () => (state) => state?.setHydrated(),
    },
  ),
);
