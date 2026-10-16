import { Bell, Car, ChevronDown } from 'lucide-react-native';
import { View } from 'react-native';

import { AppText, IconButton, PressableScale } from '@/components/ui';
import { PlateBadge } from '@/components/domain/PlateBadge';
import { useLocale } from '@/hooks/useLocale';
import { useTheme } from '@/theme/ThemeProvider';
import { radius } from '@/theme/radius';
import { shadow } from '@/theme/shadows';
import { spacing } from '@/theme/spacing';
import type { UserVehicleView } from '@/types';
import { RoadReportButton } from './RoadReportButton';

interface MapTopBarProps {
  vehicle?: UserVehicleView;
  unreadCount: number;
  onOpenVehicles: () => void;
  onOpenNotifications: () => void;
  onOpenReport?: () => void;
}

export function MapTopBar({
  vehicle,
  unreadCount,
  onOpenVehicles,
  onOpenNotifications,
  onOpenReport,
}: MapTopBarProps) {
  const { colors } = useTheme();
  const { t, row } = useLocale();
  const vehicleName = vehicle?.displayName.trim();
  const plateNumber = vehicle?.plateNumber.trim();
  const showVehicleName = Boolean(
    vehicleName && plateNumber && vehicleName.localeCompare(plateNumber, undefined, { sensitivity: 'base' }) !== 0,
  );
  const vehicleLabel = vehicle
    ? [showVehicleName ? vehicleName : undefined, plateNumber].filter(Boolean).join(', ')
    : t('vehicle.select');

  return (
    <View pointerEvents="box-none">
      <View style={{ flexDirection: row, alignItems: 'center', gap: spacing.sm }}>
        <PressableScale
          onPress={onOpenVehicles}
          haptic="select"
          accessibilityRole="button"
          accessibilityLabel={vehicleLabel}
          accessibilityHint={t('parking.wrongVehicle')}
          testID="vehicle-selector"
          style={[
            {
              minWidth: 0,
              flex: 1,
              flexDirection: row,
              alignItems: 'center',
              alignSelf: row === 'row-reverse' ? 'flex-end' : 'flex-start',
              gap: spacing.sm,
              height: 42,
              paddingHorizontal: spacing.md,
              borderRadius: radius.pill,
              backgroundColor: colors.surface,
            },
            shadow.sm,
          ]}
        >
          {vehicle ? (
            <>
              <Car size={17} color={colors.brand} strokeWidth={2.3} />
              {showVehicleName ? (
                <AppText variant="label" numberOfLines={1} style={{ flexShrink: 1 }}>
                  {vehicleName}
                </AppText>
              ) : null}
              <PlateBadge
                plateNumber={vehicle.plateNumber}
                size="sm"
                style={{ flexShrink: 0, alignSelf: 'center' }}
              />
            </>
          ) : (
            <>
              <Car size={17} color={colors.brand} strokeWidth={2.3} />
              <AppText variant="label" numberOfLines={1} style={{ flexShrink: 1 }}>
                {t('vehicle.addNew')}
              </AppText>
            </>
          )}
          <ChevronDown
            size={15}
            color={colors.textTertiary}
            strokeWidth={2.5}
            style={{ flexShrink: 0 }}
          />
        </PressableScale>

        {onOpenReport ? <RoadReportButton onPress={onOpenReport} /> : null}

        <View style={{ marginStart: 'auto' }}>
          <IconButton
            icon={<Bell size={19} color={colors.text} strokeWidth={2.2} />}
            onPress={onOpenNotifications}
            accessibilityLabel={t('notifications.title')}
            size={42}
          />
          {unreadCount > 0 ? (
            <View
              pointerEvents="none"
              style={{
                position: 'absolute',
                top: -2,
                right: -2,
                minWidth: 17,
                height: 17,
                paddingHorizontal: 3,
                borderRadius: radius.pill,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: colors.danger,
                borderWidth: 2,
                borderColor: colors.surface,
              }}
            >
              <AppText variant="caption" numeric style={{ color: colors.textOnColor, fontSize: 9 }}>
                {unreadCount > 9 ? '9+' : unreadCount}
              </AppText>
            </View>
          ) : null}
        </View>
      </View>

    </View>
  );
}
