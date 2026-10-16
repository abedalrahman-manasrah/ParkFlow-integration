import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View, type DimensionValue } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, ArrowRight, CarFront, RefreshCw } from 'lucide-react-native';
import { AppButton, AppHeader, AppText, Card, ErrorState, InlineNotice, Screen, Skeleton, StatusBadge } from '@/components/ui';
import { useParkingLayout } from '@/hooks/useParking';
import { useLocale } from '@/hooks/useLocale';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/spacing';
import { radius } from '@/theme/radius';
import type { ParkingLayout, ParkingLayoutSpot, ParkingSpotState } from '@/types';

export default function ParkingLayoutScreen() {
  const { zoneId } = useLocalSearchParams<{ zoneId: string }>();
  const router = useRouter();
  const { t, locale, row, alignEnd, dateLocale } = useLocale();
  const { colors } = useTheme();
  const { data: layout, isPending, isError, error, refetch, isRefetching } = useParkingLayout(zoneId);
  const [selectedId, setSelectedId] = useState<string>();
  const selected = layout?.spots.find((spot) => spot.id === selectedId && spot.state === 'available');
  const availableCount = layout?.spots.filter((spot) => spot.state === 'available').length ?? 0;
  const autoAssigned = useMemo(() => layout?.spots
    .filter((spot) => spot.state === 'available' && spot.type === 'regular')
    .sort((a, b) => a.code.localeCompare(b.code))[0], [layout]);

  const continueWith = (spot?: ParkingLayoutSpot) => {
    if (!layout || !spot) return;
    router.push({
      pathname: '/parking/reserve/[zoneId]',
      params: { zoneId: layout.parkingId, spotId: spot.id, spotCode: spot.code },
    });
  };

  return <Screen bottomInset={spacing.giant}>
    <AppHeader
      title={layout ? (locale === 'ar' ? layout.parkingNameAr : layout.parkingName) : t('parkingLayout.title')}
      subtitle={t('parkingLayout.title')}
      leading="close"
      trailing={<AppButton label={t('parkingLayout.refresh')} size="sm" variant="ghost" fullWidth={false}
        icon={<RefreshCw size={17} color={colors.textSecondary} />}
        loading={isRefetching} onPress={() => void refetch()} />}
    />
    {isError ? <ErrorState error={error} onRetry={() => void refetch()} />
      : isPending || !layout ? <View style={{ gap: spacing.lg }}><Skeleton height={90} /><Skeleton height={540} /><Skeleton height={180} /></View>
      : <View style={{ gap: spacing.lg }}>
        <View style={{ flexDirection: row, alignItems: 'center', justifyContent: 'space-between', gap: spacing.md }}>
          <View style={{ flex: 1, gap: spacing.xs }}>
            <AppText variant="title">{locale === 'ar' ? layout.section.nameAr : layout.section.name}</AppText>
            <AppText variant="caption" color="textSecondary">{t('parkingLayout.sectionCount', { count: layout.section.spaceCount })}</AppText>
          </View>
          <View style={{ alignItems: alignEnd, gap: spacing.xs }}>
            <StatusBadge label={t('parkingLayout.demo')} tone="warning" showDot={false} />
            <AppText variant="caption" color="successText">{t('parkingLayout.availableCount', { count: availableCount })}</AppText>
          </View>
        </View>

        <LayoutCanvas layout={layout} selectedId={selectedId} onSelect={setSelectedId} />

        <Legend layout={layout} />

        <Card padding="lg" style={{ gap: spacing.sm }}>
          <AppText variant="label" color="textSecondary">{t('parkingLayout.selectedSpace')}</AppText>
          {selected ? <>
            <View style={{ flexDirection: row, alignItems: 'center', gap: spacing.sm }}>
              <AppText variant="h2" numeric>{selected.code}</AppText>
              <StatusBadge label={t(`parkingLayout.type.${selected.type}`)} tone={selected.type === 'regular' ? 'neutral' : 'info'} showDot={false} />
            </View>
            <AppText variant="caption" color="successText">{t('parkingLayout.status.available')}</AppText>
          </> : <AppText variant="bodySm" color="textTertiary">{t('parkingLayout.selectPrompt')}</AppText>}
          <AppButton label={t('parkingLayout.chooseSpace')} onPress={() => continueWith(selected)} disabled={!selected} />
          <AppButton label={t('parkingLayout.autoAssign')} variant="secondary" onPress={() => continueWith(autoAssigned)} disabled={!autoAssigned} />
        </Card>

        <InlineNotice tone="warning" title={t('parkingLayout.demo')} body={t('parkingLayout.disclaimer')} />
        <AppText variant="caption" color="textTertiary" align="center">
          {t('parkingLayout.lastUpdated', { value: new Intl.DateTimeFormat(dateLocale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(layout.lastUpdated)) })}
        </AppText>
      </View>}
  </Screen>;
}

function pct(value: number, total: number): DimensionValue {
  return `${value / total * 100}%`;
}

