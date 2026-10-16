import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { CalendarDays, Clock3, Timer } from 'lucide-react-native';

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
import { SpotBookingRow } from '@/components/domain/SpotBookingRow';
import { useSpot, useSpotAction } from '@/hooks/useSharing';
import { useLocale } from '@/hooks/useLocale';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/spacing';
import { cityLabel } from '@/data/cities';
import { formatMoney } from '@/utils/money';
import { formatDate, formatTime } from '@/utils/time';
import { errorMessage } from '@/utils/errors';
import { haptics } from '@/utils/haptics';
import { availabilityLabel, ratingText } from '@/utils/sharing';
import type { HostSpotDetails } from '@/types';

const HALF_HOUR = 30 * 60_000;
const HOUR = 3_600_000;
const nextHalfHour = () => Math.ceil(Date.now() / HALF_HOUR) * HALF_HOUR;
const minutesOf = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/** Mirrors the server: hourly price, but no single day costs more than the daily rate. */
function priceFor(spot: HostSpotDetails, hours: number) {
  const hourly = spot.hourlyRate * hours;
  if (!spot.dailyRate) return hourly;
  return Math.min(hourly, Math.floor(hours / 24) * spot.dailyRate + Math.min((hours % 24) * spot.hourlyRate, spot.dailyRate));
}

/** A quick on-device check so drivers see the problem before tapping; the server has the final say. */
function fitsHours(spot: HostSpotDetails, start: number, end: number) {
  const open = minutesOf(spot.availableFrom);
  const close = spot.availableTo === '00:00' ? 1440 : minutesOf(spot.availableTo);
  for (let t = start; t < end; t += HALF_HOUR) {
    const d = new Date(t);
    const minutes = d.getHours() * 60 + d.getMinutes();
    if (!spot.weekdays.includes(d.getDay()) || minutes < open || minutes + 30 > close) return false;
  }
  return true;
}

export default function SpotDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, locale, dateLocale } = useLocale();
  const { data: spot, isPending, isError, error, refetch } = useSpot(id);

  return (
    <Screen bottomInset={spacing.giant}>
      <AppHeader title={t('spot.detailsTitle')} />
      {isError ? <ErrorState error={error} onRetry={() => void refetch()} />
        : isPending || !spot ? <View style={{ gap: spacing.lg }}><Skeleton height={140} /><Skeleton height={220} /></View>
        : (
          <View style={{ gap: spacing.lg }}>
            <Card padding="xl" style={{ gap: spacing.sm }}>
              <AppText variant="h2">{spot.title}</AppText>
              <AppText variant="h1" numeric color="brand">
                {formatMoney(spot.hourlyRate)}<AppText variant="body" color="textTertiary"> {t('common.perHour')}</AppText>
                {spot.dailyRate ? <AppText variant="body" color="textSecondary">  ·  {formatMoney(spot.dailyRate)} {t('spot.perDay')}</AppText> : null}
              </AppText>
              <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' }}>
                {!spot.active ? <StatusBadge label={t('spot.paused')} tone="warning" size="sm" /> : null}
                <StatusBadge label={spot.covered ? t('spot.covered') : t('spot.openAir')} tone="info" size="sm" />
                {spot.vehicleSize === 'van' ? <StatusBadge label={t('spot.van')} tone="info" size="sm" /> : null}
                {spot.instantBook ? <StatusBadge label={t('spot.instant')} tone="success" size="sm" /> : null}
              </View>
              {spot.description ? <AppText variant="body" color="textSecondary">{spot.description}</AppText> : null}
            </Card>
            <Card padding="lg" style={{ gap: spacing.sm }}>
              <DetailRow label={t('spot.area')} value={`${cityLabel(spot.city, locale)} · ${spot.areaHint}`} />
              <DetailRow label={t('spot.available')} value={availabilityLabel(spot, dateLocale, t)} />
              <DetailRow label={t('spot.host')} value={`${spot.host.firstName}${ratingText(spot.rating) ? ` · ${ratingText(spot.rating)} ★ (${spot.ratingCount})` : ''}`} />
              {spot.fullAddress ? <DetailRow label={t('spot.address')} value={spot.fullAddress} stacked /> : <AppText variant="caption" color="textTertiary">{t('spot.addressHidden')}</AppText>}
            </Card>
            {spot.isHost ? <HostPanel spot={spot} /> : <BookingPanel spot={spot} />}
          </View>
        )}
    </Screen>
  );
}

