import { RefreshControl, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { CreditCard, Plus, Wallet as WalletIcon, ChevronRight, ChevronLeft } from 'lucide-react-native';

import {
  AppButton,
  AppText,
  Card,
  Divider,
  ErrorState,
  InlineNotice,
  MoneyText,
  PressableScale,
  Screen,
  SectionHeader,
  Skeleton,
  SkeletonGroup,
  StatusBadge,
  SwitchRow,
  TabHeader,
} from '@parkflow/client/components/ui';
import { DemoPaymentNotice } from '../../src/components/domain/DemoPaymentNotice';
import { TransactionRow } from '../../src/components/domain/TransactionRow';
import { useTheme } from '@parkflow/client/theme/ThemeProvider';
import { spacing } from '@parkflow/design/spacing';
import { radius } from '@parkflow/design/radius';
import { shadow } from '@parkflow/design/shadows';
import { useLocale } from '@parkflow/client/hooks/useLocale';
import { usePaymentMethods, useSetAutoTopUp, useTransactions, useWallet } from '@parkflow/client/hooks/useWallet';
import { formatMoney } from '@parkflow/client/utils/money';

const TAB_BAR_CLEARANCE = 96;
const QUICK_AMOUNTS = [2000, 5000, 10000];

export default function WalletScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { t, row, isRTL, alignStart } = useLocale();
  const insets = useSafeAreaInsets();

  const { data: wallet, isPending, isError, error, refetch, isRefetching } = useWallet();
  const { data: methods = [] } = usePaymentMethods();
  const { data: transactions = [] } = useTransactions(undefined, 4);
  const setAutoTopUp = useSetAutoTopUp();

  const Chevron = isRTL ? ChevronLeft : ChevronRight;
  const defaultMethod = methods.find((method) => method.isDefault);
  const isLow = wallet ? wallet.balance < wallet.autoTopUpThreshold : false;

  if (isError) {
    return (
      <Screen layout="fixed">
        <ErrorState error={error} onRetry={() => void refetch()} />
      </Screen>
    );
  }

  return (
    <Screen layout="fixed" safeBottom={false}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} tintColor={colors.brand} />
        }
        contentContainerStyle={{
          gap: spacing.xl,
          paddingBottom: TAB_BAR_CLEARANCE + insets.bottom,
        }}
      >
        <TabHeader title={t('wallet.title')} />
        <DemoPaymentNotice />

        {/* ---- Balance card -------------------------------------------- */}
        <View style={[{ borderRadius: radius.xxl, overflow: 'hidden' }, shadow.sm]}>
          <LinearGradient
            colors={[colors.deep, colors.deepAlt]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{ padding: spacing.xxl, gap: spacing.xl }}
          >
            <View style={{ flexDirection: row, alignItems: 'center', gap: spacing.md }}>
              <View
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: radius.md,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: 'rgba(255,255,255,0.12)',
                }}
              >
                <WalletIcon size={19} color={colors.accent} strokeWidth={2.2} />
              </View>
              {/* Low balance is spelled out in the notice under the card. */}
              <AppText variant="label" color="onDeepMuted" style={{ flex: 1 }}>
                {t('wallet.balance')}
              </AppText>
            </View>

            {isPending || !wallet ? (
              <Skeleton width={180} height={44} radiusToken="md" />
            ) : (
              <MoneyText value={wallet.balance} variant="display" color="onDeep" />
            )}

            <View style={{ flexDirection: row, gap: spacing.sm }}>
              {QUICK_AMOUNTS.map((amount) => (
                <PressableScale
                  key={amount}
                  onPress={() =>
                    router.push({ pathname: '/wallet/topup', params: { amount: String(amount) } })
                  }
                  haptic="light"
                  scaleTo={0.95}
                  accessibilityRole="button"
                  accessibilityLabel={`${t('wallet.topUp')} ${formatMoney(amount)}`}
                  style={{
                    flex: 1,
                    alignItems: 'center',
                    justifyContent: 'center',
                    height: 48,
                    borderRadius: radius.md,
                    backgroundColor: 'rgba(255,255,255,0.12)',
                  }}
                >
                  <AppText variant="title" color="onDeep" numeric>
                    +{formatMoney(amount, { hideSymbol: true, decimals: 0 })}
                  </AppText>
                </PressableScale>
              ))}
              <AppButton
                label={t('wallet.other')}
                variant="inverse"
                size="md"
                fullWidth={false}
                onPress={() => router.push('/wallet/topup')}
                style={{ height: 48, paddingHorizontal: spacing.lg }}
              />
            </View>
          </LinearGradient>
        </View>

        {isLow ? (
          <InlineNotice
            tone="warning"
            title={t('parking.lowBalance')}
            body={t('parking.lowBalanceBody', {
              balance: formatMoney(wallet?.balance ?? 0),
            })}
            action={{ label: t('parking.topUpNow'), onPress: () => router.push('/wallet/topup') }}
          />
        ) : null}

        {/* ---- Auto top-up --------------------------------------------- */}
        {wallet ? (
          <Card padding="lg">
            <SwitchRow
              label={t('wallet.autoTopUp')}
              description={t('wallet.autoTopUpBody', {
                amount: formatMoney(wallet.autoTopUpAmount),
                threshold: formatMoney(wallet.autoTopUpThreshold),
              })}
              value={wallet.autoTopUpEnabled}
              disabled={setAutoTopUp.isPending || methods.length === 0}
              onValueChange={(enabled) => setAutoTopUp.mutate({ enabled })}
            />
            {methods.length === 0 ? (
              <AppText variant="caption" color="textTertiary" style={{ marginTop: spacing.sm }}>
                {t('wallet.noMethodsBody')}
              </AppText>
            ) : null}
          </Card>
        ) : null}

        {/* ---- Payment methods ----------------------------------------- */}
        <View>
          <SectionHeader
            title={t('wallet.paymentMethods')}
            action={{ label: t('common.seeAll'), onPress: () => router.push('/wallet/methods') }}
          />
          <Card padding="lg" style={{ gap: spacing.xs }}>
            {defaultMethod ? (
              <PressableScale
                onPress={() => router.push('/wallet/methods')}
                haptic="select"
                scaleTo={0.99}
                accessibilityRole="button"
                accessibilityLabel={`${defaultMethod.brand} ending ${defaultMethod.last4}`}
                style={{ flexDirection: row, alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm }}
              >
                <View
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: radius.md,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: colors.surfaceAlt,
                  }}
                >
                  <CreditCard size={20} color={colors.textSecondary} strokeWidth={2.1} />
                </View>
                <View style={{ flex: 1, gap: 3 }}>
                  <AppText variant="titleLg" forceLtrAlign>
                    {defaultMethod.brand.toUpperCase()} •••• {defaultMethod.last4}
                  </AppText>
                  <AppText variant="bodySm" color="textSecondary" numeric forceLtrAlign>
                    {String(defaultMethod.expiryMonth).padStart(2, '0')}/{defaultMethod.expiryYear}
                  </AppText>
                </View>
                <StatusBadge label={t('common.default')} tone="brand" size="sm" showDot={false} />
                <Chevron size={18} color={colors.textTertiary} strokeWidth={2.2} />
              </PressableScale>
            ) : (
              <AppText variant="body" color="textSecondary">
                {t('wallet.noMethods')}
              </AppText>
            )}

            <Divider style={{ marginVertical: spacing.sm }} />

            <AppButton
              label={t('wallet.addCard')}
              variant="ghost"
              size="sm"
              onPress={() => router.push('/wallet/add-card')}
              icon={<Plus size={16} color={colors.brand} strokeWidth={2.4} />}
              style={{ alignSelf: alignStart }}
              fullWidth={false}
            />
          </Card>
        </View>

        {/* ---- Recent activity ----------------------------------------- */}
        <View>
          <SectionHeader
            title={t('wallet.recent')}
            action={{ label: t('common.seeAll'), onPress: () => router.push('/(tabs)/activity') }}
          />
          {isPending ? (
            <SkeletonGroup count={3} height={60} />
          ) : (
            <Card padding="lg">
              {transactions.map((transaction, index) => (
                <View key={transaction.id}>
                  {index > 0 ? <Divider /> : null}
                  <TransactionRow
                    transaction={transaction}
                    onPress={() => router.push(`/activity/${transaction.id}`)}
                  />
                </View>
              ))}
              {transactions.length === 0 ? (
                <AppText variant="body" color="textSecondary">
                  {t('activity.emptyBody')}
                </AppText>
              ) : null}
            </Card>
          )}
        </View>

        <AppText variant="caption" color="textTertiary" align="center" style={{ maxWidth: 340, alignSelf: 'center' }}>
          {t('wallet.securityNote')}
        </AppText>
      </ScrollView>
    </Screen>
  );
}
