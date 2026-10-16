import { useEffect, type ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { useTheme } from '@/theme/ThemeProvider';
import { duration, easing } from '@/theme/motion';
import { useInstantMotion } from '@/hooks/useInstantMotion';

export interface TimerRingProps {
  /** 0–1. Undefined means "running, but with no known end" — track only. */
  progress?: number;
  size?: number;
  strokeWidth?: number;
  /** Switches the ring to the danger colour once time is up. */
  overstay?: boolean;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}

/**
 * The ring around the live parking timer.
 *
 * It carries real information: how much of the maximum stay (or of the prepaid
 * time) has been consumed. Zones with no limit get the track and the glow but no
 * arc, because inventing a progress value there would be a lie.
 *
 * The arc is driven straight from the derived elapsed time rather than an
 * animation, so it stays correct after a cold start — the breathing glow is the
 * only part that animates.
 */
export function TimerRing({
  progress,
  size = 260,
  strokeWidth = 8,
  overstay = false,
  children,
  style,
}: TimerRingProps) {
  const { colors } = useTheme();
  const instant = useInstantMotion();

  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = progress == null ? undefined : Math.min(1, Math.max(0, progress));

  const glow = useSharedValue(0);

  useEffect(() => {
    if (instant || overstay) return;
    glow.value = withRepeat(
      withSequence(
        withTiming(1, { duration: duration.pulse, easing: easing.standard }),
        withTiming(0, { duration: duration.pulse, easing: easing.standard }),
      ),
      -1,
      false,
    );
  }, [glow, instant, overstay]);

  const glowStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + glow.value * 0.06 }],
    opacity: 0.04 + glow.value * 0.04,
  }));

  const arcColor = overstay ? colors.danger : colors.accent;

  return (
    <View
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
            backgroundColor: arcColor,
          },
          glowStyle,
        ]}
      />

      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        <Defs>
          <LinearGradient id="ringArc" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={overstay ? colors.danger : colors.accent} />
            <Stop offset="1" stopColor={colors.onDeepMuted} />
          </LinearGradient>
        </Defs>

        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="rgba(255,255,255,0.12)"
          strokeWidth={strokeWidth}
          fill="none"
        />

        {clamped != null ? (
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke="url(#ringArc)"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            fill="none"
            strokeDasharray={`${circumference} ${circumference}`}
            strokeDashoffset={circumference * (1 - clamped)}
            // Start the arc at 12 o'clock instead of 3.
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        ) : null}
      </Svg>

      <View style={{ alignItems: 'center', justifyContent: 'center' }}>{children}</View>
    </View>
  );
}
