import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { AppButton, AppText } from '@/components/ui';
import { useLocale } from '@/hooks/useLocale';
import { useTheme } from '@/theme/ThemeProvider';
import { radius } from '@/theme/radius';
import { shadow } from '@/theme/shadows';
import type { TourismPlace, TourismPlaceCategory } from '@/types';

export function TourismPlaceMapStatus({
  loading,
  error,
  errorMessage,
  count,
  places,
  truncated,
  categories,
  retry,
  compact = false,
}: {
  loading: boolean;
  error?: 'load' | 'zoom';
  errorMessage?: string;
  count: number;
  places: TourismPlace[];
  truncated: boolean;
  categories: TourismPlaceCategory[];
  retry: () => void;
  compact?: boolean;
}) {
  const { locale, t, row } = useLocale();
  const { colors } = useTheme();
  const preview = places.slice(0, 4);
  const remaining = Math.max(0, count - preview.length);
  const categoryLabel = categories.length === 1 ? t(`tourism.category.${categories[0]}`) : t('tourism.allCategories');
  return <View style={[{ padding: 12, gap: 8, borderRadius: radius.xl, backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth * 2, borderColor: colors.border }, shadow.sm]}>
    <View style={{ flexDirection: row, alignItems: 'center', gap: 8 }}>
      {loading ? <ActivityIndicator size="small" color={colors.brand} /> : null}
      <AppText variant="caption" style={{ flex: 1 }}>
        {loading ? t('tourism.loading') : t('tourism.count', { count, category: categoryLabel })}
      </AppText>
    </View>
    {!compact && !loading && !error && count > 0 ? (
      <View style={{ gap: 5 }}>
        <AppText variant="caption" color="textSecondary">{t('tourism.basis')}</AppText>
        {preview.map((place) => (
          <AppText key={place.id} variant="caption" numberOfLines={1}>
            {locale === 'ar' ? place.nameAr : place.nameEn}
          </AppText>
        ))}
        {remaining > 0 ? (
          <AppText variant="caption" color="textSecondary">{t('tourism.more', { count: remaining })}</AppText>
        ) : null}
      </View>
    ) : null}
    {!compact && !loading && (error || count === 0 || truncated) ? <>
      <AppText variant="caption" color="textSecondary">
        {t(error === 'zoom' ? 'tourism.zoom' : error === 'load' ? 'tourism.failed' : truncated ? 'tourism.truncated' : categories.length === 0 ? 'tourism.noFilters' : 'tourism.empty')}
      </AppText>
      {error === 'load' && errorMessage ? <AppText variant="caption" color="textSecondary">{errorMessage}</AppText> : null}
      {error !== 'zoom' ? <AppButton size="sm" fullWidth={false} variant="ghost" label={t('tourism.retry')} onPress={retry} /> : null}
    </> : null}
  </View>;
}
