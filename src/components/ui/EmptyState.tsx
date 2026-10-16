import type { ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { AppText } from './AppText';
import { AppButton } from './AppButton';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/spacing';
import { radius } from '@/theme/radius';

export interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  body?: string;
  action?: { label: string; onPress: () => void };
  secondaryAction?: { label: string; onPress: () => void };
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function EmptyState({
  icon,
  title,
  body,
  action,
  secondaryAction,
  compact = false,
  style,
}: EmptyStateProps) {
  const { colors } = useTheme();

  return (
    <View
      style={[
        {
          alignItems: 'center',
          justifyContent: 'center',
          paddingVertical: compact ? spacing.xxl : spacing.huge,
          paddingHorizontal: spacing.xl,
          gap: spacing.md,
        },
        style,
      ]}
    >
      {icon ? (
        <View
          style={{
            width: 68,
            height: 68,
            borderRadius: radius.xxl,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.brandSofter,
            marginBottom: spacing.xs,
          }}
        >
          {icon}
        </View>
      ) : null}

      <AppText variant="h3" align="center">
        {title}
      </AppText>

      {body ? (
        <AppText variant="body" color="textSecondary" align="center" style={{ maxWidth: 320 }}>
          {body}
        </AppText>
      ) : null}

      {action ? (
        <AppButton
          label={action.label}
          onPress={action.onPress}
          size="md"
          fullWidth={false}
          style={{ alignSelf: 'center', marginTop: spacing.sm, paddingHorizontal: spacing.xxl }}
        />
      ) : null}

      {secondaryAction ? (
        <AppButton
          label={secondaryAction.label}
          onPress={secondaryAction.onPress}
          variant="ghost"
          size="sm"
          fullWidth={false}
          style={{ alignSelf: 'center' }}
        />
      ) : null}
    </View>
  );
}
