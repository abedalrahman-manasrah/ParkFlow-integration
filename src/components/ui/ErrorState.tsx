import { View, type StyleProp, type ViewStyle } from 'react-native';
import { CloudOff, TriangleAlert } from 'lucide-react-native';
import { AppText } from './AppText';
import { AppButton } from './AppButton';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/spacing';
import { radius } from '@/theme/radius';
import { errorMessage, toAppError } from '@/utils/errors';
import { useLocale } from '@/hooks/useLocale';

export interface ErrorStateProps {
  error?: unknown;
  title?: string;
  onRetry?: () => void;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function ErrorState({ error, title, onRetry, compact = false, style }: ErrorStateProps) {
  const { colors } = useTheme();
  const { t } = useLocale();

  const appError = toAppError(error);
  const isOffline = appError.code === 'network';
  const Icon = isOffline ? CloudOff : TriangleAlert;

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
      <View
        style={{
          width: 68,
          height: 68,
          borderRadius: radius.xxl,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: isOffline ? colors.neutralSoft : colors.dangerSoft,
        }}
      >
        <Icon size={28} color={isOffline ? colors.textSecondary : colors.danger} strokeWidth={2} />
      </View>

      <AppText variant="h3" align="center">
        {title ?? (isOffline ? t('common.offline') : t('error.title'))}
      </AppText>

      <AppText variant="body" color="textSecondary" align="center" style={{ maxWidth: 320 }}>
        {error ? errorMessage(error) : t('error.generic')}
      </AppText>

      {onRetry ? (
        <AppButton
          label={t('common.retry')}
          onPress={onRetry}
          variant="secondary"
          size="md"
          fullWidth={false}
          style={{ alignSelf: 'center', marginTop: spacing.sm, paddingHorizontal: spacing.xxl }}
        />
      ) : null}
    </View>
  );
}
