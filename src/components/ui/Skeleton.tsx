import { useEffect } from 'react';
import { View, type StyleProp, type ViewStyle, type DimensionValue } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  interpolateColor,
} from 'react-native-reanimated';
import { useTheme } from '@/theme/ThemeProvider';
import { radius } from '@/theme/radius';
import { duration, easing } from '@/theme/motion';

export interface SkeletonProps {
  width?: DimensionValue;
  height?: number;
  radiusToken?: keyof typeof radius;
  style?: StyleProp<ViewStyle>;
}

/**
 * A soft colour pulse rather than a sliding highlight — cheaper on low-end
 * Android and calmer to look at when several are on screen at once.
 */
export function Skeleton({ width = '100%', height = 16, radiusToken = 'sm', style }: SkeletonProps) {
  const { colors } = useTheme();
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withRepeat(
      withTiming(1, { duration: duration.pulse / 2, easing: easing.standard }),
      -1,
      true,
    );
  }, [progress]);

  const animatedStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      progress.value,
      [0, 1],
      [colors.skeleton, colors.skeletonHighlight],
    ),
  }));

  return (
    <Animated.View
      accessibilityRole="progressbar"
      style={[{ width, height, borderRadius: radius[radiusToken] }, animatedStyle, style]}
    />
  );
}

/** Convenience stack for list placeholders. */
export function SkeletonGroup({
  count = 3,
  height = 76,
  gap = 12,
  style,
}: {
  count?: number;
  height?: number;
  gap?: number;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[{ gap }, style]}>
      {Array.from({ length: count }).map((_, index) => (
        <Skeleton key={index} height={height} radiusToken="xl" />
      ))}
    </View>
  );
}
