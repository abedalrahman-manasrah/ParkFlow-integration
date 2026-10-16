import { Navigation, X } from 'lucide-react-native';
import { View } from 'react-native';

import { AppButton, AppText } from '@/components/ui';
import { useLocale } from '@/hooks/useLocale';
import { useTheme } from '@/theme/ThemeProvider';
import { radius } from '@/theme/radius';
import { shadow } from '@/theme/shadows';
import { spacing } from '@/theme/spacing';
import type { RamallahParkingLocation, RouteResult } from '@/types';
import { formatDistance } from '@/utils/geo';

interface ParkingRoutePanelProps {
  location: RamallahParkingLocation;
  route?: RouteResult;
  loading: boolean;
  onCancel: () => void;
}

export function ParkingRoutePanel({ location, route, loading, onCancel }: ParkingRoutePanelProps) {
  const { colors } = useTheme();
  const { locale, row, t } = useLocale();
  const name = locale === 'ar' ? location.nameAr : location.name;
  const hasRoadRoute = route?.source === 'osrm';

  return (
    <View
      testID="parking-route-panel"
      style={[
        {
          flexDirection: row,
          alignItems: 'center',
          gap: spacing.md,
          padding: spacing.md,
          borderRadius: radius.xxl,
          backgroundColor: colors.surface,
        },
        shadow.md,
      ]}
    >
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: 18,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.brandSoft,
        }}
      >
        <Navigation size={17} color={colors.brand} strokeWidth={2.4} />
      </View>

      <View style={{ flex: 1, minWidth: 0 }}>
        <AppText variant="label" numberOfLines={1}>
          {name}
        </AppText>
        {loading ? (
          <AppText variant="caption" color="textSecondary">
            {t('route.loading')}
          </AppText>
        ) : hasRoadRoute ? (
          <AppText variant="caption" color="brand" numeric>
            {t('route.summary', {
              minutes: Math.max(1, Math.round(route.durationSeconds / 60)),
              distance: formatDistance(route.distanceMeters),
            })}
          </AppText>
        ) : (
          <AppText variant="caption" color="warningText">
            {t('ramallahParking.routeUnavailable')}
          </AppText>
        )}
      </View>

      <AppButton
        label={t('ramallahParking.cancelRoute')}
        onPress={onCancel}
        variant="ghost"
        size="sm"
        fullWidth={false}
        style={{ paddingHorizontal: spacing.sm }}
        icon={<X size={16} color={colors.textSecondary} strokeWidth={2.4} />}
      />
    </View>
  );
}
