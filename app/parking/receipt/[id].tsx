import { useState } from 'react';
import { Platform, Share, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Share2 } from 'lucide-react-native';

import {
  AppButton,
  AppText,
  Card,
  DetailRow,
  Divider,
  ErrorState,
  InlineNotice,
  MoneyText,
  Reveal,
  Screen,
  Skeleton,
  StatusBadge,
  SuccessCheck,
} from '@/components/ui';
import { PlateBadge } from '@/components/domain/PlateBadge';
import { TicketDivider } from '@/components/domain/TicketDivider';

import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/spacing';
import { useLocale } from '@/hooks/useLocale';
import { useSessionById, useSessionBreakdown, useSettleSession } from '@/hooks/useParking';
import { useVehicle } from '@/hooks/useVehicles';
import { useTransaction } from '@/hooks/useWallet';
import { formatDuration, formatDate, formatTime } from '@/utils/time';
import { formatMoney, formatRate } from '@/utils/money';
import { errorMessage } from '@/utils/errors';

/** Browsers without a share sheet get the receipt copied to the clipboard instead. */
type WebNavigator = { clipboard?: { writeText(text: string): Promise<void> } };

export default function ReceiptScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { t, alignEnd, dateLocale, locale } = useLocale();
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data: session, isPending, isError, error, refetch } = useSessionById(id);
  const { data: vehicle } = useVehicle(session?.vehicleId);
  const { data: transaction } = useTransaction(session?.paymentTransactionId);
  const breakdown = useSessionBreakdown(session, { live: false });
  const settle = useSettleSession();
  const [copied, setCopied] = useState(false);

  if (isError) {
    return (
      <Screen>
        <ErrorState error={error} onRetry={() => void refetch()} />
      </Screen>
    );
  }

  if (isPending || !session || !breakdown) {
    return (
      <Screen>
        <View style={{ gap: spacing.xl, paddingTop: spacing.giant }}>
          <Skeleton height={96} width={96} radiusToken="pill" style={{ alignSelf: 'center' }} />
          <Skeleton height={32} width="60%" radiusToken="md" style={{ alignSelf: 'center' }} />
          <Skeleton height={280} radiusToken="xl" />
        </View>
      </Screen>
    );
  }

  const paymentFailed = session.paymentStatus === 'failed';
  const total = session.finalCost ?? session.currentCost;

  const shareReceipt = async () => {
    const zoneName =
      locale === 'ar'
        ? session.pricingRulesSnapshot.zoneNameAr
        : session.pricingRulesSnapshot.zoneName;
    const message = [
      t('parking.receiptShareTitle'),
      `${zoneName} (${session.pricingRulesSnapshot.zoneCode})`,
      vehicle ? `${vehicle.displayName} · ${vehicle.plateNumber}` : undefined,
      `${formatDate(session.startedAt, dateLocale)} · ${formatTime(session.startedAt, dateLocale)} – ${
        session.stoppedAt ? formatTime(session.stoppedAt, dateLocale) : '—'
      }`,
      `${t('parking.duration')}: ${formatDuration(breakdown.elapsedSeconds)}`,
      `${t('parking.totalPaid')}: ${formatMoney(total)}`,
      transaction ? `${t('parking.transactionId')}: ${transaction.reference}` : undefined,
    ]
      .filter(Boolean)
      .join('\n');

    try {
      await Share.share({ message, title: t('parking.receiptShareTitle') });
    } catch {
      if (Platform.OS !== 'web') return;
      const clipboard = (globalThis.navigator as unknown as WebNavigator | undefined)?.clipboard;
      await clipboard?.writeText(message).then(() => setCopied(true), () => undefined);
    }
  };

  return (
    <Screen bottomInset={spacing.xl}>
      <Reveal delay={60}
        style={{ alignItems: 'center', gap: spacing.lg, paddingTop: spacing.xxxl }}
      >
        {paymentFailed ? (
          <StatusBadge label={t('parking.paymentFailed')} tone="danger" />
        ) : (
          <SuccessCheck size={88} />
        )}

        <View style={{ gap: spacing.xs, alignItems: 'center' }}>
          <AppText variant="h1" align="center">
            {t('parking.completed')}
          </AppText>
          <AppText variant="body" color="textSecondary" align="center">
            {locale === 'ar'
              ? session.pricingRulesSnapshot.zoneNameAr
              : session.pricingRulesSnapshot.zoneName}
          </AppText>
        </View>

        <MoneyText value={total} variant="display" color={paymentFailed ? 'danger' : 'text'} />
      </Reveal>

      {paymentFailed ? (
        <Reveal delay={140} style={{ marginTop: spacing.xl }}>
          <InlineNotice
            tone="danger"
            title={t('parking.paymentFailed')}
            body={t('parking.paymentFailedBody')}
            action={{
              label: settle.isPending ? t('common.loading') : t('parking.settleNow'),
              onPress: () => settle.mutate(session.id),
            }}
          />
          {settle.isError ? (
            <AppText variant="caption" color="danger" style={{ marginTop: spacing.sm }}>
              {errorMessage(settle.error)}
            </AppText>
          ) : null}
        </Reveal>
      ) : null}

      <Reveal delay={200} style={{ marginTop: spacing.xxl }}>
        <Card padding="xl" style={{ gap: spacing.md }}>
          <DetailRow label={t('parking.vehicle')}>
            <View style={{ alignItems: alignEnd, gap: 6 }}>
              <AppText variant="title">{vehicle?.displayName ?? '—'}</AppText>
              {vehicle ? <PlateBadge plateNumber={vehicle.plateNumber} size="sm" /> : null}
            </View>
          </DetailRow>

          <TicketDivider />

          <DetailRow
            label={t('parking.location')}
            value={
              locale === 'ar'
                ? session.pricingRulesSnapshot.zoneNameAr
                : session.pricingRulesSnapshot.zoneName
            }
          />
          <DetailRow label={t('violation.zone')} value={session.pricingRulesSnapshot.zoneCode} />
          <DetailRow
            label={t('parking.startTime')}
            value={formatTime(session.startedAt, dateLocale)}
          />
          <DetailRow
            label={t('parking.endTime')}
            value={
              session.stoppedAt ? formatTime(session.stoppedAt, dateLocale) : '—'
            }
          />
          <DetailRow
            label={t('parking.duration')}
            value={formatDuration(breakdown.elapsedSeconds)}
          />
          <DetailRow
            label={t('zone.rate')}
            value={`${formatRate(session.rateSnapshot.hourlyRate)} ${t('common.perHour')}`}
          />

          <Divider />

          <DetailRow label={t('parking.totalPaid')} emphasis>
            <MoneyText value={total} variant="h3" color={paymentFailed ? 'danger' : 'brand'} />
          </DetailRow>
          <DetailRow
            label={t('parking.paymentMethod')}
            value={paymentFailed ? t('parking.paymentFailed') : t('wallet.title')}
          />
          {transaction ? (
            <DetailRow label={t('parking.transactionId')} value={transaction.reference} />
          ) : null}
          <DetailRow label={t('activity.date')} value={formatDate(session.startedAt, dateLocale)} />
        </Card>
      </Reveal>

      <View style={{ flex: 1, minHeight: spacing.xl }} />

      <Reveal delay={280} style={{ gap: spacing.md }}>
        <AppButton
          label={t('parking.viewInActivity')}
          variant="secondary"
          onPress={() => router.replace('/(tabs)/activity')}
        />
        <AppButton
          label={t('common.done')}
          onPress={() => router.replace('/(tabs)/map')}
          testID="receipt-done"
        />
        <AppButton
          label={copied ? t('parking.receiptCopied') : t('parking.shareReceipt')}
          variant="ghost"
          size="sm"
          onPress={() => void shareReceipt()}
          icon={<Share2 size={16} color={colors.brand} strokeWidth={2.2} />}
          testID="receipt-share"
        />
      </Reveal>
    </Screen>
  );
}
