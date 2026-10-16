import type { ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { AppText } from './AppText';
import { spacing } from '@/theme/spacing';
import { useLocale } from '@/hooks/useLocale';

export interface TabHeaderProps {
  title: string;
  /** A compact action that sits on the title's line, at the end edge. */
  trailing?: ReactNode;
  style?: StyleProp<ViewStyle>;
}

/**
 * Title row shared by the top-level tabs, so every tab opens with the same
 * breathing room above the title and the same spot for its one header action.
 */
export function TabHeader({ title, trailing, style }: TabHeaderProps) {
  const { row } = useLocale();

  return (
    <View
      style={[
        {
          flexDirection: row,
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: spacing.md,
          minHeight: 48,
          paddingTop: spacing.sm,
        },
        style,
      ]}
    >
      <AppText variant="h1" numberOfLines={1} style={{ flexShrink: 1 }}>
        {title}
      </AppText>
      {trailing}
    </View>
  );
}
