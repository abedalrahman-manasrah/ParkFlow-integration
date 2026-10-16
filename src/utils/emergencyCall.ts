import { Linking, PermissionsAndroid, Platform } from 'react-native';
import type { CrashEventOutcome } from '@/types';

const CALL_ACTION = 'android.intent.action.CALL';

/**
 * Asks once for permission to place calls directly. Without it the app can
 * still open the dialer with the number filled in, but the driver has to tap.
 */
export async function ensureCallPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  const permission = PermissionsAndroid.PERMISSIONS.CALL_PHONE;
  if (await PermissionsAndroid.check(permission)) return true;
  const result = await PermissionsAndroid.request(permission);
  return result === PermissionsAndroid.RESULTS.GRANTED;
}

/**
 * Places the emergency call. On Android with the call permission it dials
 * straight away (no tap needed — the driver may be unable to). Everywhere else
 * it opens the dialer with the number ready, which is all iOS allows.
 */
export async function placeEmergencyCall(number: string): Promise<CrashEventOutcome> {
  const tel = `tel:${number.replace(/[^\d+]/g, '')}`;
  try {
    if (Platform.OS === 'android' && (await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.CALL_PHONE))) {
      const IntentLauncher = await import('expo-intent-launcher');
      // The promise settles when the call screen closes, so do not wait on it.
      void IntentLauncher.startActivityAsync(CALL_ACTION, { data: tel }).catch(() => Linking.openURL(tel));
      return 'called';
    }
    await Linking.openURL(tel);
    return 'called';
  } catch {
    return 'call_failed';
  }
}
