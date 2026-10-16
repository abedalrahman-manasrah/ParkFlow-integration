import type { ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { AppText } from './AppText';
import { spacing } from '@/theme/spacing';
import { useLocale } from '@/hooks/useLocale';

export interface DetailRowProps {
  label: string;
  value?: string;
  /** Replaces the plain text value — badges, money, multi-line blocks. */
  children?: ReactNode;
  emphasis?: boolean;
  /** Stack label above value instead of side by side. */
  stacked?: boolean;
  style?: StyleProp<ViewStyle>;
}

/** The label/value line used across receipts, parking details and notices. */
export function DetailRow({
  label,
  value,
  children,
  emphasis = false,
  stacked = false,
  style,
}: DetailRowProps) {
  const { row } = useLocale();

  if (stacked) {
    return (
      <View style={[{ gap: 4 }, style]}>
        <AppText variant="caption" color="textTertiary">
          {label}
        </AppText>
        {children ?? (
          <AppText variant={emphasis ? 'titleLg' : 'title'}>{value}</AppText>
        )}
      </View>
    );
  }

  return (
    <View
      style={[
        {
          flexDirection: row,
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: spacing.lg,
          minHeight: 28,
        },
        style,
      ]}
    >
      <AppText variant="body" color="textSecondary" style={{ flexShrink: 1 }}>
        {label}
      </AppText>
      {children ?? (
        <AppText
          variant={emphasis ? 'titleLg' : 'title'}
          numeric
          style={{ flexShrink: 0, maxWidth: '62%' }}
          numberOfLines={2}
        >
          {value}
        </AppText>
      )}
    </View>
  );
}
