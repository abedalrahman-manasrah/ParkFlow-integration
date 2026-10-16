import { useEffect } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Check } from 'lucide-react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { duration, easing, spring } from '@/theme/motion';
import { haptics } from '@/utils/haptics';
import { useInstantMotion } from '@/hooks/useInstantMotion';

export interface SuccessCheckProps {
  size?: number;
  tone?: 'brand' | 'onDeep';
  /** Fires the success haptic when the animation starts. */
  withHaptic?: boolean;
  style?: StyleProp<ViewStyle>;
}

/**
 * The confirmation mark used after parking stops, top-ups and appeals: a ring
 * expands, the disc pops in, then the tick settles. Deliberately quick — this
 * appears in front of information the user wants to read.
 */
export function SuccessCheck({
  size = 96,
  tone = 'brand',
  withHaptic = true,
  style,
}: SuccessCheckProps) {
  const { colors } = useTheme();

  const instant = useInstantMotion();
  const disc = useSharedValue(instant ? 1 : 0);
  const ring = useSharedValue(instant ? 1 : 0);
  const tick = useSharedValue(instant ? 1 : 0);

  useEffect(() => {
    if (withHaptic) haptics.success();
    if (instant) {
      // No frames to animate on — show the finished mark rather than nothing.
      disc.value = 1;
      ring.value = 1;
      tick.value = 1;
      return;
    }
    disc.value = withSpring(1, spring.bouncy);
    ring.value = withDelay(60, withTiming(1, { duration: duration.slower, easing: easing.decelerate }));
    tick.value = withDelay(
      140,
      withSequence(withSpring(1.14, spring.bouncy), withSpring(1, spring.press)),
    );
  }, [disc, ring, tick, instant, withHaptic]);

  const discStyle = useAnimatedStyle(() => ({
    transform: [{ scale: disc.value }],
    opacity: disc.value,
  }));

  const ringStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + ring.value * 0.45 }],
    opacity: (1 - ring.value) * 0.35,
  }));

  const tickStyle = useAnimatedStyle(() => ({
    transform: [{ scale: tick.value }],
    opacity: tick.value > 0 ? 1 : 0,
  }));

  const accent = tone === 'onDeep' ? colors.accent : colors.brand;
  const foreground = tone === 'onDeep' ? colors.deep : colors.onBrand;

  return (
    <View
      accessibilityRole="image"
      accessibilityLabel="Success"
      style={[{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }, style]}
    >
      <Animated.View
        pointerEvents="none"
        style={[
          {
            position: 'absolute',
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: accent,
          },
          ringStyle,
        ]}
      />
      <Animated.View
        style={[
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: accent,
            alignItems: 'center',
            justifyContent: 'center',
          },
          discStyle,
        ]}
      >
        <Animated.View style={tickStyle}>
          <Check size={size * 0.44} color={foreground} strokeWidth={3.2} />
        </Animated.View>
      </Animated.View>
    </View>
  );
}
