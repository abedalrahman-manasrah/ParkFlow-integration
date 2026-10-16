import { useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Users } from 'lucide-react-native';

import {
  AppButton,
  AppHeader,
  AppText,
  Card,
  DetailRow,
  Divider,
  ErrorState,
  InlineNotice,
  Screen,
  Skeleton,
  StatusBadge,
} from '@/components/ui';
import { StepperRow } from '@/components/domain/StepperRow';
import { RatingPicker } from '@/components/domain/RatingPicker';
import { useRide, useRideAction, useSetGender } from '@/hooks/useSharing';
import { useCurrentUser } from '@/hooks/useSession';
import { useLocale } from '@/hooks/useLocale';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/spacing';
import { cityLabel } from '@/data/cities';
import { formatDateTime } from '@/utils/time';
import { errorMessage } from '@/utils/errors';
import { haptics } from '@/utils/haptics';
import { rideBookingTone, ratingText } from '@/utils/sharing';
import type { Ride } from '@/types';

export default function RideDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useLocale();
  const { data: ride, isPending, isError, error, refetch } = useRide(id);
  const action = useRideAction();

  return (
    <Screen bottomInset={spacing.giant}>
      <AppHeader title={t('ride.detailsTitle')} />
      {isError ? <ErrorState error={error} onRetry={() => void refetch()} />
        : isPending || !ride ? <View style={{ gap: spacing.lg }}><Skeleton height={140} /><Skeleton height={220} /></View>
        : (
          <View style={{ gap: spacing.lg }}>
            <Summary ride={ride} />
            {action.isError ? <InlineNotice tone="danger" title={t('common.somethingWrong')} body={errorMessage(action.error)} /> : null}
            {ride.isDriver ? <DriverPanel ride={ride} action={action} /> : <PassengerPanel ride={ride} action={action} />}
          </View>
        )}
    </Screen>
  );
}

type Action = ReturnType<typeof useRideAction>;
const feedback = { onSuccess: () => haptics.success(), onError: () => haptics.error() };

function Summary({ ride }: { ride: Ride }) {
  const { t, locale, dateLocale, isRTL } = useLocale();
  const rating = ratingText(ride.driver.rating);
  const car = [ride.vehicle?.color, ride.vehicle?.make, ride.vehicle?.model].filter(Boolean).join(' ');
  return (
    <>
      <Card padding="xl" style={{ gap: spacing.sm, alignItems: 'center' }}>
        <AppText variant="h2" align="center">{cityLabel(ride.fromCity, locale)} {isRTL ? '←' : '→'} {cityLabel(ride.toCity, locale)}</AppText>
        <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap', justifyContent: 'center' }}>
          {ride.womenOnly ? <StatusBadge label={t('ride.womenOnly')} tone="brand" size="sm" /> : null}
          <StatusBadge label={ride.status === 'open' ? (ride.seatsLeft ? t('ride.seatsLeft', { count: ride.seatsLeft }) : t('ride.full')) : t(`ride.status.${ride.status}`)}
            tone={ride.status === 'open' && ride.seatsLeft ? 'success' : 'neutral'} size="sm" />
        </View>
      </Card>
      <Card padding="lg" style={{ gap: spacing.sm }}>
        <DetailRow label={t('ride.departure')} value={formatDateTime(ride.departAt, dateLocale)} />
        <DetailRow label={t('ride.meetingPoint')} value={ride.meetingPoint} />
        <DetailRow label={t('ride.driver')} value={`${ride.driver.firstName} · ${rating ? t('ride.ratingLine', { rating, count: ride.driver.ratingCount }) : t('ride.newDriver')}`} />
        {ride.driver.completedRides ? <AppText variant="caption" color="textTertiary">{t('ride.tripsLine', { count: ride.driver.completedRides })}</AppText> : null}
        {car ? <DetailRow label={t('ride.car')} value={car} /> : null}
        <DetailRow label={t('ride.plate')} value={ride.vehicle?.plateNumber ?? t('ride.plateHidden')} />
      </Card>
      {ride.notes ? (
        <Card padding="lg" tone="outline" style={{ gap: spacing.xs }}>
          <AppText variant="label" color="textSecondary">{t('ride.notes')}</AppText>
          <AppText variant="body">{ride.notes}</AppText>
        </Card>
      ) : null}
    </>
  );
}

