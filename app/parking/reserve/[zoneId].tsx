import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { CalendarDays, Clock3, Timer } from 'lucide-react-native';
import {
  AppButton,
  AppHeader,
  AppText,
  Card,
  DetailRow,
  ErrorState,
  InlineNotice,
  Screen,
  Skeleton,
  StatusBadge,
} from '@/components/ui';
import { useZone } from '@/hooks/useParking';
import { useCreateReservation } from '@/hooks/useReservations';
import { useLocale } from '@/hooks/useLocale';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/spacing';
import { formatMoney, formatRate } from '@/utils/money';
import { formatDate, formatDurationShort, formatTime } from '@/utils/time';
import { errorMessage } from '@/utils/errors';
import { haptics } from '@/utils/haptics';

const HALF_HOUR = 30 * 60_000;
const nextHalfHour = () => Math.ceil((Date.now() + 60_000) / HALF_HOUR) * HALF_HOUR;

export default function ReserveParkingScreen() {
  const router = useRouter();
  const { zoneId, spotId, spotCode } = useLocalSearchParams<{ zoneId: string; spotId?: string; spotCode?: string }>();
  const { t, row, dateLocale, locale } = useLocale();
  const { colors } = useTheme();
  const { data: zone, isPending, isError, error, refetch } = useZone(zoneId);
  const createReservation = useCreateReservation();
  const [startMs, setStartMs] = useState(nextHalfHour);
  const [durationMinutes, setDurationMinutes] = useState(60);

  const start = new Date(startMs);
  const maxDuration = Math.max(30, Math.min(480, Math.floor((zone?.tariff.maxStayMinutes ?? 480) / 30) * 30));
  const estimatedTotal = useMemo(
    () => zone ? Math.ceil(zone.tariff.hourlyRate * durationMinutes / 60) : 0,
    [durationMinutes, zone],
  );
  const inPast = startMs < Date.now();

  const changeDay = (days: number) => {
    const next = new Date(startMs);
    next.setDate(next.getDate() + days);
    if (next.getTime() >= nextHalfHour() && next.getTime() <= Date.now() + 30 * 86_400_000) setStartMs(next.getTime());
  };
  const changeTime = (minutes: number) => {
    const next = startMs + minutes * 60_000;
    if (next >= nextHalfHour()) setStartMs(next);
  };

  const confirm = () => {
    if (!zone || !spotId || inPast) return;
    createReservation.mutate(
      { zoneId: zone.id, spotId, startTime: start.toISOString(), durationMinutes },
      {
        onSuccess: (reservation) => {
          haptics.success();
          router.replace({ pathname: '/parking/reservation/[id]', params: { id: reservation.id, created: '1' } });
        },
        onError: () => haptics.error(),
      },
    );
  };

  if (isError) return <Screen><AppHeader title={t('reservation.title')} leading="close" /><ErrorState error={error} onRetry={() => void refetch()} /></Screen>;

  return (
    <Screen bottomInset={spacing.giant}>
      <AppHeader title={t('reservation.title')} subtitle={t('reservation.subtitle')} leading="close" />
      {isPending || !zone ? <View style={{ gap: spacing.lg }}><Skeleton height={120} /><Skeleton height={220} /><Skeleton height={140} /></View> : (
        <View style={{ gap: spacing.lg }}>
          <Card padding="lg" style={{ gap: spacing.sm }}>
            <AppText variant="h3">{locale === 'ar' ? zone.nameAr : zone.name}</AppText>
            <AppText variant="bodySm" color="textSecondary">{zone.code} · {locale === 'ar' ? zone.cityAr : zone.city}</AppText>
            <DetailRow label={t('reservation.hourlyRate')} value={`${formatRate(zone.tariff.hourlyRate)}${t('common.perHour')}`} />
            <DetailRow label={t('reservation.parkingSpace')} value={spotCode ?? '—'} />
            <StatusBadge
              label={zone.prototypeData ? t('reservation.demoPrice') : t('reservation.officialPrice')}
              tone={zone.prototypeData ? 'warning' : 'info'}
              size="sm"
            />
          </Card>

          <Card padding="lg" style={{ gap: spacing.lg }}>
            <PickerRow icon={<CalendarDays size={18} color={colors.textSecondary} />} label={t('reservation.arrivalDate')} value={formatDate(start.toISOString(), dateLocale)} row={row}
              onMinus={() => changeDay(-1)} onPlus={() => changeDay(1)} minusDisabled={startMs - 86_400_000 < nextHalfHour()} />
            <PickerRow icon={<Clock3 size={18} color={colors.textSecondary} />} label={t('reservation.arrivalTime')} value={formatTime(start.toISOString(), dateLocale)} row={row}
              onMinus={() => changeTime(-30)} onPlus={() => changeTime(30)} minusDisabled={startMs - HALF_HOUR < nextHalfHour()} />
            <PickerRow icon={<Timer size={18} color={colors.textSecondary} />} label={t('reservation.duration')} value={formatDurationShort(durationMinutes * 60)} row={row}
              onMinus={() => setDurationMinutes((value) => Math.max(30, value - 30))}
              onPlus={() => setDurationMinutes((value) => Math.min(maxDuration, value + 30))}
              minusDisabled={durationMinutes <= 30} plusDisabled={durationMinutes >= maxDuration} />
          </Card>

          <Card padding="lg" tone="outline" style={{ gap: spacing.sm }}>
            <AppText variant="label" color="textSecondary">{t('reservation.estimatedTotal')}</AppText>
            <AppText variant="h1" numeric>{formatMoney(estimatedTotal)}</AppText>
            <AppText variant="caption" color="textTertiary">{t('reservation.noPayment')}</AppText>
          </Card>

          <InlineNotice tone="warning" title={t('reservation.demoTitle')} body={t('reservation.demoDisclaimer')} />
          {inPast ? <AppText variant="caption" color="danger">{t('reservation.pastError')}</AppText> : null}
          {createReservation.isError ? <AppText variant="caption" color="danger">{errorMessage(createReservation.error)}</AppText> : null}
          {!spotId ? <InlineNotice tone="danger" title={t('parkingLayout.selectedSpace')} body={t('parkingLayout.selectPrompt')} /> : null}
          <AppButton label={t('reservation.confirm')} onPress={confirm} loading={createReservation.isPending} disabled={inPast || !spotId} />
        </View>
      )}
    </Screen>
  );
}

function PickerRow({ icon, label, value, row, onMinus, onPlus, minusDisabled, plusDisabled }: {
  icon: React.ReactNode; label: string; value: string; row: 'row' | 'row-reverse';
  onMinus: () => void; onPlus: () => void; minusDisabled?: boolean; plusDisabled?: boolean;
}) {
  return <View style={{ gap: spacing.sm }}>
    <View style={{ flexDirection: row, alignItems: 'center', gap: spacing.sm }}>{icon}<AppText variant="label" color="textSecondary">{label}</AppText></View>
    <View style={{ flexDirection: row, alignItems: 'center', gap: spacing.sm }}>
      <AppButton label="−" size="sm" variant="secondary" fullWidth={false} onPress={onMinus} disabled={minusDisabled} style={{ width: 52 }} />
      <AppText variant="titleLg" numeric align="center" style={{ flex: 1 }}>{value}</AppText>
      <AppButton label="+" size="sm" variant="secondary" fullWidth={false} onPress={onPlus} disabled={plusDisabled} style={{ width: 52 }} />
    </View>
  </View>;
}
