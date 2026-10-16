import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { PressableScale } from './PressableScale';
import { useTheme } from '@/theme/ThemeProvider';
import { radius } from '@/theme/radius';
import { spacing } from '@/theme/spacing';
import { shadow, type ShadowLevel } from '@/theme/shadows';

export interface CardProps {
  children: ReactNode;
  /** `plain` sits on the background, `raised` lifts off it, `outline` is flat. */
  tone?: 'plain' | 'raised' | 'outline' | 'sunken' | 'brand';
  padding?: keyof typeof spacing;
  radiusToken?: keyof typeof radius;
  elevation?: ShadowLevel;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  testID?: string;
}

export function Card({
  children,
  tone = 'raised',
  padding = 'xl',
  radiusToken = 'xl',
  elevation,
  onPress,
  style,
  accessibilityLabel,
  testID,
}: CardProps) {
  const { colors } = useTheme();

  const toneStyle: ViewStyle =
    tone === 'outline'
      ? { backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth * 2, borderColor: colors.border }
      : tone === 'sunken'
        ? { backgroundColor: colors.surfaceSunken }
        : tone === 'brand'
          ? { backgroundColor: colors.brandSofter }
          : tone === 'plain'
            ? { backgroundColor: colors.surface }
            : { backgroundColor: colors.surface, ...shadow[elevation ?? 'sm'] };

  const content = (
    <View
      style={[
        { padding: spacing[padding], borderRadius: radius[radiusToken] },
        toneStyle,
        elevation && tone !== 'raised' ? shadow[elevation] : null,
        style,
      ]}
    >
      {children}
    </View>
  );

  if (!onPress) return content;

  return (
    <PressableScale
      testID={testID}
      onPress={onPress}
      haptic="select"
      scaleTo={0.985}
      dimTo={0.92}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      {content}
    </PressableScale>
  );
}
