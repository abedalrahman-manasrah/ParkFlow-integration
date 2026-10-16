import { View } from 'react-native';
import { AppButton } from '@/components/ui/AppButton';
import { AppText } from '@/components/ui/AppText';
import { useLocale } from '@/hooks/useLocale';
import { useTheme } from '@/theme/ThemeProvider';
import { radius } from '@/theme/radius';
import { shadow } from '@/theme/shadows';
import { spacing } from '@/theme/spacing';

export function RoadReportLocationPanel({ onCancel, onContinue }: { onCancel: () => void; onContinue: () => void }) {
  const { colors } = useTheme();
  const { t, row } = useLocale();
  return (
    <View style={[{ backgroundColor: colors.surface, borderRadius: radius.xl, padding: spacing.lg, gap: spacing.md }, shadow.lg]}>
      <View style={{ gap: spacing.xs }}>
        <AppText variant="h3">{t('roadReports.locationTitle')}</AppText>
        <AppText variant="caption" color="textSecondary">{t('roadReports.locationHelp')}</AppText>
      </View>
      <View style={{ flexDirection: row, gap: spacing.sm }}>
        <AppButton label={t('common.cancel')} onPress={onCancel} variant="secondary" size="sm" style={{ flex: 1 }} />
        <AppButton label={t('roadReports.useLocation')} onPress={onContinue} size="sm" style={{ flex: 1.5 }} />
      </View>
    </View>
  );
}
