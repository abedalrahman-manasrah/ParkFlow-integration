import { Plus, TriangleAlert } from 'lucide-react-native';
import { Pressable, View } from 'react-native';
import { AppText } from '@/components/ui/AppText';
import { useLocale } from '@/hooks/useLocale';
import { useTheme } from '@/theme/ThemeProvider';
import { radius } from '@/theme/radius';
import { shadow } from '@/theme/shadows';
import { spacing } from '@/theme/spacing';

export function RoadReportButton({ onPress }: { onPress: () => void }) {
  const { colors } = useTheme();
  const { t, row } = useLocale();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={t('roadReports.report')}
      style={({ pressed }) => [{
        flexDirection: row,
        alignItems: 'center',
        gap: spacing.sm,
        flexShrink: 0,
        paddingHorizontal: spacing.md,
        height: 42,
        borderRadius: radius.pill,
        backgroundColor: colors.deep,
        opacity: pressed ? 0.85 : 1,
      }, shadow.md]}
    >
      <View style={{ flexDirection: row, alignItems: 'center' }}>
        <TriangleAlert color={colors.onDeep} size={18} />
        <Plus color={colors.onDeep} size={12} style={{ marginStart: -3, marginTop: -12 }} />
      </View>
      <AppText variant="buttonSm" style={{ color: colors.onDeep }}>{t('roadReports.report')}</AppText>
    </Pressable>
  );
}
