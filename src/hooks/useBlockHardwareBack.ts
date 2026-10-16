import { useCallback } from 'react';
import { BackHandler } from 'react-native';
import { useFocusEffect } from 'expo-router';

/**
 * Swallows the Android hardware back button while the screen is focused.
 *
 * Used on the onboarding steps that run *after* the account already exists
 * (name, first vehicle). Backing out of those would land the user on the phone
 * or OTP screen for an account they have already verified — a dead end. Those
 * steps offer "Skip for now" instead, which is the real way out.
 *
 * iOS has no hardware back; the matching swipe gesture is disabled in the
 * onboarding stack's screen options.
 */
export function useBlockHardwareBack(enabled = true) {
  useFocusEffect(
    useCallback(() => {
      if (!enabled) return;
      const subscription = BackHandler.addEventListener('hardwareBackPress', () => true);
      return () => subscription.remove();
    }, [enabled]),
  );
}