function BookingPanel({ spot }: { spot: HostSpotDetails }) {
  const { t, dateLocale } = useLocale();
  const { colors } = useTheme();
  const book = useSpotAction();
  const [startMs, setStartMs] = useState(nextHalfHour);
  const [hours, setHours] = useState(2);
  const endMs = startMs + hours * HOUR;
  const price = priceFor(spot, hours);
  const outside = !fitsHours(spot, startMs, endMs);
  const taken = useMemo(() => spot.busy.some((b) => Date.parse(b.startTime) < endMs && Date.parse(b.endTime) > startMs), [spot.busy, startMs, endMs]);

  const shiftStart = (ms: number) => {
    const next = startMs + ms;
    if (next >= nextHalfHour() && next <= Date.now() + 30 * 86_400_000) setStartMs(next);
  };
  const confirm = () => book.mutate(
    { kind: 'book', spotId: spot.id, startTime: new Date(startMs).toISOString(), hours },
    { onSuccess: () => haptics.success(), onError: () => haptics.error() },
  );

  return (
    <>
      {spot.bookings.length ? (
        <Card padding="lg" style={{ gap: spacing.md }}>
          <AppText variant="title">{t('spot.yourBookings')}</AppText>
          {spot.bookings.map((b, index) => <View key={b.id} style={{ gap: spacing.md }}>{index ? <Divider /> : null}<SpotBookingRow booking={b} /></View>)}
        </Card>
      ) : null}
      {spot.active ? (
        <Card padding="lg" style={{ gap: spacing.lg }}>
          <AppText variant="title">{t('spot.bookTitle')}</AppText>
          <StepperRow icon={<CalendarDays size={18} color={colors.textSecondary} />} label={t('spot.date')} value={formatDate(new Date(startMs).toISOString(), dateLocale)}
            onMinus={() => shiftStart(-24 * HOUR)} onPlus={() => shiftStart(24 * HOUR)} minusDisabled={startMs - 24 * HOUR < nextHalfHour()} />
          <StepperRow icon={<Clock3 size={18} color={colors.textSecondary} />} label={t('spot.arrival')} value={formatTime(new Date(startMs).toISOString(), dateLocale)}
            onMinus={() => shiftStart(-HALF_HOUR)} onPlus={() => shiftStart(HALF_HOUR)} minusDisabled={startMs - HALF_HOUR < nextHalfHour()} />
          <StepperRow icon={<Timer size={18} color={colors.textSecondary} />} label={t('spot.duration')} value={t('spot.hoursCount', { count: hours })}
            onMinus={() => setHours((h) => Math.max(1, h - 1))} onPlus={() => setHours((h) => Math.min(168, h + 1))} minusDisabled={hours <= 1} plusDisabled={hours >= 168} />
          {outside ? <InlineNotice tone="warning" title={t('spot.outsideHours')} body={availabilityLabel(spot, dateLocale, t)} /> : null}
          {taken ? <InlineNotice tone="warning" title={t('spot.taken')} /> : null}
          <AppText variant="caption" color="textTertiary">{t('spot.heldNote')}</AppText>
          {book.isError ? <AppText variant="caption" color="danger">{errorMessage(book.error)}</AppText> : null}
          <AppButton label={t(spot.instantBook ? 'spot.book' : 'spot.requestBook', { price: formatMoney(price) })}
            onPress={confirm} loading={book.isPending} disabled={outside || taken} />
        </Card>
      ) : null}
    </>
  );
}

function HostPanel({ spot }: { spot: HostSpotDetails }) {
  const { t } = useLocale();
  const action = useSpotAction();
  return (
    <>
      <Card padding="lg" style={{ gap: spacing.md }}>
        <AppText variant="title">{t('spot.bookings')}</AppText>
        {spot.bookings.length === 0 ? <AppText variant="bodySm" color="textSecondary">{t('ride.noRequests')}</AppText>
          : spot.bookings.map((b, index) => <View key={b.id} style={{ gap: spacing.md }}>{index ? <Divider /> : null}<SpotBookingRow booking={b} /></View>)}
      </Card>
      <AppText variant="caption" color="textTertiary">{t('spot.privacyNote')}</AppText>
      <AppButton label={spot.active ? t('spot.pause') : t('spot.resume')} variant="secondary" loading={action.isPending}
        onPress={() => action.mutate({ kind: 'setActive', spotId: spot.id, active: !spot.active }, { onSuccess: () => haptics.success() })} />
    </>
  );
}
