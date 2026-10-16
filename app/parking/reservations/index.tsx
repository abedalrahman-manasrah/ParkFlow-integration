import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { CalendarCheck, CalendarX } from 'lucide-react-native';
import { AppHeader, AppText, Card, Divider, EmptyState, ErrorState, ListItem, Screen, Segmented, Skeleton, StatusBadge } from '@/components/ui';
import { useReservations } from '@/hooks/useReservations';
import { useLocale } from '@/hooks/useLocale';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/spacing';
import { formatDateTime, formatDurationShort } from '@/utils/time';
import { formatMoney } from '@/utils/money';
import type { ParkingReservation } from '@/types';

type Tab = 'upcoming' | 'previous';

export default function ReservationsScreen() {
  const router = useRouter();
  const { t, locale, dateLocale } = useLocale();
  const { colors } = useTheme();
  const [tab, setTab] = useState<Tab>('upcoming');
  const { data: reservations = [], isPending, isError, error, refetch } = useReservations();
  const groups = useMemo(() => ({
    upcoming: reservations.filter((item) => ['confirmed', 'checked_in'].includes(item.status) && Date.parse(item.endTime) > Date.now()),
    previous: reservations.filter((item) => !['confirmed', 'checked_in'].includes(item.status) || Date.parse(item.endTime) <= Date.now()),
  }), [reservations]);
  const visible = groups[tab];

  return <Screen>
    <AppHeader title={t('reservation.myReservations')} />
    <View style={{ gap: spacing.lg }}>
      <Segmented value={tab} onChange={setTab} options={[
        { value: 'upcoming', label: t('reservation.upcoming'), badge: groups.upcoming.length },
        { value: 'previous', label: t('reservation.previous'), badge: groups.previous.length },
      ]} />
      {isPending ? <View style={{ gap: spacing.md }}><Skeleton height={104} /><Skeleton height={104} /></View>
        : isError ? <ErrorState error={error} onRetry={() => void refetch()} />
        : visible.length === 0 ? <EmptyState icon={tab === 'upcoming' ? <CalendarCheck size={30} color={colors.brand} /> : <CalendarX size={30} color={colors.textSecondary} />}
            title={tab === 'upcoming' ? t('reservation.emptyUpcoming') : t('reservation.emptyPrevious')} body={t('reservation.emptyBody')} />
        : <Card padding="lg" style={{ paddingVertical: spacing.xs }}>{visible.map((item, index) => <View key={item.id}>
            {index ? <Divider /> : null}
            <ReservationRow reservation={item} locale={locale} dateLocale={dateLocale} t={t} onPress={() => router.push(`/parking/reservation/${item.id}`)} />
          </View>)}</Card>}
    </View>
  </Screen>;
}

function ReservationRow({ reservation, locale, dateLocale, t, onPress }: {
  reservation: ParkingReservation; locale: string; dateLocale: string;
  t: ReturnType<typeof useLocale>['t']; onPress: () => void;
}) {
  return <ListItem
    title={locale === 'ar' ? reservation.zone.nameAr : reservation.zone.name}
    subtitle={`${reservation.spotCode ? `${t('reservation.parkingSpace')} ${reservation.spotCode} · ` : ''}${formatDateTime(reservation.startTime, dateLocale)} · ${formatDurationShort(reservation.durationMinutes * 60)} · ${formatMoney(reservation.estimatedTotalPriceSnapshot)}`}
    trailing={<StatusBadge label={t(`reservation.status.${reservation.status}`)} tone={reservation.status === 'confirmed' || reservation.status === 'checked_in' ? 'success' : 'neutral'} size="sm" />}
    showChevron onPress={onPress}
  />;
}
