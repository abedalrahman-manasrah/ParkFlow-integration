import { Linking, View } from 'react-native';
import { Navigation } from 'lucide-react-native';
import { AppButton, AppText, StatusBadge } from '@/components/ui';
import { RatingPicker } from '@/components/domain/RatingPicker';
import { useSpotAction } from '@/hooks/useSharing';
import { useLocale } from '@/hooks/useLocale';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/spacing';
import { formatMoney } from '@/utils/money';
import { formatDateTime, formatTime } from '@/utils/time';
import { haptics } from '@/utils/haptics';
import { errorMessage } from '@/utils/errors';
import { spotBookingTone } from '@/utils/sharing';
import type { SpotBooking } from '@/types';

/** Buttons share the row but wrap to a new line before a label gets cut off. */
const grow = { flexGrow: 1, flexBasis: 120 };
const feedback = { onSuccess: () => haptics.success(), onError: () => haptics.error() };

/** One booking with the actions that make sense for whoever is looking at it. */
export function SpotBookingRow({ booking, showSpot }: { booking: SpotBooking; showSpot?: boolean }) {
  const { t, row, dateLocale } = useLocale();
  const { colors } = useTheme();
  const action = useSpotAction();
  const now = Date.now();
  const start = Date.parse(booking.startTime), end = Date.parse(booking.endTime);
  const run = (kind: 'accept' | 'decline' | 'cancel' | 'check-in' | 'complete') => action.mutate({ kind, bookingId: booking.id }, feedback);
  const { spot } = booking;
  const directions = () => void Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${spot.location.latitude},${spot.location.longitude}`);

  return (
    <View style={{ gap: spacing.sm }}>
      <View style={{ flexDirection: row, alignItems: 'center', gap: spacing.sm }}>
        <View style={{ flex: 1, gap: 2 }}>
          {showSpot ? <AppText variant="title">{spot.title}</AppText> : null}
          <AppText variant="bodySm" color="textSecondary">
            {formatDateTime(booking.startTime, dateLocale)} – {formatTime(booking.endTime, dateLocale)} · {formatMoney(booking.amount)}
          </AppText>
        </View>
        <StatusBadge label={t(`spot.booking.${booking.status}`)} tone={spotBookingTone(booking.status)} size="sm" />
      </View>
      {!booking.isHost && spot.fullAddress && (booking.status === 'confirmed' || booking.status === 'active') ? (
        <AppText variant="bodySm">{spot.fullAddress}</AppText>
      ) : null}
      <View style={{ flexDirection: row, gap: spacing.sm, flexWrap: 'wrap' }}>
        {booking.isHost && booking.status === 'pending' ? (
          <>
            <AppButton label={t('ride.accept')} size="sm" style={grow} disabled={action.isPending} onPress={() => run('accept')} />
            <AppButton label={t('ride.decline')} size="sm" variant="secondary" style={grow} disabled={action.isPending} onPress={() => run('decline')} />
          </>
        ) : null}
        {!booking.isHost && booking.status === 'confirmed' && now >= start - 15 * 60_000 && now < end ? (
          <AppButton label={t('spot.checkIn')} size="sm" style={grow} disabled={action.isPending} onPress={() => run('check-in')} />
        ) : null}
        {booking.status === 'active' ? (
          <AppButton label={t('spot.leave')} size="sm" style={grow} disabled={action.isPending} onPress={() => run('complete')} />
        ) : null}
        {!booking.isHost && (booking.status === 'confirmed' || booking.status === 'active') ? (
          <AppButton label={t('spot.directions')} size="sm" variant="secondary" style={grow} icon={<Navigation size={16} color={colors.text} />} onPress={directions} />
        ) : null}
        {(booking.status === 'pending' || booking.status === 'confirmed') && start > now && !(booking.isHost && booking.status === 'pending') ? (
          <AppButton label={t('common.cancel')} size="sm" variant="danger" style={grow} disabled={action.isPending} onPress={() => run('cancel')} />
        ) : null}
      </View>
      {action.isError ? <AppText variant="caption" color="danger">{errorMessage(action.error)}</AppText> : null}
      {booking.status === 'completed' ? (
        booking.isHost
          ? <RatingPicker label={t('spot.rateDriver')} value={booking.driverRating} disabled={action.isPending} onRate={(rating) => action.mutate({ kind: 'rate', bookingId: booking.id, rating }, feedback)} />
          : <RatingPicker label={t('spot.rateHost')} value={booking.hostRating} disabled={action.isPending} onRate={(rating) => action.mutate({ kind: 'rate', bookingId: booking.id, rating }, feedback)} />
      ) : null}
    </View>
  );
}
