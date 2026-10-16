import { forwardRef, type ReactNode } from 'react';
import { Platform, Pressable, type PressableProps, type ViewStyle, type StyleProp } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { duration, spring } from '@/theme/motion';
import { haptics } from '@/utils/haptics';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export interface PressableScaleProps extends Omit<PressableProps, 'style'> {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** How far the element shrinks on press. Large targets need less. */
  scaleTo?: number;
  /** Dim on press in addition to scaling — used for list rows. */
  dimTo?: number;
  haptic?: 'none' | 'select' | 'light' | 'medium';
}

/**
 * The app's single source of press feedback. Every tappable surface uses this so
 * touch response feels identical everywhere.
 */
export const PressableScale = forwardRef<React.ComponentRef<typeof Pressable>, PressableScaleProps>(
  function PressableScale(
    { children, style, scaleTo = 0.97, dimTo = 1, haptic = 'none', onPressIn, onPressOut, onHoverIn, onHoverOut, disabled, ...rest },
    ref,
  ) {
    const pressed = useSharedValue(0);
    // Desktop web only: a faint lift on hover so pointer users get feedback
    // before they click. Touch devices never fire hover, so they are unaffected.
    const hovered = useSharedValue(0);

    const animatedStyle = useAnimatedStyle(() => ({
      transform: [{ scale: 1 - pressed.value * (1 - scaleTo) }],
      opacity: (1 - pressed.value * (1 - dimTo)) * (1 - hovered.value * 0.06),
    }));

    return (
      <AnimatedPressable
        ref={ref}
        disabled={disabled}
        onHoverIn={(event) => {
          if (Platform.OS === 'web' && !disabled) hovered.value = withTiming(1, { duration: duration.fast });
          onHoverIn?.(event);
        }}
        onHoverOut={(event) => {
          if (Platform.OS === 'web') hovered.value = withTiming(0, { duration: duration.fast });
          onHoverOut?.(event);
        }}
        onPressIn={(event) => {
          pressed.value = withTiming(1, { duration: duration.instant });
          if (haptic === 'select') haptics.select();
          if (haptic === 'light') haptics.light();
          if (haptic === 'medium') haptics.medium();
          onPressIn?.(event);
        }}
        onPressOut={(event) => {
          pressed.value = withSpring(0, spring.press);
          onPressOut?.(event);
        }}
        style={[style, animatedStyle]}
        {...rest}
      >
        {children}
      </AnimatedPressable>
    );
  },
);
