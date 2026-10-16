import { useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Camera, Gavel, MapPin, ScrollText } from 'lucide-react-native';

import {
  AppButton,
  AppHeader,
  AppText,
  BottomSheet,
  Card,
  DetailRow,
  Divider,
  ErrorState,
  InlineNotice,
  MoneyText,
  Screen,
  Skeleton,
  StatusBadge,
  SuccessCheck,
} from '@/components/ui';
import { PlateBadge } from '@/components/domain/PlateBadge';

import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/spacing';
import { radius } from '@/theme/radius';
import { useLocale } from '@/hooks/useLocale';
import { useAppeal, usePayViolation, useViolation } from '@/hooks/useViolations';
import { useWallet } from '@/hooks/useWallet';
import { useIdempotencyKey } from '@/hooks/useIdempotencyKey';
import { formatDate, formatDateTime } from '@/utils/time';
import { formatMoney } from '@/utils/money';
import { errorMessage } from '@/utils/errors';
import { haptics } from '@/utils/haptics';

export default function ViolationDetailScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { t, row, dateLocale, locale } = useLocale();
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data: violation, isPending, isError, error, refetch } = useViolation(id);
  const { data: appeal } = useAppeal(violation?.appealId);
  const { data: wallet } = useWallet();
  const pay = usePayViolation();
  const idempotency = useIdempotencyKey('viopay');

  const [payOpen, setPayOpen] = useState(false);
  const [paidOpen, setPaidOpen] = useState(false);

  if (isError) {
    return (
      <Screen>
        <AppHeader title={t('violation.details')} />
        <ErrorState error={error} onRetry={() => void refetch()} />
      </Screen>
    );
  }

  if (isPending || !violation) {
    return (
      <Screen>
        <AppHeader title={t('violation.details')} />
        <View style={{ gap: spacing.lg }}>
          <Skeleton height={150} radiusToken="xl" />
          <Skeleton height={260} radiusToken="xl" />
        </View>
      </Screen>
    );
  }

  const isUnpaid = violation.status === 'unpaid' || violation.status === 'overdue';
  const balance = wallet?.balance ?? 0;
  const insufficient = balance < violation.amount;

  const statusTone =
    violation.status === 'paid'
      ? ('success' as const)
      : violation.status === 'appealed'
        ? ('info' as const)
        : violation.status === 'overdue'
          ? ('danger' as const)
          : ('warning' as const);

  const statusLabel =
    violation.status === 'paid'
      ? t('violation.paid')
      : violation.status === 'appealed'
        ? t('violation.appealed')
        : violation.status === 'overdue'
          ? t('violation.overdue')
          : t('violation.unpaid');

  const handlePay = () => {
    pay.mutate(
      { violationId: violation.id, idempotencyKey: idempotency.key() },
      {
        onSuccess: () => {
          haptics.success();
          idempotency.reset();
          setPayOpen(false);
          setPaidOpen(true);
        },
        onError: () => haptics.error(),
      },
    );
  };

  return (
    <Screen bottomInset={spacing.lg}>
      <AppHeader title={t('violation.details')} />

      <View style={{ gap: spacing.xl }}>
        {/* ---- Headline ------------------------------------------------ */}
        <Card padding="xl" style={{ gap: spacing.md, alignItems: 'center' }}>
          <View
            style={{
              width: 62,
              height: 62,
              borderRadius: radius.xl,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: violation.status === 'paid' ? colors.brandSoft : colors.dangerSoft,
            }}
          >
            <ScrollText
              size={28}
              color={violation.status === 'paid' ? colors.brand : colors.danger}
              strokeWidth={2}
            />
          </View>

          <AppText variant="h2" align="center">
            {t(`violation.type.${violation.type}` as const)}
          </AppText>

          <MoneyText
            value={violation.amount}
            variant="display"
            color={violation.status === 'paid' ? 'textSecondary' : 'text'}
          />

          <StatusBadge label={statusLabel} tone={statusTone} />

          <PlateBadge plateNumber={violation.plateNumber} size="md" />
        </Card>

        {violation.status === 'appealed' && appeal ? (
          <InlineNotice
            tone="info"
            title={t('appeal.submitted')}
            body={`${appeal.reference} · ${t(`appeal.status.${appeal.status}` as const)}`}
          />
        ) : null}

        {violation.status === 'paid' && violation.paidAt ? (
          <InlineNotice
            tone="success"
            title={t('violation.paid')}
            body={`${t('violation.paidOn')} ${formatDate(violation.paidAt, dateLocale)}`}
          />
        ) : null}

        {/* ---- Facts ---------------------------------------------------- */}
        <Card padding="lg" style={{ gap: spacing.md }}>
          <DetailRow label={t('violation.reference')} value={violation.reference} />
          <DetailRow
            label={t('parking.location')}
            value={locale === 'ar' ? violation.locationNameAr : violation.locationName}
          />
          {violation.zoneCode ? (
            <DetailRow label={t('violation.zone')} value={violation.zoneCode} />
          ) : null}
          <DetailRow
            label={t('evidence.dateTime')}
            value={formatDateTime(violation.issuedAt, dateLocale)}
          />
          <DetailRow label={t('violation.dueBy')} value={formatDate(violation.dueAt, dateLocale)} />
          <DetailRow
            label={t('violation.issuedBy')}
            value={
              locale === 'ar' ? violation.issuingAuthorityAr : violation.issuingAuthority
            }
          />

          <Divider />

          <View style={{ gap: 6 }}>
            <AppText variant="caption" color="textTertiary">
              {t('violation.reason')}
            </AppText>
            <AppText variant="body">
              {locale === 'ar' ? violation.reasonAr : violation.reason}
            </AppText>
          </View>
        </Card>

        {/* ---- Actions -------------------------------------------------- */}
        <View style={{ gap: spacing.md }}>
          {violation.evidenceId ? (
            <AppButton
              label={t('violation.viewEvidence')}
              variant="secondary"
              onPress={() => router.push(`/violations/evidence/${violation.id}`)}
              icon={<Camera size={18} color={colors.text} strokeWidth={2.2} />}
            />
          ) : null}

          {isUnpaid ? (
            <>
              <AppButton
                label={t('violation.payNow')}
                onPress={() => {
                  haptics.medium();
                  setPayOpen(true);
                }}
                testID="pay-violation"
              />
              <AppButton
                label={t('violation.appeal')}
                variant="ghost"
                onPress={() => router.push(`/violations/appeal/${violation.id}`)}
                icon={<Gavel size={18} color={colors.textSecondary} strokeWidth={2.2} />}
              />
            </>
          ) : null}
        </View>

        <View style={{ flexDirection: row, alignItems: 'center', gap: spacing.sm, justifyContent: 'center' }}>
          <MapPin size={14} color={colors.textTertiary} strokeWidth={2.2} />
          <AppText variant="caption" color="textTertiary" numeric>
            {violation.location.latitude.toFixed(5)}, {violation.location.longitude.toFixed(5)}
          </AppText>
        </View>
      </View>

      {/* ---- Pay confirmation ------------------------------------------- */}
      <BottomSheet
        visible={payOpen}
        onClose={() => setPayOpen(false)}
        title={t('violation.payTitle')}
        subtitle={violation.reference}
      >
        <View style={{ gap: spacing.lg }}>
          <Card tone="sunken" padding="lg" style={{ gap: spacing.md }}>
            <DetailRow label={t('violation.amount')} emphasis>
              <MoneyText value={violation.amount} variant="h3" />
            </DetailRow>
            <Divider />
            <DetailRow label={t('wallet.balance')}>
              <MoneyText value={balance} variant="title" />
            </DetailRow>
          </Card>

          {insufficient ? (
            <InlineNotice
              tone="danger"
              title={t('parking.lowBalance')}
              body={t('parking.lowBalanceBody', { balance: formatMoney(balance) })}
              action={{
                label: t('parking.topUpNow'),
                onPress: () => {
                  setPayOpen(false);
                  router.push('/wallet/topup');
                },
              }}
            />
          ) : null}

          {pay.isError ? (
            <InlineNotice
              tone="danger"
              title={t('common.somethingWrong')}
              body={errorMessage(pay.error)}
            />
          ) : null}

          <AppButton
            label={t('violation.payNow')}
            onPress={handlePay}
            loading={pay.isPending}
            disabled={insufficient}
          />
          <AppButton label={t('common.cancel')} variant="ghost" onPress={() => setPayOpen(false)} />
        </View>
      </BottomSheet>

      {/* ---- Paid success ----------------------------------------------- */}
      <BottomSheet visible={paidOpen} onClose={() => setPaidOpen(false)} dismissible={false}>
        <View style={{ alignItems: 'center', gap: spacing.lg, paddingBottom: spacing.md }}>
          <SuccessCheck size={84} />
          <AppText variant="h2" align="center">
            {t('violation.paySuccess')}
          </AppText>
          <AppText variant="body" color="textSecondary" align="center">
            {violation.reference}
          </AppText>
          <AppButton
            label={t('common.done')}
            style={{ alignSelf: 'stretch' }}
            onPress={() => setPaidOpen(false)}
          />
        </View>
      </BottomSheet>
    </Screen>
  );
}
