import type { ReactNode } from 'react';
import { View } from 'react-native';
import { ArrowRight, Star } from 'lucide-react-native';
import { AppText, Card, StatusBadge } from '@/components/ui';
import { useLocale } from '@/hooks/useLocale';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/spacing';
import { cityLabel } from '@/data/cities';
import { formatMoney } from '@/utils/money';
import { formatDateTime } from '@/utils/time';
import { ratingText } from '@/utils/sharing';
import type { HostSpot, Ride } from '@/types';

/** Summary card for a shared ride: route, departure, driver and seats. */
export function RideCard({ ride, onPress, badge }: { ride: Ride; onPress: () => void; badge?: ReactNode }) {
  const { t, row, locale, dateLocale, isRTL } = useLocale();
  const { colors } = useTheme();
  const rating = ratingText(ride.driver.rating);
  return (
    <Card padding="lg" onPress={onPress} style={{ gap: spacing.sm }}>
      <View style={{ flexDirection: row, alignItems: 'center', gap: spacing.sm }}>
        <AppText variant="titleLg">{cityLabel(ride.fromCity, locale)}</AppText>
        <ArrowRight size={18} color={colors.textTertiary} style={isRTL ? { transform: [{ scaleX: -1 }] } : undefined} />
        <AppText variant="titleLg" style={{ flex: 1 }}>{cityLabel(ride.toCity, locale)}</AppText>
      </View>
      <AppText variant="bodySm" color="textSecondary">{formatDateTime(ride.departAt, dateLocale)} · {ride.meetingPoint}</AppText>
      <View style={{ flexDirection: row, alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' }}>
        <View style={{ flexDirection: row, alignItems: 'center', gap: 4 }}>
          <Star size={14} color={colors.warning} fill={rating ? colors.warning : 'transparent'} />
          <AppText variant="caption" color="textSecondary">{ride.driver.firstName}{rating ? ` · ${rating}` : ` · ${t('ride.newDriver')}`}</AppText>
        </View>
        <View style={{ flex: 1 }} />
        {badge}
        {ride.womenOnly ? <StatusBadge label={t('ride.womenOnly')} tone="brand" size="sm" /> : null}
        {ride.status === 'open'
          ? <StatusBadge label={ride.seatsLeft ? t('ride.seatsLeft', { count: ride.seatsLeft }) : t('ride.full')} tone={ride.seatsLeft ? 'success' : 'neutral'} size="sm" />
          : <StatusBadge label={t(`ride.status.${ride.status}`)} tone="neutral" size="sm" />}
      </View>
    </Card>
  );
}

/** Summary card for a private parking spot: price, area, distance and perks. */
export function SpotCard({ spot, onPress, badge }: { spot: HostSpot; onPress: () => void; badge?: ReactNode }) {
  const { t, row, locale } = useLocale();
  const { colors } = useTheme();
  const rating = ratingText(spot.rating);
  return (
    <Card padding="lg" onPress={onPress} style={{ gap: spacing.sm }}>
      <View style={{ flexDirection: row, alignItems: 'flex-start', gap: spacing.sm }}>
        <AppText variant="titleLg" style={{ flex: 1 }}>{spot.title}</AppText>
        <AppText variant="titleLg" numeric color="brand">{formatMoney(spot.hourlyRate)}<AppText variant="caption" color="textTertiary">{t('common.perHour')}</AppText></AppText>
      </View>
      <AppText variant="bodySm" color="textSecondary">
        {cityLabel(spot.city, locale)} · {spot.areaHint}{spot.distanceKm != null ? ` · ${t('spot.kmAway', { km: spot.distanceKm })}` : ''}
      </AppText>
      <View style={{ flexDirection: row, alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' }}>
        <View style={{ flexDirection: row, alignItems: 'center', gap: 4 }}>
          <Star size={14} color={colors.warning} fill={rating ? colors.warning : 'transparent'} />
          <AppText variant="caption" color="textSecondary">{spot.host.firstName}{rating ? ` · ${rating}` : ''}</AppText>
        </View>
        <View style={{ flex: 1 }} />
        {badge}
        {spot.covered ? <StatusBadge label={t('spot.covered')} tone="info" size="sm" /> : null}
        {spot.instantBook ? <StatusBadge label={t('spot.instant')} tone="success" size="sm" /> : null}
      </View>
    </Card>
  );
}
