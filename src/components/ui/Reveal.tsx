import { useEffect, type ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { duration as motionDuration, easing } from '@/theme/motion';
import { useInstantMotion } from '@/hooks/useInstantMotion';

export interface RevealProps {
  children: ReactNode;
  /** Stagger in ms — use increasing values down a screen. */
  delay?: number;
  /** Distance travelled during the fade, in px. 0 fades only. */
  offset?: number;
  duration?: number;
  style?: StyleProp<ViewStyle>;
}

/**
 * The app's entrance animation.
 *
 * Driven by a mount effect rather than Reanimated's `entering` layout
 * animations, which can fail to start and leave the element `visibility:
 * hidden`. It also collapses to the final state whenever motion is reduced or
 * no animation frames are available — the content must never depend on the
 * animation actually running in order to be seen.
 */
export function Reveal({
  children,
  delay = 0,
  offset = 14,
  duration = motionDuration.slow,
  style,
}: RevealProps) {
  const instant = useInstantMotion();
  const progress = useSharedValue(instant ? 1 : 0);

  useEffect(() => {
    if (instant) {
      progress.value = 1;
      return;
    }
    progress.value = withDelay(delay, withTiming(1, { duration, easing: easing.emphasized }));
  }, [delay, duration, instant, progress]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * offset }],
  }));

  return <Animated.View style={[style, animatedStyle]}>{children}</Animated.View>;
}
