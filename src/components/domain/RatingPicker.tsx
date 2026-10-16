import { View } from 'react-native';
import { Star } from 'lucide-react-native';
import { AppText, PressableScale } from '@/components/ui';
import { useLocale } from '@/hooks/useLocale';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/spacing';

/** Five tappable stars. Once a rating exists it is shown read-only. */
export function RatingPicker({ label, value, onRate, disabled }: {
  label: string; value?: number; onRate: (rating: number) => void; disabled?: boolean;
}) {
  const { colors } = useTheme();
  const { row, t } = useLocale();
  return (
    <View style={{ gap: spacing.xs }}>
      <AppText variant="label" color="textSecondary">{value ? t('share.rated', { rating: value }) : label}</AppText>
      <View style={{ flexDirection: row, gap: spacing.xs }}>
        {[1, 2, 3, 4, 5].map((star) => (
          <PressableScale
            key={star}
            disabled={disabled || Boolean(value)}
            onPress={() => onRate(star)}
            accessibilityRole="button"
            accessibilityLabel={`${star} ★`}
            style={{ padding: 4 }}
          >
            <Star size={26} color={colors.warning} fill={(value ?? 0) >= star ? colors.warning : 'transparent'} strokeWidth={2} />
          </PressableScale>
        ))}
      </View>
    </View>
  );
}
