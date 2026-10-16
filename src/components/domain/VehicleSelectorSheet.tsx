import { ScrollView, View } from 'react-native';
import { Check, Plus, Car, Truck, Bike, CarTaxiFront } from 'lucide-react-native';

import {
  AppText,
  BottomSheet,
  Divider,
  PressableScale,
  StatusBadge,
} from '@/components/ui';
import { PlateBadge } from './PlateBadge';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/spacing';
import { radius } from '@/theme/radius';
import { useLocale } from '@/hooks/useLocale';
import type { UserVehicleView, VehicleType } from '@/types';
import { isPlateOnlyName } from '@/utils/plate';

const TYPE_ICONS: Record<VehicleType, typeof Car> = {
  private: Car,
  commercial: Truck,
  taxi: CarTaxiFront,
  motorcycle: Bike,
};

export interface VehicleSelectorSheetProps {
  visible: boolean;
  onClose: () => void;
  vehicles: UserVehicleView[];
  selectedId?: string;
  /** Vehicle ids that currently have a live session — shown as "Parked now". */
  activeVehicleIds?: string[];
  onSelect: (vehicle: UserVehicleView) => void;
  onAddVehicle: () => void;
}

export function VehicleSelectorSheet({
  visible,
  onClose,
  vehicles,
  selectedId,
  activeVehicleIds = [],
  onSelect,
  onAddVehicle,
}: VehicleSelectorSheetProps) {
  const { colors } = useTheme();
  const { t, row } = useLocale();

  return (
    <BottomSheet visible={visible} onClose={onClose} title={t('vehicle.select')}>
      <ScrollView
        style={{ maxHeight: 420 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: spacing.sm }}
      >
        {vehicles.map((vehicle, index) => {
          const selected = vehicle.id === selectedId;
          const isParked = activeVehicleIds.includes(vehicle.id);
          const Icon = TYPE_ICONS[vehicle.type];

          return (
            <View key={vehicle.id}>
              {index > 0 ? <Divider /> : null}
              <PressableScale
                onPress={() => onSelect(vehicle)}
                haptic="select"
                scaleTo={0.99}
                dimTo={0.65}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                accessibilityLabel={`${vehicle.displayName}, ${vehicle.plateNumber}`}
                style={{
                  flexDirection: row,
                  alignItems: 'center',
                  gap: spacing.md,
                  paddingVertical: spacing.md,
                }}
              >
                <View
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: radius.md,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: selected ? colors.brandSoft : colors.surfaceAlt,
                  }}
                >
                  <Icon
                    size={21}
                    color={selected ? colors.brand : colors.textSecondary}
                    strokeWidth={2.1}
                  />
                </View>

                <View style={{ flex: 1, gap: 5 }}>
                  <View style={{ flexDirection: row, alignItems: 'center', gap: spacing.sm }}>
                    <AppText variant="titleLg" numberOfLines={1} style={{ flexShrink: 1 }}>
                      {isPlateOnlyName(vehicle.displayName, vehicle.plateNumber)
                        ? t(`vehicle.type.${vehicle.type}`)
                        : vehicle.displayName}
                    </AppText>
                    {vehicle.isDefault ? (
                      <StatusBadge label={t('common.default')} tone="neutral" size="sm" showDot={false} />
                    ) : null}
                  </View>
                  <View style={{ flexDirection: row, alignItems: 'center', gap: spacing.sm }}>
                    <PlateBadge plateNumber={vehicle.plateNumber} size="sm" />
                    {isParked ? (
                      <StatusBadge label={t('vehicle.parkedNow')} tone="success" size="sm" />
                    ) : null}
                  </View>
                </View>

                <View
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: 13,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: selected ? colors.brand : 'transparent',
                    borderWidth: selected ? 0 : 2,
                    borderColor: colors.border,
                  }}
                >
                  {selected ? <Check size={15} color={colors.onBrand} strokeWidth={3} /> : null}
                </View>
              </PressableScale>
            </View>
          );
        })}
      </ScrollView>

      <Divider style={{ marginVertical: spacing.sm }} />

      <PressableScale
        onPress={onAddVehicle}
        haptic="light"
        scaleTo={0.99}
        accessibilityRole="button"
        accessibilityLabel={t('vehicle.addNew')}
        style={{
          flexDirection: row,
          alignItems: 'center',
          gap: spacing.md,
          paddingVertical: spacing.md,
        }}
      >
        <View
          style={{
            width: 44,
            height: 44,
            borderRadius: radius.md,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.brandSoft,
          }}
        >
          <Plus size={21} color={colors.brand} strokeWidth={2.4} />
        </View>
        <AppText variant="titleLg" color="brand">
          {t('vehicle.addNew')}
        </AppText>
      </PressableScale>
    </BottomSheet>
  );
}
