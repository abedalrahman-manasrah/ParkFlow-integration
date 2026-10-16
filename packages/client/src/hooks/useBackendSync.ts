import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { io } from 'socket.io-client';
import type { AppNotification } from '@parkflow/contracts';
import { useAuthStore } from '../store/authStore';
import { usePreferencesStore } from '../store/preferencesStore';
import { useInAppNotificationStore } from '../store/inAppNotificationStore';
import { API_BASE_URL, api, refreshSession } from '../services/http/apiClient';
import { retryQueue } from '../offline/retryQueue';
import { isWebSession, sessionIdentity, socketSessionOptions } from '../services/http/browserSession';

export function useBackendSync() {
  const session = useAuthStore(s => s.session);
  const client = useQueryClient();
  useEffect(() => { client.clear(); }, [session?.userId, client]);

  useEffect(() => {
    if (!session || !API_BASE_URL) return;
    const identity = sessionIdentity(session);
    const current = () => sessionIdentity(useAuthStore.getState().session) === identity;
    const socket = io(API_BASE_URL.replace(/\/api\/v1$/, ''), {
      ...socketSessionOptions(session), reconnection: true,
    });
    const invalidate = (keys: string[]) => {
      if (!current()) return;
      for (const key of keys) void client.invalidateQueries({ queryKey: [key] });
    };
    socket.on('checkpoint.updated', () => invalidate(['roads', 'route']));
    socket.on('parking.availability.updated', () => invalidate(['zones', 'zone']));
    socket.on('parking.zone.updated', () => invalidate(['zones', 'zone', 'reservation-quote']));
    socket.on('parking.session.updated', () => invalidate(['sessions', 'session', 'wallet', 'transactions', 'trust']));
    socket.on('notification.created', (notification?: AppNotification) => {
      if (!current()) return;
      invalidate(['notifications', 'wallet', 'transactions', 'violations', 'trust', 'rides', 'ride', 'spots', 'spot', 'gate-visits']);
      useInAppNotificationStore.getState().show(notification);
    });
    socket.on('trust.updated', () => invalidate(['trust']));
    socket.on('connect', () => { if (current()) void client.invalidateQueries(); });
    socket.on('connect_error', (error: Error) => {
      if (current() && (Date.parse(session.expiresAt) <= Date.now() + 30000
        || (isWebSession(session) && ['UNAUTHORIZED', 'SESSION_CHANGED'].includes(error.message)))) {
        void refreshSession().catch(() => undefined);
      }
    });
    // Server disconnects do not reconnect automatically. A guarded refresh
    // resumes this login and rejects a different cookie identity.
    socket.on('disconnect', (reason: string) => {
      if (reason === 'io server disconnect' && isWebSession(session) && current()) void refreshSession().catch(() => undefined);
    });
    const timer = setTimeout(() => { if (current()) void refreshSession().catch(() => undefined); },
      Math.max(1000, Date.parse(session.expiresAt) - Date.now() - 30000));
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active' && current()) {
        void client.invalidateQueries();
        void retryQueue.flush();
        if (!socket.connected) socket.connect();
      }
    });
    void retryQueue.flush();
    return () => { clearTimeout(timer); subscription.remove(); socket.disconnect(); };
  }, [sessionIdentity(session), client]);

  useEffect(() => {
    if (!session?.userId || Platform.OS === 'web') return;
    const identity = sessionIdentity(session);
    let cancelled = false;
    const register = async () => {
      const Notifications = await import('expo-notifications');
      const Constants = (await import('expo-constants')).default;
      const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
      if (!projectId) return;
      const permission = await Notifications.getPermissionsAsync();
      if (!permission.granted) return;
      if (Platform.OS === 'android') await Notifications.setNotificationChannelAsync('default', {
        name: 'ParkFlow', importance: Notifications.AndroidImportance.DEFAULT,
      });
      const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
      if (cancelled || sessionIdentity(useAuthStore.getState().session) !== identity) return;
      await api('/notifications/device-tokens', { method: 'POST', body: { token, platform: Platform.OS, provider: 'expo' } });
    };
    void register().catch(() => undefined);
    return () => { cancelled = true; };
  }, [sessionIdentity(session)]);
  const locale = usePreferencesStore(s => s.locale);
  useEffect(() => {
    if (session?.userId) void api('/users/me', { method: 'PATCH', body: { locale } }).catch(() => undefined);
  }, [session?.userId, locale]);
}
