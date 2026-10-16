import type { ReactNode } from 'react';
import { Accessibility, BadgePercent, BatteryCharging, CircleParking, Landmark, LifeBuoy, TriangleAlert, Wrench } from 'lucide-react-native';
import { Switch, View } from 'react-native';
import { AppButton, AppText, BottomSheet, PressableScale } from '@/components/ui';
import { useLocale } from '@/hooks/useLocale';
import { useMapLayersStore } from '@/store/mapLayersStore';
import { useTheme } from '@/theme/ThemeProvider';
import { radius } from '@/theme/radius';
import { spacing } from '@/theme/spacing';
import {
  BUSINESS_OFFERS_AVAILABLE,
  CAR_SERVICE_CATEGORIES,
  MAP_LAYER_AVAILABILITY,
  PRIMARY_MAP_CATEGORIES,
  TOURISM_PLACE_CATEGORIES,
  type CarServiceCategory,
  type PrimaryMapCategory,
  type TourismPlaceCategory,
} from '@/types';

const categoryIcon = (category: PrimaryMapCategory, color: string): ReactNode => {
  const props = { color, size: 18, strokeWidth: 2.2 };
  switch (category) {
    case 'parking': return <CircleParking {...props} />;
    case 'ev_charging': return <BatteryCharging {...props} />;
    case 'car_services': return <Wrench {...props} />;
    case 'tourism_places': return <Landmark {...props} />;
    case 'roadside_help': return <LifeBuoy {...props} />;
  }
};

