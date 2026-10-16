import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { AppText } from './AppText';
import { PressableScale } from './PressableScale';
import { useTheme } from '@/theme/ThemeProvider';
import { radius } from '@/theme/radius';
import { spacing } from '@/theme/spacing';
import { useLocale } from '@/hooks/useLocale';

export interface ListItemProps {
  title: string;
  subtitle?: string;
  /** Leading visual — usually an icon in a tinted square. */
  leading?: ReactNode;
  trailing?: ReactNode;
  /** Shows a direction-aware chevron. Ignored when `trailing` is set. */
  showChevron?: boolean;
  onPress?: () => void;
  tone?: 'plain' | 'card';
  destructive?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function ListItem({
  title,
  subtitle,
  leading,
  trailing,
  showChevron = false,
  onPress,
  tone = 'plain',
  destructive = false,
  disabled = false,
  style,
  testID,
}: ListItemProps) {
  const { colors } = useTheme();
  const { row, isRTL } = useLocale();

  const Chevron = isRTL ? ChevronLeft : ChevronRight;

  const content = (
    <View
      style={[
        {
          flexDirection: row,
          alignItems: 'center',
          gap: spacing.md,
          paddingVertical: spacing.lg,
          paddingHorizontal: tone === 'card' ? spacing.lg : 0,
          borderRadius: tone === 'card' ? radius.lg : 0,
          backgroundColor: tone === 'card' ? colors.surface : 'transparent',
          borderWidth: tone === 'card' ? StyleSheet.hairlineWidth * 2 : 0,
          borderColor: colors.border,
          opacity: disabled ? 0.45 : 1,
          minHeight: 56,
        },
        style,
      ]}
    >
      {leading}

      <View style={{ flex: 1, gap: spacing.xs }}>
        <AppText variant="titleLg" color={destructive ? 'danger' : 'text'} numberOfLines={1}>
          {title}
        </AppText>
        {subtitle ? (
          <AppText variant="bodySm" color="textSecondary" numberOfLines={2}>
            {subtitle}
          </AppText>
        ) : null}
      </View>

      {trailing ?? (showChevron ? <Chevron size={20} color={colors.textTertiary} /> : null)}
    </View>
  );

  if (!onPress || disabled) return content;

  return (
    <PressableScale
      testID={testID}
      onPress={onPress}
      haptic="select"
      scaleTo={0.99}
      dimTo={0.6}
      accessibilityRole="button"
      accessibilityLabel={subtitle ? `${title}. ${subtitle}` : title}
    >
      {content}
    </PressableScale>
  );
}
