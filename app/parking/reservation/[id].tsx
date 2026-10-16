import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import QRCode from 'react-native-qrcode-svg';
import { Navigation, QrCode } from 'lucide-react-native';
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
  SuccessCheck,
} from '@/components/ui';
import { useReservation, useCancelReservation } from '@/hooks/useReservations';
import { useLocale } from '@/hooks/useLocale';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/spacing';
import { formatMoney, formatRate } from '@/utils/money';
import { formatDateTime, formatDurationShort } from '@/utils/time';
import { errorMessage } from '@/utils/errors';
import { useReservationRouteStore } from '@/store/reservationRouteStore';
import { haptics } from '@/utils/haptics';

export default function ReservationDetailsScreen() {
  const { id, created } = useLocalSearchParams<{ id: string; created?: string }>();
  const router = useRouter();
  const { t, dateLocale, locale } = useLocale();
  const { colors } = useTheme();
  const { data: reservation, isPending, isError, error, refetch } = useReservation(id);
  const cancel = useCancelReservation();
  const canCancel = reservation?.status === 'confirmed' && Date.parse(reservation.startTime) > Date.now();

  const routeToParking = () => {
    if (!reservation) return;
    useReservationRouteStore.getState().request(reservation.parkingZoneId);
    router.navigate('/(tabs)/map');
  };

  return <Screen bottomInset={spacing.giant}>
    <AppHeader title={created === '1' ? t('reservation.successTitle') : t('reservation.detailsTitle')} />
    {isError ? <ErrorState error={error} onRetry={() => void refetch()} />
      : isPending || !reservation ? <View style={{ gap: spacing.lg }}><Skeleton height={120} /><Skeleton height={260} /><Skeleton height={180} /></View> : <View style={{ gap: spacing.lg }}>
        {created === '1' ? <View style={{ alignItems: 'center', gap: spacing.sm }}><SuccessCheck /><AppText variant="body" color="textSecondary" align="center">{t('reservation.successBody')}</AppText></View> : null}
        <Card padding="xl" style={{ alignItems: 'center', gap: spacing.md }}>
          <AppText variant="overline" color="textTertiary">{t('reservation.code')}</AppText>
          <AppText variant="h1" numeric>{reservation.publicCode}</AppText>
          <StatusBadge label={t(`reservation.status.${reservation.status}`)} tone={statusTone(reservation.status)} />
        </Card>
        <Card padding="lg" style={{ gap: spacing.sm }}>
          <DetailRow label={t('reservation.parkingLocation')} value={locale === 'ar' ? reservation.zone.nameAr : reservation.zone.name} />
          {reservation.spotCode ? <DetailRow label={t('reservation.parkingSpace')} value={reservation.spotCode} /> : null}
          <DetailRow label={t('reservation.arrival')} value={formatDateTime(reservation.startTime, dateLocale)} />
          <DetailRow label={t('reservation.duration')} value={formatDurationShort(reservation.durationMinutes * 60)} />
          <DetailRow label={t('reservation.hourlyRate')} value={`${formatRate(reservation.hourlyRateSnapshot)}${t('common.perHour')}`} />
          <DetailRow label={t('reservation.estimatedTotal')} value={formatMoney(reservation.estimatedTotalPriceSnapshot)} />
          <AppText variant="caption" color="textTertiary">{reservation.priceIsDemo ? t('reservation.demoPrice') : t('reservation.officialPrice')}</AppText>
        </Card>
        {(reservation.status === 'confirmed' || reservation.status === 'checked_in') ? <Card padding="xl" style={{ alignItems: 'center', gap: spacing.md }}>
          <QrCode size={20} color={colors.textSecondary} />
          <QRCode value={reservation.qrValue} size={196} color={colors.text} backgroundColor={colors.surface} />
          <AppText variant="caption" color="textTertiary" align="center">{t('reservation.qrHint')}</AppText>
        </Card> : null}
        <InlineNotice tone="warning" title={t('reservation.demoTitle')} body={t('reservation.demoDisclaimer')} />
        {cancel.isError ? <AppText variant="caption" color="danger">{errorMessage(cancel.error)}</AppText> : null}
        <AppButton label={t('reservation.route')} variant="secondary" icon={<Navigation size={18} color={colors.text} />} onPress={routeToParking} />
        {canCancel ? <AppButton label={t('reservation.cancel')} variant="danger" loading={cancel.isPending} onPress={() => cancel.mutate(reservation.id, { onSuccess: () => haptics.success(), onError: () => haptics.error() })} /> : null}
      </View>}
  </Screen>;
}

function statusTone(status: string) {
  if (status === 'confirmed' || status === 'checked_in') return 'success' as const;
  if (status === 'cancelled' || status === 'expired') return 'neutral' as const;
  return 'info' as const;
}
