import { useEffect, useRef } from 'react';
import { AppState, PermissionsAndroid, Platform } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import * as Location from 'expo-location';
import { services } from '@/services';
import { useAuthStore } from '@/store/authStore';
import { usePreferencesStore } from '@/store/preferencesStore';
import { useCrashAlertStore } from '@/store/crashAlertStore';
import { CrashDetector } from '@/utils/crashDetector';
import { nativeCrashDetection } from '@/utils/crashDetectionNative';
import { appStorage, STORAGE_KEYS } from '@/services/storage';
import { useLocale } from '@/hooks/useLocale';
import type { CrashEventInput, EmergencyConfig, GeoPoint } from '@/types';

const MOTION_INTERVAL_MS = 20;
const G = 9.80665;

export function useEmergencyConfig() {
  const signedIn = useAuthStore((s) => Boolean(s.session));
  return useQuery({
    queryKey: ['emergency', 'config'],
    queryFn: () => services.emergency.config(),
    // Crash detection never runs on the web, so there is nothing to configure there.
    enabled: signedIn && Platform.OS !== 'web',
    staleTime: 10 * 60_000,
  });
}

/**
 * Crash detection for the whole app. On Android builds it runs as a background
 * service (modules/crash-detection), so it keeps working with the app closed;
 * elsewhere it runs in the app while it is open.
 *
 * Nothing runs on the web, when the driver turned it off, or until the server
 * has an emergency number configured.
 */
export function useCrashDetection() {
  const signedIn = useAuthStore((s) => Boolean(s.session));
  const enabledByUser = usePreferencesStore((s) => s.crashDetection);
  const { data: config } = useEmergencyConfig();
  const active = signedIn && Platform.OS !== 'web' && enabledByUser && Boolean(config?.enabled);
  // Only a definite "no" stops the service; a config still loading (or offline) leaves it as it is.
  const disabled = !signedIn || !enabledByUser || config?.enabled === false;

  useBackgroundCrashService(active, disabled, config);
  useInAppCrashDetection(active && !nativeCrashDetection);
  useCrashEventUpload(signedIn);
}

/** Starts or stops the Android background service to match the settings. */
function useBackgroundCrashService(active: boolean, disabled: boolean, config?: EmergencyConfig) {
  const { t, isRTL } = useLocale();
  const permissionsAsked = usePreferencesStore((s) => s.crashPermissionsAsked);
  const markPermissionsAsked = usePreferencesStore((s) => s.markCrashPermissionsAsked);

  useEffect(() => {
    const native = nativeCrashDetection;
    if (!native) return;
    if (disabled) {
      native.stop();
      return;
    }
    const callNumber = config?.callNumber;
    if (!active || !config || !callNumber) return;

    const start = () =>
      native.start({
        callNumber,
        countdownSeconds: config.countdownSeconds,
        rtl: isRTL,
        'text.title': t('crash.title'),
        'text.body': t('crash.body'),
        'text.callingIn': t('crash.callingIn', { seconds: '{seconds}' }),
        'text.imOk': t('crash.imOk'),
        'text.callNow': t('crash.callNow'),
        'text.monitorTitle': t('crash.monitorTitle'),
        'text.monitorBody': t('crash.monitorBody'),
        'text.monitorChannel': t('crash.setting'),
        'text.alertChannel': t('crash.title'),
      });

    const run = async () => {
      if (!permissionsAsked) {
        // Asked once: notifications so the countdown can show, calls so it can dial with no tap.
        const wanted = [PermissionsAndroid.PERMISSIONS.CALL_PHONE];
        if (Number(Platform.Version) >= 33) wanted.push(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
        await PermissionsAndroid.requestMultiple(wanted).catch(() => undefined);
        markPermissionsAsked();
      }
      // Returns false until location access is granted; the app-state listener retries.
      start();
    };
    void run();

    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active' && !native.isRunning()) start();
    });
    return () => subscription.remove();
  }, [active, disabled, config, isRTL, t, permissionsAsked, markPermissionsAsked]);
}

/** Sends the backend what the Android service detected while the app was closed. */
function useCrashEventUpload(signedIn: boolean) {
  useEffect(() => {
    const native = nativeCrashDetection;
    if (!native || !signedIn) return;
    const upload = async () => {
      const stored = await appStorage.getItem(STORAGE_KEYS.pendingCrashEvents).catch(() => null);
      const events: CrashEventInput[] = [
        ...(stored ? (JSON.parse(stored) as CrashEventInput[]) : []),
        ...native.consumeEvents(),
      ];
      if (!events.length) return;
      const failed: CrashEventInput[] = [];
      for (const event of events) {
        await services.emergency.recordCrash(event).catch(() => failed.push(event));
      }
      // Kept for the next try rather than lost when the phone is offline.
      await appStorage
        .setItem(STORAGE_KEYS.pendingCrashEvents, JSON.stringify(failed.slice(-50)))
        .catch(() => undefined);
    };
    void upload();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void upload();
    });
    return () => subscription.remove();
  }, [signedIn]);
}

/**
 * In-app detection for builds without the Android service: GPS speed arms the
 * detector once the car is moving, and motion samples are only read while armed,
 * so a parked phone costs almost nothing. A detection raises the countdown alert.
 */
function useInAppCrashDetection(active: boolean) {
  const lastLocation = useRef<GeoPoint | undefined>(undefined);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    const detector = new CrashDetector();
    let locationSub: Location.LocationSubscription | undefined;
    let motionSub: { remove: () => void } | undefined;
    let armedCheck: ReturnType<typeof setInterval> | undefined;

    const startMotion = async () => {
      if (motionSub) return;
      const { DeviceMotion } = await import('expo-sensors');
      if (cancelled || !(await DeviceMotion.isAvailableAsync())) return;
      DeviceMotion.setUpdateInterval(MOTION_INTERVAL_MS);
      motionSub = DeviceMotion.addListener(({ accelerationIncludingGravity: a }) => {
        if (!a) return;
        const detection = detector.push({ t: Date.now(), x: a.x / G, y: a.y / G, z: a.z / G });
        if (detection) {
          useCrashAlertStore.getState().raise({
            detection,
            detectedAt: new Date(detection.impactAt).toISOString(),
            location: lastLocation.current,
          });
        }
      });
    };
    const stopMotion = () => {
      motionSub?.remove();
      motionSub = undefined;
    };

    const start = async () => {
      // Location permission is asked for by the map; crash detection never prompts on its own.
      const permission = await Location.getForegroundPermissionsAsync();
      if (cancelled || permission.status !== 'granted') return;
      locationSub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, timeInterval: 1000, distanceInterval: 0 },
        (position) => {
          const { latitude, longitude, speed } = position.coords;
          lastLocation.current = { latitude, longitude };
          detector.pushSpeed(Date.now(), Math.max(0, speed ?? 0) * 3.6);
        },
      );
      if (cancelled) locationSub.remove();
      // Read the motion sensors only while the car has recently been moving.
      armedCheck = setInterval(() => {
        if (detector.isArmed(Date.now())) void startMotion();
        else stopMotion();
      }, 2000);
    };

    void start().catch(() => undefined);
    const appState = AppState.addEventListener('change', (state) => {
      if (state !== 'active') stopMotion();
    });

    return () => {
      cancelled = true;
      appState.remove();
      if (armedCheck) clearInterval(armedCheck);
      locationSub?.remove();
      stopMotion();
    };
  }, [active]);
}
