import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { SlidersHorizontal } from 'lucide-react-native';
import { AppButton, AppText, PressableScale } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';
import { useLocale } from '@/hooks/useLocale';
import { radius } from '@/theme/radius';
import { shadow } from '@/theme/shadows';
import type { EvChargingStation, EvStationFilters } from '@/types';

export function EvMapStatus({
  loading,
  error,
  count,
  truncated,
  filters,
  stations = [],
  retry,
  onFilters,
  onSelectStation,
  compact = false,
}: {
  loading: boolean;
  error?: 'load' | 'zoom';
  count: number;
  truncated: boolean;
  filters: EvStationFilters;
  stations?: EvChargingStation[];
  retry: () => void;
  onFilters: () => void;
  onSelectStation?: (station: EvChargingStation) => void;
  compact?: boolean;
}) {
  const { t, row } = useLocale();
  const { colors } = useTheme();
  const active = Number(Boolean(filters.connectorType)) + Number(Boolean(filters.minPowerKw)) + Number(Boolean(filters.status));
  const previewStations = compact ? [] : stations.slice(0, 3);

  return <View style={[{ padding: 12, gap: 8, borderRadius: radius.xl, backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth * 2, borderColor: colors.border }, shadow.sm]}>
    <View style={{ flexDirection: row, alignItems: 'center', gap: 8 }}>
      {loading ? <ActivityIndicator size="small" color={colors.brand} /> : null}
      <AppText variant="caption" style={{ flex: 1 }}>{loading ? t('ev.loading') : t('ev.count', { count })}</AppText>
      <AppButton size="sm" fullWidth={false} variant="secondary" label={`${t('ev.filters')}${active ? ` · ${active}` : ''}`} icon={<SlidersHorizontal size={16} color={colors.text} />} onPress={onFilters} />
    </View>
    {previewStations.length > 0 ? (
      <View style={{ gap: 6 }}>
        {previewStations.map((station) => (
          <PressableScale
            key={station.id}
            onPress={() => onSelectStation?.(station)}
            accessibilityRole="button"
            accessibilityLabel={station.name}
            style={{
              flexDirection: row,
              alignItems: 'center',
              gap: 8,
              paddingVertical: 8,
              paddingHorizontal: 10,
              borderRadius: radius.md,
              backgroundColor: colors.surfaceAlt,
            }}
          >
            <View style={{ flex: 1, minWidth: 0 }}>
              <AppText variant="caption" weight="bold" numberOfLines={1}>{station.name}</AppText>
              <AppText variant="caption" color="textSecondary" numberOfLines={1}>
                {[station.address, t(`ev.status.${station.status}`)].filter(Boolean).join(' · ')}
              </AppText>
            </View>
            <AppText variant="caption" color="brand" weight="bold">{t('ev.viewOnMap')}</AppText>
          </PressableScale>
        ))}
      </View>
    ) : null}
    {!compact && !loading && (error || count === 0 || truncated) ? <>
      <AppText variant="caption" color="textSecondary">{t(error === 'zoom' ? 'ev.zoom' : error === 'load' ? 'ev.failed' : truncated ? 'ev.truncated' : 'ev.empty')}</AppText>
      {error !== 'zoom' ? <AppButton size="sm" fullWidth={false} variant="ghost" label={t('ev.retry')} onPress={retry} /> : null}
    </> : null}
  </View>;
}