export function MapLayersSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { colors } = useTheme();
  const { t, row } = useLocale();
  const primaryCategory = useMapLayersStore((state) => state.primaryCategory);
  const roadReportsEnabled = useMapLayersStore((state) => state.roadReportsEnabled);
  const businessOffersEnabled = useMapLayersStore((state) => state.businessOffersEnabled);
  const accessibleParkingOnly = useMapLayersStore((state) => state.accessibleParkingOnly);
  const carServiceCategory = useMapLayersStore((state) => state.carServiceCategory);
  const tourismPlaceCategories = useMapLayersStore((state) => state.tourismPlaceCategories);
  const setPrimaryCategory = useMapLayersStore((state) => state.setPrimaryCategory);
  const setRoadReportsEnabled = useMapLayersStore((state) => state.setRoadReportsEnabled);
  const setBusinessOffersEnabled = useMapLayersStore((state) => state.setBusinessOffersEnabled);
  const setAccessibleParkingOnly = useMapLayersStore((state) => state.setAccessibleParkingOnly);
  const setCarServiceCategory = useMapLayersStore((state) => state.setCarServiceCategory);
  const toggleTourismPlaceCategory = useMapLayersStore((state) => state.toggleTourismPlaceCategory);
  const resetLayers = useMapLayersStore((state) => state.resetLayers);

  const overlayRow = (
    label: string,
    icon: ReactNode,
    value: boolean,
    onChange: (next: boolean) => void,
    available: boolean,
  ) => (
    <View style={{ minHeight: 46, flexDirection: row, alignItems: 'center', gap: spacing.md }}>
      {icon}
      <AppText variant="label" style={{ flex: 1 }} color={available ? 'text' : 'textTertiary'}>{label}</AppText>
      {!available ? (
        <View style={{ paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: radius.pill, backgroundColor: colors.neutralSoft }}>
          <AppText variant="caption" color="textSecondary">{t('mapLayers.comingSoon')}</AppText>
        </View>
      ) : null}
      <Switch
        value={available && value}
        disabled={!available}
        onValueChange={onChange}
        trackColor={{ false: colors.borderStrong, true: colors.brand }}
        thumbColor={colors.surface}
        ios_backgroundColor={colors.borderStrong}
        accessibilityLabel={label}
      />
    </View>
  );

  return (
    <BottomSheet visible={visible} onClose={onClose} title={t('mapLayers.layers')} contentStyle={{ maxHeight: '78%' }}>
      <View style={{ gap: spacing.xl }}>
        <View style={{ gap: spacing.sm }}>
          <View style={{ flexDirection: row, alignItems: 'center' }}>
            <AppText variant="label" color="textSecondary" style={{ flex: 1 }}>{t('mapLayers.lookingFor')}</AppText>
            <AppButton label={t('mapLayers.reset')} onPress={resetLayers} variant="ghost" size="sm" fullWidth={false} />
          </View>
          <View style={{ flexDirection: row, flexWrap: 'wrap', gap: spacing.sm }}>
            {PRIMARY_MAP_CATEGORIES.map((category) => {
              const available = MAP_LAYER_AVAILABILITY[category];
              const active = primaryCategory === category;
              return (
                <PressableScale
                  key={category}
                  disabled={!available}
                  onPress={() => setPrimaryCategory(category)}
                  accessibilityRole="button"
                  accessibilityLabel={t(`mapLayers.primary.${category}`)}
                  accessibilityState={{ selected: active, disabled: !available }}
                  haptic="select"
                  style={{
                    width: '48%',
                    minHeight: 48,
                    flexDirection: row,
                    alignItems: 'center',
                    gap: spacing.sm,
                    paddingHorizontal: spacing.md,
                    borderRadius: radius.lg,
                    borderWidth: 1,
                    borderColor: active ? colors.brand : colors.border,
                    backgroundColor: active ? colors.brandSoft : colors.surfaceAlt,
                    opacity: available ? 1 : 0.58,
                  }}
                >
                  {categoryIcon(category, active ? colors.brand : colors.textSecondary)}
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <AppText variant="caption" weight={active ? 'bold' : 'medium'} numberOfLines={1}>{t(`mapLayers.primary.${category}`)}</AppText>
                    {!available ? <AppText variant="caption" color="textTertiary" numberOfLines={1}>{t('mapLayers.comingSoon')}</AppText> : null}
                  </View>
                </PressableScale>
              );
            })}
          </View>
          {primaryCategory === 'car_services' ? (
            <View style={{ flexDirection: row, flexWrap: 'wrap', gap: spacing.sm }}>
              {CAR_SERVICE_CATEGORIES.map((category: CarServiceCategory) => {
                const active = carServiceCategory === category;
                return (
                  <AppButton
                    key={category}
                    label={t(`carServices.category.${category}`)}
                    size="sm"
                    fullWidth={false}
                    variant={active ? 'primary' : 'secondary'}
                    onPress={() => setCarServiceCategory(category)}
                  />
                );
              })}
            </View>
          ) : null}
          {primaryCategory === 'tourism_places' ? (
            <View style={{ flexDirection: row, flexWrap: 'wrap', gap: spacing.sm }}>
              {TOURISM_PLACE_CATEGORIES.map((category: TourismPlaceCategory) => {
                const active = tourismPlaceCategories.includes(category);
                return (
                  <AppButton
                    key={category}
                    label={t(`tourism.category.${category}`)}
                    size="sm"
                    fullWidth={false}
                    variant={active ? 'primary' : 'secondary'}
                    onPress={() => toggleTourismPlaceCategory(category)}
                  />
                );
              })}
            </View>
          ) : null}
        </View>

        <View style={{ gap: spacing.xs }}>
          <AppText variant="label" color="textSecondary">{t('mapLayers.overlays')}</AppText>
          {overlayRow(t('mapLayers.roadReports'), <TriangleAlert size={18} color={colors.warningText} />, roadReportsEnabled, setRoadReportsEnabled, true)}
          {overlayRow(t('mapLayers.businessOffers'), <BadgePercent size={18} color={colors.textTertiary} />, businessOffersEnabled, setBusinessOffersEnabled, BUSINESS_OFFERS_AVAILABLE)}
          {primaryCategory === 'parking'
            ? overlayRow(t('mapLayers.accessibleParking'), <Accessibility size={18} color={colors.info} />, accessibleParkingOnly, setAccessibleParkingOnly, true)
            : null}
        </View>

        <AppButton label={t('common.close')} onPress={onClose} variant="secondary" size="sm" />
      </View>
    </BottomSheet>
  );
}
