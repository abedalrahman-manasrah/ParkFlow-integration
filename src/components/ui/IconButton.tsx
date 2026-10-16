import type { ReactNode } from 'react';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { PressableScale } from './PressableScale';
import { useTheme } from '@/theme/ThemeProvider';
import { radius } from '@/theme/radius';
import { shadow } from '@/theme/shadows';

export type IconButtonTone = 'surface' | 'ghost' | 'brand' | 'glass' | 'deep' | 'danger';

export interface IconButtonProps {
  icon: ReactNode;
  onPress?: () => void;
  tone?: IconButtonTone;
  size?: number;
  disabled?: boolean;
  /** Required: icon-only controls have no visible label. */
  accessibilityLabel: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function IconButton({
  icon,
  onPress,
  tone = 'surface',
  size = 44,
  disabled = false,
  accessibilityLabel,
  style,
  testID,
}: IconButtonProps) {
  const { colors } = useTheme();

  const toneStyle: ViewStyle = {
    surface: { backgroundColor: colors.surface, ...shadow.sm },
    ghost: { backgroundColor: 'transparent' },
    brand: { backgroundColor: colors.brand, ...shadow.sm },
    glass: {
      backgroundColor: colors.glass,
      borderWidth: StyleSheet.hairlineWidth * 2,
      borderColor: colors.glassBorder,
      ...shadow.sm,
    },
    deep: { backgroundColor: colors.deep },
    danger: { backgroundColor: colors.dangerSoft },
  }[tone];

  return (
    <PressableScale
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      haptic="light"
      scaleTo={0.92}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      hitSlop={6}
      style={[
        {
          width: size,
          height: size,
          borderRadius: radius.pill,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: disabled ? 0.4 : 1,
        },
        toneStyle,
        style,
      ]}
    >
      {icon}
    </PressableScale>
  );
}
