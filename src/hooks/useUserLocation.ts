import { useCallback, useEffect, useState } from 'react';
import * as Location from 'expo-location';
import type { GeoPoint } from '@/types';

export type LocationStatus = 'idle' | 'requesting' | 'granted' | 'denied' | 'unavailable';

/**
 * GPS is treated as a nice-to-have, never a requirement: the map falls back to
 * central Ramallah and the user can still pick a zone by tapping it, scanning a
 * QR code or typing the zone code.
 */
export function useUserLocation(enabled = true) {
  const [status, setStatus] = useState<LocationStatus>('idle');
  const [location, setLocation] = useState<GeoPoint | undefined>();

  const request = useCallback(async () => {
    setStatus('requesting');
    try {
      const { status: permission } = await Location.requestForegroundPermissionsAsync();
      if (permission !== 'granted') {
        setStatus('denied');
        return undefined;
      }

      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const point: GeoPoint = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      };
      setLocation(point);
      setStatus('granted');
      return point;
    } catch {
      // Permission dialogs and GPS both fail in plenty of ordinary ways
      // (airplane mode, emulator without a fix). None should break the map.
      setStatus('unavailable');
      return undefined;
    }
  }, []);

  useEffect(() => {
    if (!enabled || status !== 'idle') return;
    void request();
  }, [enabled, status, request]);

  return { location, status, request };
}
