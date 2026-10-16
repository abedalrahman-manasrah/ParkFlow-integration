import { create } from 'zustand';
import type { AuthSession, User } from '@/types';
import { secureStorage, STORAGE_KEYS } from '@/services/storage';

/**
 * Auth is deliberately NOT using zustand/persist: the token lives in SecureStore
 * and is written explicitly, so we never risk it leaking into a generic
 * AsyncStorage blob alongside preferences.
 */
interface AuthState {
  session?: AuthSession;
  user?: User;
  /** False until SecureStore has been read on boot — gates the router. */
  hydrated: boolean;

  hydrate: () => Promise<void>;
  signIn: (session: AuthSession, user: User) => Promise<void>;
  setUser: (user: User) => void;
  signOut: () => Promise<void>;
}

interface PersistedAuth {
  session: AuthSession;
  user: User;
}

export const useAuthStore = create<AuthState>()((set) => ({
  session: undefined,
  user: undefined,
  hydrated: false,

  hydrate: async () => {
    try {
      if (__DEV__ && process.env.EXPO_PUBLIC_START_FROM_BEGINNING === 'true') {
        await secureStorage.removeItem(STORAGE_KEYS.authSession).catch(() => undefined);
        set({ session: undefined, user: undefined, hydrated: true });
        return;
      }

      const raw = await secureStorage.getItem(STORAGE_KEYS.authSession);
      if (!raw) {
        set({ hydrated: true });
        return;
      }
      const parsed = JSON.parse(raw) as PersistedAuth;
      // A stored user is a rendering cache; the backend refreshes identity and authorizes every request.
      set({ session: parsed.session, user: parsed.user });
      const { api } = await import('@/services/http/apiClient');
      try {
        const user = await api<User>('/auth/me');
        useAuthStore.getState().setUser(user);
      } catch (error) {
        // Preserve the refresh token for a temporary network outage, never for a revoked session.
        if (error instanceof Error && 'code' in error && error.code === 'unauthorized') {
          await useAuthStore.getState().signOut();
        }
      }
      set({ hydrated: true });
    } catch {
      // A corrupt blob must never brick the app — drop it and start signed out.
      await secureStorage.removeItem(STORAGE_KEYS.authSession).catch(() => undefined);
      set({ hydrated: true });
    }
  },

  signIn: async (session, user) => {
    await secureStorage.setItem(STORAGE_KEYS.authSession, JSON.stringify({ session, user }));
    set({ session, user });
  },

  setUser: (user) => {
    set({ user });
    const { session } = useAuthStore.getState();
    if (session) {
      void secureStorage.setItem(STORAGE_KEYS.authSession, JSON.stringify({ session, user }));
    }
  },

  signOut: async () => {
    await secureStorage.removeItem(STORAGE_KEYS.authSession);
    set({ session: undefined, user: undefined });
  },
}));

export const currentUserId = (): string | undefined => useAuthStore.getState().user?.id;
