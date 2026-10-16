import { useMemo, type ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { AppText } from './AppText';
import { PressableScale } from './PressableScale';
import { useTheme } from '@/theme/ThemeProvider';
import { radius } from '@/theme/radius';
import { spacing } from '@/theme/spacing';
import { brandGlow, shadow } from '@/theme/shadows';
import { useLocale } from '@/hooks/useLocale';

export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'tonal'
  | 'ghost'
  | 'ghostInverse'
  | 'danger'
  | 'inverse';
export type ButtonSize = 'lg' | 'md' | 'sm';

export interface AppButtonProps {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  /** Rendered before the label (after it in RTL — the row flips). */
  icon?: ReactNode;
  iconEnd?: ReactNode;
  style?: StyleProp<ViewStyle>;
  accessibilityHint?: string;
  testID?: string;
}

const heights: Record<ButtonSize, number> = { lg: 56, md: 48, sm: 44 };
const paddings: Record<ButtonSize, number> = { lg: spacing.xxl, md: spacing.xl, sm: spacing.lg };

export function AppButton({
  label,
  onPress,
  variant = 'primary',
  size = 'lg',
  disabled = false,
  loading = false,
  fullWidth = true,
  icon,
  iconEnd,
  style,
  accessibilityHint,
  testID,
}: AppButtonProps) {
  const { colors } = useTheme();
  const { row } = useLocale();

  // A button mid-request must not be tappable again — this is what stops double
  // taps from creating two parking sessions or two payments.
  const isBlocked = disabled || loading;

  const { container, textColor, spinnerColor } = useMemo(() => {
    switch (variant) {
      case 'secondary':
        return {
          container: {
            backgroundColor: colors.surface,
            borderWidth: StyleSheet.hairlineWidth * 2,
            borderColor: colors.border,
            ...shadow.xs,
          } as ViewStyle,
          textColor: colors.text,
          spinnerColor: colors.text,
        };
      case 'tonal':
        return {
          container: { backgroundColor: colors.brandSoft } as ViewStyle,
          textColor: colors.successText,
          spinnerColor: colors.successText,
        };
      case 'ghost':
        return {
          container: { backgroundColor: 'transparent' } as ViewStyle,
          textColor: colors.textSecondary,
          spinnerColor: colors.textSecondary,
        };
      case 'ghostInverse':
        // Sits on the deep brand background — hero screens and dark sheets.
        return {
          container: { backgroundColor: 'transparent' } as ViewStyle,
          textColor: colors.onDeep,
          spinnerColor: colors.onDeep,
        };
      case 'danger':
        return {
          container: { backgroundColor: colors.dangerSoft } as ViewStyle,
          textColor: colors.dangerText,
          spinnerColor: colors.dangerText,
        };
      case 'inverse':
        return {
          container: { backgroundColor: colors.onDeep, ...shadow.xs } as ViewStyle,
          textColor: colors.deep,
          spinnerColor: colors.deep,
        };
      default:
        return {
          container: { backgroundColor: colors.brand, ...brandGlow } as ViewStyle,
          textColor: colors.onBrand,
          spinnerColor: colors.onBrand,
        };
    }
  }, [colors, variant]);

  return (
    <PressableScale
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: isBlocked, busy: loading }}
      disabled={isBlocked}
      onPress={onPress}
      haptic={variant === 'primary' ? 'medium' : 'light'}
      scaleTo={0.975}
      style={[
        styles.base,
        container,
        {
          minHeight: heights[size],
          paddingVertical: spacing.md,
          paddingHorizontal: paddings[size],
          flexDirection: row,
          alignSelf: fullWidth ? 'stretch' : 'flex-start',
          opacity: disabled ? 0.45 : 1,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={spinnerColor} size="small" />
      ) : (
        <>
          {icon ? <View style={styles.icon}>{icon}</View> : null}
          <AppText
            variant={size === 'sm' ? 'buttonSm' : 'button'}
            align="center"
            style={{ color: textColor }}
            numberOfLines={1}
          >
            {label}
          </AppText>
          {iconEnd ? <View style={styles.icon}>{iconEnd}</View> : null}
        </>
      )}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.lg,
    gap: spacing.sm,
  },
  icon: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
