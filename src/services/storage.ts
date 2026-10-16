import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * Two storage tiers with one interface:
 *  - `secureStorage` for tokens and session data (Keychain / Keystore).
 *  - `appStorage`    for non-sensitive cached preferences.
 *
 * SecureStore has no web implementation, so the web build transparently falls
 * back to AsyncStorage. That is fine for the browser preview and keeps the
 * native builds — the ones that ship — properly secured.
 */
export interface KeyValueStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export const appStorage: KeyValueStorage = {
  getItem: (key) => AsyncStorage.getItem(key),
  setItem: (key, value) => AsyncStorage.setItem(key, value),
  removeItem: (key) => AsyncStorage.removeItem(key),
};

const secureAvailable = Platform.OS === 'ios' || Platform.OS === 'android';

export const secureStorage: KeyValueStorage = secureAvailable
  ? {
      getItem: (key) => SecureStore.getItemAsync(key),
      setItem: (key, value) => SecureStore.setItemAsync(key, value),
      removeItem: (key) => SecureStore.deleteItemAsync(key),
    }
  : appStorage;

export const STORAGE_KEYS = {
  authSession: 'sp.auth.session',
  preferences: 'sp.preferences',
  mapLayers: 'sp.map.layers',
  mockDb: 'sp.mock.db',
  /** Crash events from the Android service that could not be uploaded yet. */
  pendingCrashEvents: 'sp.crash.pending',
} as const;

/** Zustand `persist` adapter shape. */
export const zustandStorage = (storage: KeyValueStorage) => ({
  getItem: async (name: string) => {
    const value = await storage.getItem(name);
    return value ? (JSON.parse(value) as unknown) : null;
  },
  setItem: async (name: string, value: unknown) => {
    await storage.setItem(name, JSON.stringify(value));
  },
  removeItem: (name: string) => storage.removeItem(name),
});
