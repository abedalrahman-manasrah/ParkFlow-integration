import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { AppText } from './AppText';
import { useTheme } from '@/theme/ThemeProvider';
import { radius } from '@/theme/radius';
import { spacing } from '@/theme/spacing';
import { useLocale } from '@/hooks/useLocale';

export type BadgeTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'brand';
export type BadgeSize = 'sm' | 'md';

export interface StatusBadgeProps {
  label: string;
  tone?: BadgeTone;
  size?: BadgeSize;
  /** A dot plus the label — status is never communicated by colour alone. */
  showDot?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function StatusBadge({
  label,
  tone = 'neutral',
  size = 'md',
  showDot = true,
  style,
}: StatusBadgeProps) {
  const { colors } = useTheme();
  const { row } = useLocale();

  const palette: Record<BadgeTone, { bg: string; fg: string; dot: string }> = {
    success: { bg: colors.successSoft, fg: colors.successText, dot: colors.success },
    warning: { bg: colors.warningSoft, fg: colors.warningText, dot: colors.warning },
    danger: { bg: colors.dangerSoft, fg: colors.dangerText, dot: colors.danger },
    info: { bg: colors.infoSoft, fg: colors.infoText, dot: colors.info },
    neutral: { bg: colors.neutralSoft, fg: colors.neutralText, dot: colors.textTertiary },
    brand: { bg: colors.brandSoft, fg: colors.successText, dot: colors.brand },
  };

  const { bg, fg, dot } = palette[tone];

  // The wrapper hugs the reading-start edge inside a column and simply sizes
  // to the pill inside a row, so the badge never stretches or drifts.
  return (
    <View style={{ flexDirection: row, alignItems: 'center' }}>
      <View
        accessibilityRole="text"
        accessibilityLabel={label}
        style={[
          styles.base,
          {
            backgroundColor: bg,
            flexDirection: row,
            paddingVertical: size === 'sm' ? 3 : 5,
            paddingHorizontal: size === 'sm' ? spacing.sm : spacing.md,
          },
          style,
        ]}
      >
        {showDot ? <View style={[styles.dot, { backgroundColor: dot }]} /> : null}
        <AppText variant={size === 'sm' ? 'caption' : 'label'} style={{ color: fg }} numberOfLines={1}>
          {label}
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    borderRadius: radius.pill,
    gap: spacing.xs + 2,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
});
