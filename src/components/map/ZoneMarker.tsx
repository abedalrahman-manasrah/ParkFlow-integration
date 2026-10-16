import { View } from 'react-native';
import { Accessibility, CircleParking, Building2 } from 'lucide-react-native';
import { AppText } from '@/components/ui/AppText';
import { useTheme } from '@/theme/ThemeProvider';
import type { ColorScheme } from '@/theme/colors';
import { radius } from '@/theme/radius';
import { spacing } from '@/theme/spacing';
import { shadow } from '@/theme/shadows';
import type { AvailabilityLevel, ParkingZone } from '@/types';
import { formatRate } from '@/utils/money';

/** Availability colour mapping, shared by markers, badges and the zone sheet. */
export function availabilityColor(level: AvailabilityLevel, colors: ColorScheme): string {
  switch (level) {
    case 'available':
      return colors.success;
    case 'limited':
      return colors.warning;
    case 'full':
      return colors.danger;
    default:
      return colors.textTertiary;
  }
}

export function availabilityTone(level: AvailabilityLevel) {
  switch (level) {
    case 'available':
      return 'success' as const;
    case 'limited':
      return 'warning' as const;
    case 'full':
      return 'danger' as const;
    default:
      return 'neutral' as const;
  }
}

export interface ZoneMarkerProps {
  zone: ParkingZone;
  selected?: boolean;
}

/**
 * The map pin. It carries the two facts a driver decides on — price and whether
 * there is space — and nothing else. Availability is shown by colour *and* by
 * the pin's dot, so colour is never the only signal.
 */
export function ZoneMarker({ zone, selected = false }: ZoneMarkerProps) {
  const { colors } = useTheme();
  const statusColor = availabilityColor(zone.availability, colors);
  const isGarage = zone.kind === 'garage' || zone.kind === 'private';
  const Icon = isGarage ? Building2 : CircleParking;

  // Private/garage stock reads as blue per the product's status language.
  const accent = isGarage ? colors.info : statusColor;

  const hasAccessibleSpots = (zone.accessibleSpots ?? 0) > 0;

  return (
    <View style={{ alignItems: 'center' }}>
      {hasAccessibleSpots ? (
        <View
          style={{
            position: 'absolute',
            top: -6,
            end: -6,
            zIndex: 1,
            width: 18,
            height: 18,
            borderRadius: 9,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.info,
            borderWidth: 1.5,
            borderColor: colors.surface,
          }}
        >
          <Accessibility size={11} color={colors.textOnColor} strokeWidth={2.6} />
        </View>
      ) : null}
      <View
        style={[
          {
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.xs + 2,
            paddingVertical: selected ? 8 : 6,
            paddingHorizontal: selected ? spacing.md : spacing.sm + 2,
            borderRadius: radius.pill,
            backgroundColor: selected ? colors.deep : colors.surface,
            borderWidth: 2,
            borderColor: selected ? colors.deep : accent,
          },
          selected ? shadow.lg : shadow.sm,
        ]}
      >
        <Icon size={selected ? 16 : 14} color={selected ? colors.accent : accent} strokeWidth={2.6} />
        <AppText
          variant={selected ? 'label' : 'caption'}
          numeric
          forceLtrAlign
          style={{ color: selected ? colors.onDeep : colors.text }}
        >
          {formatRate(zone.tariff.hourlyRate)}
        </AppText>
      </View>

      {/* Stem + ground dot so the pin reads as anchored to a place. */}
      <View
        style={{
          width: 2,
          height: 8,
          backgroundColor: selected ? colors.deep : accent,
        }}
      />
      <View
        style={{
          width: 8,
          height: 8,
          borderRadius: 4,
          backgroundColor: selected ? colors.deep : accent,
          borderWidth: 2,
          borderColor: colors.surface,
        }}
      />
    </View>
  );
}
