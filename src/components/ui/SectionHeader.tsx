import type { ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { AppText } from './AppText';
import { PressableScale } from './PressableScale';
import { spacing } from '@/theme/spacing';
import { useLocale } from '@/hooks/useLocale';

export interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  action?: { label: string; onPress: () => void };
  trailing?: ReactNode;
  style?: StyleProp<ViewStyle>;
}

export function SectionHeader({ title, subtitle, action, trailing, style }: SectionHeaderProps) {
  const { row } = useLocale();

  return (
    <View
      style={[
        {
          flexDirection: row,
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: spacing.md,
          marginBottom: spacing.md,
        },
        style,
      ]}
    >
      <View style={{ flex: 1, gap: spacing.xs }}>
        <AppText variant="h3">{title}</AppText>
        {subtitle ? (
          <AppText variant="bodySm" color="textSecondary">
            {subtitle}
          </AppText>
        ) : null}
      </View>
      {action ? (
        <PressableScale onPress={action.onPress} haptic="select" hitSlop={8}>
          <AppText variant="label" color="brand">
            {action.label}
          </AppText>
        </PressableScale>
      ) : null}
      {trailing}
    </View>
  );
}