function PassengerPanel({ ride, action }: { ride: Ride; action: Action }) {
  const { t, row } = useLocale();
  const { colors } = useTheme();
  const { user } = useCurrentUser();
  const setGender = useSetGender();
  const [seats, setSeats] = useState(1);
  // A seat you cancelled yourself is history, not something to show above the booking form.
  const booking = ride.myBooking?.status === 'cancelled' ? undefined : ride.myBooking;
  const holdsSeat = booking && (booking.status === 'pending' || booking.status === 'accepted');
  const canBook = ride.status === 'open' && ride.seatsLeft > 0 && !holdsSeat && Date.parse(ride.departAt) > Date.now();
  const needsWoman = ride.womenOnly && user?.gender !== 'female';

  return (
    <>
      {booking ? (
        <Card padding="lg" style={{ gap: spacing.md }}>
          <View style={{ flexDirection: row, justifyContent: 'space-between', alignItems: 'center' }}>
            <AppText variant="title">{t('ride.yourBooking')}</AppText>
            <StatusBadge label={t(`ride.booking.${booking.status}`)} tone={rideBookingTone(booking.status)} size="sm" />
          </View>
          <DetailRow label={t('ride.seats')} value={String(booking.seats)} />
          {booking.status === 'completed' ? (
            <RatingPicker label={t('ride.rateDriver')} value={booking.driverRating} disabled={action.isPending}
              onRate={(rating) => action.mutate({ kind: 'rate', bookingId: booking.id, rating }, feedback)} />
          ) : null}
          {holdsSeat && Date.parse(ride.departAt) > Date.now() ? (
            <AppButton label={t('ride.cancelBooking')} variant="danger" loading={action.isPending}
              onPress={() => action.mutate({ kind: 'cancelBooking', bookingId: booking.id }, feedback)} />
          ) : null}
        </Card>
      ) : null}

      {canBook ? (
        <Card padding="lg" style={{ gap: spacing.lg }}>
          <StepperRow icon={<Users size={18} color={colors.textSecondary} />} label={t('ride.seats')} value={String(seats)}
            onMinus={() => setSeats((n) => Math.max(1, n - 1))} onPlus={() => setSeats((n) => Math.min(ride.seatsLeft, n + 1))}
            minusDisabled={seats <= 1} plusDisabled={seats >= ride.seatsLeft} />
          {needsWoman ? (
            <>
              <InlineNotice tone="info" title={t('ride.womenOnlyNotice')} />
              <AppButton label={t('ride.confirmWoman')} variant="secondary" loading={setGender.isPending} onPress={() => setGender.mutate('female')} />
            </>
          ) : (
            <AppButton label={t('ride.book')} loading={action.isPending}
              onPress={() => action.mutate({ kind: 'book', rideId: ride.id, seats }, feedback)} />
          )}
        </Card>
      ) : null}
    </>
  );
}

function DriverPanel({ ride, action }: { ride: Ride; action: Action }) {
  const { t, row } = useLocale();
  const bookings = (ride.bookings ?? []).filter((b) => b.status !== 'cancelled');
  const departed = Date.parse(ride.departAt) <= Date.now();

  return (
    <>
      <Card padding="lg" style={{ gap: spacing.md }}>
        <AppText variant="title">{t('ride.requests')}</AppText>
        {bookings.length === 0 ? <AppText variant="bodySm" color="textSecondary">{t('ride.noRequests')}</AppText> : bookings.map((b, index) => (
          <View key={b.id} style={{ gap: spacing.sm }}>
            {index ? <Divider /> : null}
            <View style={{ flexDirection: row, alignItems: 'center', gap: spacing.sm }}>
              <AppText variant="body" style={{ flex: 1 }}>{t('ride.passengerLine', { name: b.passengerName ?? '—', seats: b.seats })}</AppText>
              <StatusBadge label={t(`ride.booking.${b.status}`)} tone={rideBookingTone(b.status)} size="sm" />
            </View>
            {b.status === 'pending' && ride.status === 'open' ? (
              <View style={{ flexDirection: row, gap: spacing.sm }}>
                <AppButton label={t('ride.accept')} size="sm" style={{ flex: 1 }} disabled={action.isPending}
                  onPress={() => action.mutate({ kind: 'accept', bookingId: b.id }, feedback)} />
                <AppButton label={t('ride.decline')} size="sm" variant="secondary" style={{ flex: 1 }} disabled={action.isPending}
                  onPress={() => action.mutate({ kind: 'decline', bookingId: b.id }, feedback)} />
              </View>
            ) : null}
            {b.status === 'completed' ? (
              <RatingPicker label={t('ride.ratePassenger')} value={b.passengerRating} disabled={action.isPending}
                onRate={(rating) => action.mutate({ kind: 'rate', bookingId: b.id, rating }, feedback)} />
            ) : null}
          </View>
        ))}
      </Card>
      {ride.status === 'open' ? (
        <View style={{ gap: spacing.sm }}>
          {departed ? (
            <>
              <AppButton label={t('ride.complete')} loading={action.isPending} onPress={() => action.mutate({ kind: 'completeRide', rideId: ride.id }, feedback)} />
              <AppText variant="caption" color="textTertiary">{t('ride.completeHint')}</AppText>
            </>
          ) : (
            <AppButton label={t('ride.cancelRide')} variant="danger" loading={action.isPending} onPress={() => action.mutate({ kind: 'cancelRide', rideId: ride.id }, feedback)} />
          )}
        </View>
      ) : null}
    </>
  );
}
