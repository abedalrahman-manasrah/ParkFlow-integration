import { View } from 'react-native';
import { Building2, CircleParking, Footprints } from 'lucide-react-native';

import { AppText, Card, StatusBadge } from '@/components/ui';
import { availabilityTone } from '@/components/map/ZoneMarker';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/spacing';
import { radius } from '@/theme/radius';
import { useLocale } from '@/hooks/useLocale';
import type { AvailabilityLevel, ParkingZone } from '@/types';
import { formatRate } from '@/utils/money';
import { formatDistance, walkingMinutes } from '@/utils/geo';

/** Availability as a 3-segment meter, so it reads without relying on colour. */
function AvailabilityMeter({ level }: { level: AvailabilityLevel }) {
  const { colors } = useTheme();

  const filled = level === 'available' ? 3 : level === 'limited' ? 2 : level === 'full' ? 1 : 0;
  const tint =
    level === 'available'
      ? colors.success
      : level === 'limited'
        ? colors.warning
        : level === 'full'
          ? colors.danger
          : colors.textTertiary;

  return (
    <View style={{ flexDirection: 'row', gap: 3 }}>
      {[0, 1, 2].map((index) => (
        <View
          key={index}
          style={{
            width: 14,
            height: 4,
            borderRadius: 2,
            backgroundColor: index < filled ? tint : colors.border,
          }}
        />
      ))}
    </View>
  );
}

export interface ZoneCardProps {
  zone: ParkingZone;
  /** Metres from the user, when a location fix exists. */
  distanceMeters?: number;
  onPress: () => void;
  width?: number;
}

/**
 * The card in the map's nearby rail. It answers the three questions a driver
 * actually has before tapping: is there space, how much, and how far to walk.
 */
export function ZoneCard({ zone, distanceMeters, onPress, width = 236 }: ZoneCardProps) {
  const { colors } = useTheme();
  const { t, row, alignEnd, locale } = useLocale();

  const isGarage = zone.kind === 'garage' || zone.kind === 'private';
  const Icon = isGarage ? Building2 : CircleParking;
  const name = locale === 'ar' ? zone.nameAr : zone.name;

  return (
    <Card
      onPress={onPress}
      padding="lg"
      elevation="md"
      style={{ width, gap: spacing.md }}
      accessibilityLabel={`${name}, ${t(`zone.${zone.availability}` as const)}, ${formatRate(
        zone.tariff.hourlyRate,
      )}`}
    >
      <View style={{ flexDirection: row, alignItems: 'center', justifyContent: 'space-between' }}>
        <StatusBadge
          label={t(`zone.${zone.availability}` as const)}
          tone={availabilityTone(zone.availability)}
          size="sm"
        />
        <AvailabilityMeter level={zone.availability} />
      </View>

      <View style={{ flexDirection: row, alignItems: 'center', gap: spacing.sm }}>
        <View
          style={{
            width: 30,
            height: 30,
            borderRadius: radius.sm,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: isGarage ? colors.infoSoft : colors.brandSoft,
          }}
        >
          <Icon size={16} color={isGarage ? colors.info : colors.brand} strokeWidth={2.3} />
        </View>
        <AppText variant="titleLg" numberOfLines={1} style={{ flex: 1 }}>
          {name}
        </AppText>
      </View>

      <View
        style={{
          flexDirection: row,
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          gap: spacing.sm,
        }}
      >
        <View style={{ flexDirection: row, alignItems: 'baseline', gap: spacing.xs }}>
          <AppText variant="h3" color="brand" numeric>
            {formatRate(zone.tariff.hourlyRate)}
          </AppText>
          <AppText variant="caption" color="textTertiary">
            {t('common.perHour')}
          </AppText>
        </View>

        {distanceMeters != null ? (
          <View style={{ alignItems: alignEnd, gap: 2 }}>
            <View style={{ flexDirection: row, alignItems: 'center', gap: 4 }}>
              <Footprints size={12} color={colors.textTertiary} strokeWidth={2.2} />
              <AppText variant="caption" color="textSecondary" numeric>
                {t('map.walkMinutes', { minutes: walkingMinutes(distanceMeters) })}
              </AppText>
            </View>
            <AppText variant="caption" color="textTertiary" numeric>
              {formatDistance(distanceMeters)}
            </AppText>
          </View>
        ) : null}
      </View>
    </Card>
  );
}
