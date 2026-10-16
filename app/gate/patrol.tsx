import { useState } from 'react';
import { View } from 'react-native';
import { ShieldCheck, ShieldX } from 'lucide-react-native';

import { AppButton, AppHeader, AppText, Card, DetailRow, InlineNotice, Screen, TextField } from '@/components/ui';
import { GateZonePicker } from '@/components/domain/GateZonePicker';
import { useGateZones, usePatrolCheck, usePatrolIssue } from '@/hooks/useGates';
import { useLocale } from '@/hooks/useLocale';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/spacing';
import { formatMoney } from '@/utils/money';
import { formatTime } from '@/utils/time';
import { errorMessage } from '@/utils/errors';
import { haptics } from '@/utils/haptics';

/** For an officer standing next to a car: is it allowed to be here right now? */
export default function PatrolScreen() {
  const { t, dateLocale } = useLocale();
  const { colors } = useTheme();
  const zones = useGateZones();
  const [zoneId, setZoneId] = useState<string>();
  const zone = zones.data?.find((z) => z.id === zoneId);
  const [plate, setPlate] = useState('');
  const check = usePatrolCheck();
  const issue = usePatrolIssue();
  const result = check.data;

  const runCheck = () => {
    if (!zone) return;
    issue.reset();
    check.mutate({ zoneId: zone.id, plate });
  };

  return (
    <Screen keyboardAvoiding bottomInset={spacing.giant}>
      <AppHeader title={t('patrol.title')} subtitle={t('patrol.subtitle')} />
      <View style={{ gap: spacing.lg }}>
        <GateZonePicker zones={zones.data ?? []} loading={zones.isPending} value={zone} onChange={(z) => { setZoneId(z?.id); check.reset(); }} />
        {zone ? (
          <Card padding="lg" style={{ gap: spacing.md }}>
            <TextField label={t('gate.plate')} value={plate} onChangeText={setPlate} keyboardType="number-pad" maxLength={12} onSubmitEditing={runCheck} />
            <AppButton label={t('patrol.check')} loading={check.isPending} disabled={plate.replace(/\D/g, '').length < 4} onPress={runCheck} />
            {check.isError ? <AppText variant="caption" color="danger">{errorMessage(check.error)}</AppText> : null}
          </Card>
        ) : null}
        {zone && result ? (
          <Card padding="xl" tone={result.allowed ? 'raised' : 'outline'} style={{ gap: spacing.md, alignItems: 'center' }}>
            {result.allowed ? <ShieldCheck size={44} color={colors.success} /> : <ShieldX size={44} color={colors.danger} />}
            <AppText variant="h2" align="center">{result.allowed ? t('patrol.allowed') : t('patrol.notAllowed')}</AppText>
            <AppText variant="body" color="textSecondary" align="center">{t(`patrol.reason.${result.reason}`)}</AppText>
            <View style={{ alignSelf: 'stretch', gap: spacing.sm }}>
              <DetailRow label={t('gate.plate')} value={result.plateNumber} />
              {result.insideSince ? <DetailRow label={t('gate.entered')} value={formatTime(result.insideSince, dateLocale)} /> : null}
              {result.paidUntil ? <DetailRow label={t('gate.paidUntil')} value={formatTime(result.paidUntil, dateLocale)} /> : null}
              <DetailRow label={t('patrol.recent')} value={String(result.recentViolations)} />
            </View>
            {!result.registered ? <InlineNotice tone="info" title={t('patrol.unregistered')} /> : null}
            {issue.isSuccess ? <InlineNotice tone="success" title={t('patrol.issued', { amount: formatMoney(issue.data.amount) })} />
              : result.reason === 'grace' && result.graceEndsAt ? <InlineNotice tone="info" title={t('patrol.graceUntil', { time: formatTime(result.graceEndsAt, dateLocale) })} />
              : result.gateTracked && !result.allowed ? <InlineNotice tone="info" title={t('patrol.gateTracked')} />
              : !result.allowed && result.registered ? (
                <>
                  {issue.isError ? <AppText variant="caption" color="danger">{errorMessage(issue.error)}</AppText> : null}
                  <AppButton label={t('patrol.issue', { amount: formatMoney(result.fee) })} variant="danger" loading={issue.isPending}
                    onPress={() => issue.mutate({ zoneId: zone.id, plate: result.plateNumber }, { onSuccess: () => haptics.success(), onError: () => haptics.error() })} />
                </>
              ) : null}
          </Card>
        ) : null}
      </View>
    </Screen>
  );
}
