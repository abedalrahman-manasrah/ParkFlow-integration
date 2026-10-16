import { useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { CreditCard, Plus } from 'lucide-react-native';

import {
  AppButton,
  AppHeader,
  AppText,
  BottomSheet,
  Card,
  DetailRow,
  Divider,
  InlineNotice,
  MoneyText,
  PressableScale,
  Screen,
  Skeleton,
  SuccessCheck,
  TextField,
} from '@/components/ui';
import { DemoPaymentNotice } from '@/components/domain/DemoPaymentNotice';

import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/spacing';
import { radius } from '@/theme/radius';
import { useLocale } from '@/hooks/useLocale';
import { usePaymentMethods, useTopUp, useWallet } from '@/hooks/useWallet';
import { useIdempotencyKey } from '@/hooks/useIdempotencyKey';
import { formatMoney, toMinor } from '@/utils/money';
import { errorMessage } from '@/utils/errors';
import { haptics } from '@/utils/haptics';

const PRESETS = [2000, 5000, 10000];
const MIN_TOPUP = 500;
const MAX_TOPUP = 100000;

export default function TopUpScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { t, row, alignStart } = useLocale();
  const params = useLocalSearchParams<{ amount?: string }>();

  const { data: wallet, isPending } = useWallet();
  const { data: methods = [] } = usePaymentMethods();
  const topUp = useTopUp();
  const idempotency = useIdempotencyKey('topup');

  const presetFromParams = params.amount ? Number(params.amount) : undefined;
  const [amount, setAmount] = useState<number>(presetFromParams ?? PRESETS[1]!);
  const [customText, setCustomText] = useState('');
  const [isCustom, setIsCustom] = useState(false);
  const [successOpen, setSuccessOpen] = useState(false);

  const defaultMethod = methods.find((method) => method.isDefault) ?? methods[0];

  const customAmount = toMinor(Number(customText.replace(/[^\d.]/g, '')) || 0);
  const effectiveAmount = isCustom ? customAmount : amount;
  const amountValid = effectiveAmount >= MIN_TOPUP && effectiveAmount <= MAX_TOPUP;

  const handleTopUp = () => {
    if (!defaultMethod || !amountValid) return;
    topUp.mutate(
      {
        amount: effectiveAmount,
        paymentMethodId: defaultMethod.id,
        idempotencyKey: idempotency.key(),
      },
      {
        onSuccess: () => {
          haptics.success();
          idempotency.reset();
          setSuccessOpen(true);
        },
        onError: () => haptics.error(),
      },
    );
  };

  return (
    <Screen keyboardAvoiding bottomInset={spacing.xl}>
      <AppHeader title={t('wallet.topUp')} leading="close" />

      <View style={{ gap: spacing.xl }}>
        <DemoPaymentNotice />
        <Card padding="lg" style={{ gap: spacing.sm }}>
          <AppText variant="label" color="textSecondary">
            {t('wallet.balance')}
          </AppText>
          {isPending || !wallet ? (
            <Skeleton height={36} width={140} radiusToken="sm" />
          ) : (
            <MoneyText value={wallet.balance} variant="h1" />
          )}
        </Card>

        <View style={{ gap: spacing.sm }}>
          <AppText variant="overline" color="textTertiary">
            {t('wallet.topUpAmount')}
          </AppText>

          <View style={{ flexDirection: row, gap: spacing.sm }}>
            {PRESETS.map((preset) => {
              const active = !isCustom && preset === amount;
              return (
                <PressableScale
                  key={preset}
                  onPress={() => {
                    haptics.select();
                    setIsCustom(false);
                    setAmount(preset);
                  }}
                  scaleTo={0.95}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={formatMoney(preset)}
                  style={{
                    flex: 1,
                    alignItems: 'center',
                    justifyContent: 'center',
                    height: 58,
                    borderRadius: radius.lg,
                    backgroundColor: active ? colors.brandSoft : colors.surface,
                    borderWidth: active ? 2 : 1,
                    borderColor: active ? colors.brand : colors.border,
                  }}
                >
                  <AppText
                    variant="titleLg"
                    numeric
                    style={{ color: active ? colors.successText : colors.text }}
                  >
                    +{formatMoney(preset, { decimals: 0 })}
                  </AppText>
                </PressableScale>
              );
            })}
          </View>

          <PressableScale
            onPress={() => {
              haptics.select();
              setIsCustom(true);
            }}
            hitSlop={8}
            style={{ alignSelf: alignStart, paddingVertical: spacing.xs }}
          >
            <AppText variant="label" color={isCustom ? 'brand' : 'textSecondary'}>
              {t('wallet.other')}
            </AppText>
          </PressableScale>

          {isCustom ? (
            <TextField
              value={customText}
              onChangeText={setCustomText}
              placeholder="25.00"
              keyboardType="decimal-pad"
              emphasis="strong"
              autoFocus
              trailing={
                <AppText variant="h3" color="textTertiary">
                  ₪
                </AppText>
              }
              error={
                customText && !amountValid
                  ? `${formatMoney(MIN_TOPUP)} – ${formatMoney(MAX_TOPUP)}`
                  : undefined
              }
            />
          ) : null}
        </View>

        {/* ---- Payment method ------------------------------------------ */}
        <View style={{ gap: spacing.sm }}>
          <AppText variant="overline" color="textTertiary">
            {t('wallet.paymentMethods')}
          </AppText>

          {defaultMethod ? (
            <Card
              padding="lg"
              onPress={() => router.push('/wallet/methods')}
              style={{ flexDirection: row, alignItems: 'center', gap: spacing.md }}
              accessibilityLabel={`${defaultMethod.brand} ending ${defaultMethod.last4}`}
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
              <AppText variant="label" color="brand">
                {t('common.edit')}
              </AppText>
            </Card>
          ) : (
            <Card padding="lg" style={{ gap: spacing.md }}>
              <AppText variant="titleLg">{t('wallet.noMethods')}</AppText>
              <AppText variant="bodySm" color="textSecondary">
                {t('wallet.noMethodsBody')}
              </AppText>
              <AppButton
                label={t('wallet.addCard')}
                variant="secondary"
                size="md"
                onPress={() => router.push('/wallet/add-card')}
                icon={<Plus size={16} color={colors.text} strokeWidth={2.4} />}
              />
            </Card>
          )}
        </View>

        {topUp.isError ? (
          <InlineNotice
            tone="danger"
            title={t('wallet.topUpFailed')}
            body={errorMessage(topUp.error)}
          />
        ) : null}

        <Card tone="sunken" padding="lg">
          <DetailRow label={t('parking.total')} emphasis>
            <MoneyText value={effectiveAmount} variant="h3" color="brand" />
          </DetailRow>
        </Card>

        <AppText variant="caption" color="textTertiary" align="center">
          {t('wallet.securityNote')}
        </AppText>

        <AppButton
          label={t('wallet.topUp')}
          onPress={handleTopUp}
          loading={topUp.isPending}
          disabled={!defaultMethod || !amountValid}
          testID="topup-cta"
        />
      </View>

      <BottomSheet
        visible={successOpen}
        onClose={() => {
          setSuccessOpen(false);
          router.back();
        }}
        dismissible={false}
      >
        <View style={{ alignItems: 'center', gap: spacing.lg, paddingBottom: spacing.md }}>
          <SuccessCheck size={84} />
          <View style={{ gap: spacing.xs, alignItems: 'center' }}>
            <AppText variant="h2" align="center">
              {t('wallet.topUpSuccess')}
            </AppText>
            <AppText variant="body" color="textSecondary" align="center">
              {t('wallet.topUpSuccessBody', { amount: formatMoney(effectiveAmount) })}
            </AppText>
          </View>

          <Divider style={{ alignSelf: 'stretch' }} />

          <View style={{ alignSelf: 'stretch' }}>
            <DetailRow label={t('wallet.balance')} emphasis>
              <MoneyText value={topUp.data?.wallet.balance ?? 0} variant="h3" color="brand" />
            </DetailRow>
          </View>

          <AppButton
            label={t('common.done')}
            style={{ alignSelf: 'stretch' }}
            onPress={() => {
              setSuccessOpen(false);
              router.back();
            }}
          />
        </View>
      </BottomSheet>
    </Screen>
  );
}
