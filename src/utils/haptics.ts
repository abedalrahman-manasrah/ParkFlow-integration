import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

/**
 * Thin wrapper so screens never import expo-haptics directly and so haptics are
 * a silent no-op on web instead of throwing.
 */
const enabled = Platform.OS === 'ios' || Platform.OS === 'android';

const run = (fn: () => Promise<void>) => {
  if (!enabled) return;
  void fn().catch(() => {
    /* haptics are decorative — never surface a failure */
  });
};

export const haptics = {
  /** Selection changes: vehicle picker, filter chips, duration options. */
  select: () => run(() => Haptics.selectionAsync()),
  light: () => run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  medium: () => run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)),
  heavy: () => run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy)),
  /** Reserved for real outcomes: parking started/stopped, payment done. */
  success: () => run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  warning: () => run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
  error: () => run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)),
};