function LayoutCanvas({ layout, selectedId, onSelect }: {
  layout: ParkingLayout;
  selectedId?: string;
  onSelect: (id: string) => void;
}) {
  const { colors } = useTheme();
  const { t, locale } = useLocale();
  const stateColors: Record<ParkingSpotState, string> = {
    available: colors.success,
    reserved: colors.warning,
    occupied: colors.danger,
    out_of_service: colors.neutralText,
  };
  const textColors: Record<ParkingSpotState, string> = {
    available: colors.textOnColor,
    reserved: colors.deep,
    occupied: colors.textOnColor,
    out_of_service: colors.textOnColor,
  };
  const markerLabel = (spot: ParkingLayoutSpot) => spot.type === 'accessible' ? '♿' : spot.type === 'ev' ? 'EV' : undefined;

  return <View style={[styles.canvas, { aspectRatio: layout.dimensions.width / layout.dimensions.height, backgroundColor: colors.surfaceSunken, borderColor: colors.border }]}>
    {layout.lanes.map((lane) => {
      const Direction = lane.direction === 'left' ? ArrowLeft : ArrowRight;
      return <View key={lane.id} style={{ position: 'absolute', left: pct(lane.x, layout.dimensions.width), top: pct(lane.y, layout.dimensions.height), width: pct(lane.width, layout.dimensions.width), height: pct(lane.height, layout.dimensions.height), backgroundColor: colors.surfaceAlt, borderColor: colors.borderStrong, borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: spacing.xs }}>
        {lane.kind === 'one_way_lane' ? <Direction size={13} color={colors.textTertiary} /> : <CarFront size={13} color={colors.textTertiary} />}
        <AppText variant="caption" color="textTertiary" align="center" numberOfLines={1}>{t(`parkingLayout.lane.${lane.kind}`)}</AppText>
      </View>;
    })}
    {layout.islands.map((island) => <View key={island.id} style={{ position: 'absolute', left: pct(island.x, layout.dimensions.width), top: pct(island.y, layout.dimensions.height), width: pct(island.width, layout.dimensions.width), height: pct(island.height, layout.dimensions.height), backgroundColor: colors.brandSoft, borderColor: colors.brand, borderWidth: 1, borderRadius: radius.pill }} />)}
    {layout.spots.map((spot) => {
      const available = spot.state === 'available';
      const selected = selectedId === spot.id;
      const label = t('parkingLayout.spaceAccessibility', { code: spot.code, status: t(`parkingLayout.status.${spot.state}`), type: t(`parkingLayout.type.${spot.type}`) });
      return <Pressable key={spot.id} accessible accessibilityRole="button" accessibilityLabel={label}
        accessibilityState={{ disabled: !available, selected }} disabled={!available} onPress={() => onSelect(spot.id)}
        style={{ position: 'absolute', left: pct(spot.x, layout.dimensions.width), top: pct(spot.y, layout.dimensions.height), width: pct(spot.width, layout.dimensions.width), height: pct(spot.height, layout.dimensions.height), transform: [{ rotate: `${spot.rotation}deg` }], backgroundColor: stateColors[spot.state], borderColor: selected ? colors.infoText : colors.surface, borderWidth: selected ? 3 : 1, borderRadius: 4, overflow: 'visible', alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ transform: [{ rotate: `${-spot.rotation}deg` }], alignItems: 'center', justifyContent: 'center' }}>
          <AppText numeric forceLtrAlign align="center" style={{ color: textColors[spot.state], fontSize: 8, lineHeight: 10, fontWeight: '700' }}>{spot.code}</AppText>
          {markerLabel(spot) ? <AppText forceLtrAlign align="center" style={{ color: textColors[spot.state], fontSize: 8, lineHeight: 9, fontWeight: '800' }}>{markerLabel(spot)}</AppText> : null}
        </View>
      </Pressable>;
    })}
    <GateMarker x={layout.entrance.x} y={layout.entrance.y} dimensions={layout.dimensions} label={locale === 'ar' ? t('parkingLayout.entrance') : layout.entrance.label} color={colors.successText} />
    <GateMarker x={layout.exit.x} y={layout.exit.y} dimensions={layout.dimensions} label={locale === 'ar' ? t('parkingLayout.exit') : layout.exit.label} color={colors.dangerText} alignEnd />
  </View>;
}

function GateMarker({ x, y, dimensions, label, color, alignEnd = false }: { x: number; y: number; dimensions: ParkingLayout['dimensions']; label: string; color: string; alignEnd?: boolean }) {
  return <View style={{ position: 'absolute', left: pct(x, dimensions.width), top: pct(y, dimensions.height), transform: [{ translateX: alignEnd ? -84 : 0 }, { translateY: -8 }], width: 84, alignItems: alignEnd ? 'flex-end' : 'flex-start' }}>
    <AppText variant="caption" forceLtrAlign={!alignEnd} style={{ color, fontSize: 9, lineHeight: 11, fontWeight: '700' }} numberOfLines={2}>{label}</AppText>
  </View>;
}

function Legend({ layout }: { layout: ParkingLayout }) {
  const { locale, t, row } = useLocale();
  const { colors } = useTheme();
  return <View style={{ gap: spacing.sm }}>
    <AppText variant="label">{t('parkingLayout.legend')}</AppText>
    <View style={{ flexDirection: row, flexWrap: 'wrap', gap: spacing.sm }}>
      {layout.legend.statuses.map((item) => <View key={item.id} style={{ flexDirection: row, alignItems: 'center', gap: spacing.xs, minWidth: '45%' }}>
        <View style={{ width: 13, height: 13, borderRadius: 3, backgroundColor: item.color }} />
        <AppText variant="caption" color="textSecondary">{locale === 'ar' ? item.labelAr : item.label}</AppText>
      </View>)}
      {layout.legend.types.map((item) => <View key={item.id} style={{ flexDirection: row, alignItems: 'center', gap: spacing.xs, minWidth: '45%' }}>
        <AppText forceLtrAlign style={{ color: colors.text, fontWeight: '800' }}>{item.marker}</AppText>
        <AppText variant="caption" color="textSecondary">{locale === 'ar' ? item.labelAr : item.label}</AppText>
      </View>)}
    </View>
  </View>;
}

const styles = StyleSheet.create({
  canvas: {
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
});
