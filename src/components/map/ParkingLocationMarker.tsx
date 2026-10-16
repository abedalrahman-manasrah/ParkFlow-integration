import { CarFront } from 'lucide-react-native';
import { View } from 'react-native';

import { AppText } from '@/components/ui';
import { useLocale } from '@/hooks/useLocale';
import { useTheme } from '@/theme/ThemeProvider';
import { radius } from '@/theme/radius';
import { shadow } from '@/theme/shadows';
import { spacing } from '@/theme/spacing';
import type { ColorScheme } from '@/theme/colors';
import type { RamallahParkingLocation } from '@/types';

export function parkingLocationColor(location: RamallahParkingLocation, colors: ColorScheme): string {
  if (location.ownership === 'public_transport') return colors.parkingRestricted;
  if (location.price.hourlyRateNis === 0) return colors.parkingFree;
  if (location.ownership === 'private') return colors.parkingPrivate;
  return colors.parkingMunicipal;
}

export function parkingLocationAccessibilityLabel(location: RamallahParkingLocation): string {
  return [
    location.name,
    location.nameAr,
    location.ownership,
    location.kind,
    `${location.price.hourlyRateNis} ${location.price.currency} per hour`,
    location.price.status,
    location.accessRestriction,
  ]
    .filter(Boolean)
    .join(', ');
}

interface ParkingLocationMarkerProps {
  location: RamallahParkingLocation;
  selected: boolean;
}

export function ParkingLocationMarker({ location, selected }: ParkingLocationMarkerProps) {
  const { colors } = useTheme();
  const { t, row } = useLocale();
  const color = parkingLocationColor(location, colors);
  const price =
    location.price.hourlyRateNis === 0
      ? t('ramallahParking.freeShort')
      : `${location.price.hourlyRateNis} ₪`;

  return (
    <View style={{ alignItems: 'center' }}>
      <View
        style={[
          {
            minWidth: selected ? 48 : 40,
            height: selected ? 36 : 32,
            paddingHorizontal: spacing.sm,
            flexDirection: row,
            alignItems: 'center',
            justifyContent: 'center',
            gap: spacing.xs,
            borderRadius: radius.pill,
            backgroundColor: color,
            borderWidth: selected ? 3 : 2,
            borderColor: colors.surface,
          },
          shadow.md,
        ]}
      >
        <CarFront size={selected ? 15 : 13} color={colors.textOnColor} strokeWidth={2.5} />
        <AppText
          variant="caption"
          numeric
          numberOfLines={1}
          style={{ color: colors.textOnColor, fontSize: selected ? 11 : 10 }}
        >
          {price}
        </AppText>
      </View>
      <View
        style={{
          width: 0,
          height: 0,
          borderLeftWidth: 5,
          borderRightWidth: 5,
          borderTopWidth: 7,
          borderLeftColor: 'transparent',
          borderRightColor: 'transparent',
          borderTopColor: color,
          marginTop: -1,
        }}
      />
    </View>
  );
}
