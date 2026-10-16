import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  ArrowDownLeft,
  CircleParking,
  Gift,
  CarFront,
  House,
  HandCoins,
  RotateCcw,
  ScrollText,
  SlidersHorizontal,
} from 'lucide-react-native';

import {
  AppButton,
  AppHeader,
  AppText,
  Card,
  DetailRow,
  Divider,
  ErrorState,
  MoneyText,
  Screen,
  Skeleton,
  StatusBadge,
} from '@/components/ui';

import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/spacing';
import { radius } from '@/theme/radius';
import { useLocale } from '@/hooks/useLocale';
import { useTransaction } from '@/hooks/useWallet';
import type { TransactionType } from '@/types';
import { formatDateTime } from '@/utils/time';

const ICONS: Record<TransactionType, typeof CircleParking> = {
  parking_payment: CircleParking,
  topup: ArrowDownLeft,
  violation_payment: ScrollText,
  refund: RotateCcw,
  adjustment: SlidersHorizontal,
  reward: Gift,
  ride_payment: CarFront,
  spot_payment: House,
  earning: HandCoins,
};

export default function TransactionDetailScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { t, dateLocale, locale } = useLocale();
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data: transaction, isPending, isError, error, refetch } = useTransaction(id);

  if (isError) {
    return (
      <Screen>
        <AppHeader title={t('activity.details')} />
        <ErrorState error={error} onRetry={() => void refetch()} />
      </Screen>
    );
  }

  if (isPending || !transaction) {
    return (
      <Screen>
        <AppHeader title={t('activity.details')} />
        <View style={{ gap: spacing.lg }}>
          <Skeleton height={140} radiusToken="xl" />
          <Skeleton height={220} radiusToken="xl" />
        </View>
      </Screen>
    );
  }

  const Icon = ICONS[transaction.type];
  const isCredit = transaction.amount > 0;
  const failed = transaction.status === 'failed';

  const statusTone =
    transaction.status === 'completed'
      ? 'success'
      : transaction.status === 'pending'
        ? 'warning'
        : transaction.status === 'failed'
          ? 'danger'
          : 'neutral';

  return (
    <Screen>
      <AppHeader title={t('activity.details')} />

      <View style={{ gap: spacing.xl }}>
        <Card padding="xl" style={{ alignItems: 'center', gap: spacing.md }}>
          <View
            style={{
              width: 68,
              height: 68,
              borderRadius: radius.xxl,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: failed
                ? colors.dangerSoft
                : isCredit
                  ? colors.brandSoft
                  : colors.surfaceAlt,
            }}
          >
            <Icon
              size={30}
              color={failed ? colors.danger : isCredit ? colors.brand : colors.textSecondary}
              strokeWidth={2}
            />
          </View>

          <AppText variant="h3" align="center">
            {locale === 'ar' ? transaction.titleAr : transaction.title}
          </AppText>

          <MoneyText
            value={transaction.amount}
            signed
            variant="display"
            color={failed ? 'textTertiary' : isCredit ? 'successText' : 'text'}
          />

          <StatusBadge
            label={t(`activity.status.${transaction.status}` as const)}
            tone={statusTone}
          />
        </Card>

        <Card padding="lg" style={{ gap: spacing.md }}>
          {transaction.subtitle ? (
            <DetailRow
              label={t('parking.location')}
              value={locale === 'ar' ? transaction.subtitleAr : transaction.subtitle}
            />
          ) : null}
          <DetailRow
            label={t('activity.date')}
            value={formatDateTime(transaction.createdAt, dateLocale)}
          />
          <DetailRow label={t('activity.reference')} value={transaction.reference} />
          <DetailRow
            label={t('parking.paymentMethod')}
            value={transaction.type === 'topup' ? t('wallet.paymentMethods') : t('wallet.title')}
          />

          <Divider />

          <DetailRow label={t('wallet.balance')} emphasis>
            <MoneyText value={transaction.balanceAfter} variant="h3" />
          </DetailRow>

          {failed && transaction.failureReason ? (
            <>
              <Divider />
              <DetailRow label={t('activity.status')}>
                <AppText variant="title" color="danger" style={{ maxWidth: '60%' }} numberOfLines={3}>
                  {transaction.failureReason}
                </AppText>
              </DetailRow>
            </>
          ) : null}
        </Card>

        {transaction.parkingSessionId ? (
          <AppButton
            label={t('parking.receipt')}
            variant="secondary"
            onPress={() => router.push(`/parking/receipt/${transaction.parkingSessionId}`)}
          />
        ) : null}

        {transaction.violationId ? (
          <AppButton
            label={t('violation.details')}
            variant="secondary"
            onPress={() => router.push(`/violations/${transaction.violationId}`)}
          />
        ) : null}
      </View>
    </Screen>
  );
}
