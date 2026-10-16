import { useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { AppHeader, AppText, AppButton, Card, EmptyState, ErrorState, InlineNotice, Screen, SkeletonGroup, TextField } from '@parkflow/client/components/ui';
import { useOperatorReservations, useOperatorSummary, useOperatorAvailability, useOperatorCheckIn, useOperatorRecovery } from '@parkflow/client/hooks/useOperator';
import { spacing } from '@parkflow/design/spacing';
import { useLocale } from '@parkflow/client/hooks/useLocale';
import type { OperatorAvailability, OperatorReservation } from '@parkflow/contracts/services';
import type { TranslationKey } from '@parkflow/client/i18n';

const availabilityOptions: OperatorAvailability[] = ['available', 'limited', 'full', 'unknown'];
const availabilityLabels: Record<OperatorAvailability, TranslationKey> = {
  available: 'operator.availability.available',
  limited: 'operator.availability.limited',
  full: 'operator.availability.full',
  unknown: 'operator.availability.unknown',
};

function ReservationCard({ reservation: r }: { reservation: OperatorReservation }) {
  const { t, locale } = useLocale();
  const checkIn = useOperatorCheckIn();
  const recovery = useOperatorRecovery();
  const [qrToken, setQrToken] = useState('');
  const [recoveryNote, setRecoveryNote] = useState('');
  return <Card>
    <AppText>{r.publicCode} · {r.status}</AppText>
    {r.operatorResolution && r.operatorResolution !== 'none' ? <AppText color="textSecondary">{r.operatorResolution === 'alternative' ? t('operator.alternativeProvided') : t('operator.refundRequested')}</AppText> : null}
    {r.status === 'confirmed' && <>
      <TextField label={t('operator.qrToken')} value={qrToken} onChangeText={setQrToken} placeholder={t('operator.qrTokenPlaceholder')} autoCapitalize="none" />
      <AppButton label={t('operator.checkIn')} onPress={() => checkIn.mutate({ reservationId: r.id, qrToken: qrToken.trim() || undefined })} loading={checkIn.isPending} />
      <TextField label={t('operator.recoveryNote')} value={recoveryNote} onChangeText={setRecoveryNote} placeholder={t('operator.recoveryNotePlaceholder')} multiline />
      <View style={{ gap: spacing.sm }}>
        <AppButton size="sm" label={t('operator.offerAlternative')} variant="secondary" onPress={() => recovery.mutate({ reservationId: r.id, resolution: 'alternative', note: recoveryNote.trim() || undefined })} loading={recovery.isPending} />
        <AppButton size="sm" label={t('operator.requestRefund')} variant="secondary" onPress={() => recovery.mutate({ reservationId: r.id, resolution: 'refund_requested', note: recoveryNote.trim() || undefined })} loading={recovery.isPending} />
      </View>
    </>}
    {checkIn.isSuccess ? <InlineNotice tone="success" title={locale === 'ar' ? 'تم تسجيل الدخول' : 'Checked in'} /> : null}
    {checkIn.isError ? <ErrorState compact error={checkIn.error} /> : null}
    {recovery.isSuccess ? <InlineNotice tone="success" title={locale === 'ar' ? 'تم حفظ معالجة الحجز' : 'Recovery saved'} /> : null}
    {recovery.isError ? <ErrorState compact error={recovery.error} /> : null}
  </Card>;
}

export default function OperatorZone() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, locale, textAlign } = useLocale();
  const summary = useOperatorSummary();
  const zone = (summary.data?.assignedZones ?? summary.data?.zones ?? []).find((z) => z.id === id);
  const reservations = useOperatorReservations(id);
  const availability = useOperatorAvailability();
  const [selectedAvailability, setSelectedAvailability] = useState<OperatorAvailability>('available');
  const [availableSpaces, setAvailableSpaces] = useState('');
  const [occupiedSpaces, setOccupiedSpaces] = useState('');
  const [reason, setReason] = useState('');
  const zoneName = zone ? (locale === 'ar' ? zone.nameAr : zone.name) : t('operator.zone');
  const zoneCity = zone ? (locale === 'ar' ? zone.cityAr : zone.city) : '';
  const submitAvailability = () => {
    if (!zone) return;
    availability.mutate({
      zoneId: zone.id,
      availability: selectedAvailability,
      availableSpaces: availableSpaces.trim() ? Number(availableSpaces) : undefined,
      occupiedSpaces: occupiedSpaces.trim() ? Number(occupiedSpaces) : undefined,
      confidence: 1,
      reason: reason.trim() || undefined,
    });
  };

  if (summary.isPending) return <Screen><SkeletonGroup count={3} /></Screen>;
  if (summary.isError) return <Screen><AppHeader title={zoneName} /><ErrorState error={summary.error} onRetry={() => { void summary.refetch(); }} /></Screen>;
  if (!zone) return <Screen><AppHeader title={zoneName} /><EmptyState title={t('operator.noZones')} body={t('operator.noZonesBody')} /></Screen>;

  return <Screen><AppHeader title={zoneName} /><View style={{ gap: spacing.md }}>
    {zoneCity ? <AppText color="textSecondary" style={{ textAlign }}>{zoneCity}</AppText> : null}
    <Card>
      <AppText variant="title">{zone.capacity == null ? t('operator.capacityUnavailable') : t('operator.capacitySpaces', { capacity: zone.capacity })}</AppText>
      <AppText>{zone.feedHealth.stale ? t('operator.feedStale') : t('operator.feedHealthy')}</AppText>
      {zone.feedHealth.conflict ? <InlineNotice tone="warning" title={t('operator.conflictDetected')} body={t('operator.conflictBody')} /> : null}
    </Card>
    <Card>
      <AppText variant="title">{t('operator.updateAvailability')}</AppText>
      <AppText color="textSecondary">{t('operator.updateAvailabilityBody')}</AppText>
      <View style={{ gap: spacing.sm }}>
        {availabilityOptions.map((option) => <AppButton key={option} size="sm" fullWidth={false} variant={selectedAvailability === option ? 'primary' : 'secondary'} label={t(availabilityLabels[option])} onPress={() => setSelectedAvailability(option)} />)}
      </View>
      <TextField label={t('operator.availableSpaces')} value={availableSpaces} onChangeText={setAvailableSpaces} keyboardType="number-pad" placeholder="0" />
      <TextField label={t('operator.occupiedSpaces')} value={occupiedSpaces} onChangeText={setOccupiedSpaces} keyboardType="number-pad" placeholder="0" />
      <TextField label={t('operator.updateReason')} value={reason} onChangeText={setReason} placeholder={t('operator.updateReasonPlaceholder')} multiline />
      <AppButton label={t('operator.submitAvailability')} onPress={submitAvailability} loading={availability.isPending} />
      {availability.isSuccess ? <InlineNotice tone="success" title={t('operator.updateSuccess')} body={t('operator.updateSuccessBody')} /> : null}
      {availability.isError ? <ErrorState compact error={availability.error} /> : null}
    </Card>
    <AppText variant="title">{t('operator.reservations')}</AppText>
    {reservations.isPending ? <SkeletonGroup count={2} /> : reservations.isError ? <ErrorState error={reservations.error} onRetry={() => { void reservations.refetch(); }} /> : (reservations.data ?? []).length === 0 ? <EmptyState title={locale === 'ar' ? 'لا توجد حجوزات' : 'No reservations'} body={locale === 'ar' ? 'ستظهر حجوزات هذا الموقف هنا.' : 'Reservations for this location will appear here.'} /> : (reservations.data ?? []).map((r) => <ReservationCard key={r.id} reservation={r} />)}
  </View></Screen>;
}
