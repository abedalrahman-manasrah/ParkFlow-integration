import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';
import type { CrashEventInput } from '@/types';

/** Texts and settings the Android service keeps so it can work with the app closed. */
export interface NativeCrashConfig {
  callNumber: string;
  countdownSeconds: number;
  rtl: boolean;
  'text.title': string;
  'text.body': string;
  'text.callingIn': string;
  'text.imOk': string;
  'text.callNow': string;
  'text.monitorTitle': string;
  'text.monitorBody': string;
  'text.monitorChannel': string;
  'text.alertChannel': string;
}

interface ParkFlowCrashDetectionModule {
  start(config: NativeCrashConfig): boolean;
  stop(): boolean;
  isRunning(): boolean;
  consumeEvents(): CrashEventInput[];
  simulate(): boolean;
}

/**
 * The background crash-detection service from modules/crash-detection.
 * Only present in Android builds; null on iOS, the web and Expo Go, where the
 * in-app detector in useCrashDetection takes over.
 */
export const nativeCrashDetection: ParkFlowCrashDetectionModule | null =
  Platform.OS === 'android' ? requireOptionalNativeModule<ParkFlowCrashDetectionModule>('ParkFlowCrashDetection') : null;
