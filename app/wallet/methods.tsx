import { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { CreditCard, Plus, Trash2, Check } from 'lucide-react-native';

import {
  AppButton,
  AppHeader,
  AppText,
  BottomSheet,
  Card,
  Divider,
  EmptyState,
  ErrorState,
  InlineNotice,
  PressableScale,
  Screen,
  SkeletonGroup,
  StatusBadge,
} from '@/components/ui';

import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/spacing';
import { radius } from '@/theme/radius';
import { useLocale } from '@/hooks/useLocale';
import {
  usePaymentMethods,
  useRemovePaymentMethod,
  useSetDefaultPaymentMethod,
} from '@/hooks/useWallet';
import type { PaymentMethod } from '@/types';
import { errorMessage } from '@/utils/errors';
import { haptics } from '@/utils/haptics';

export default function PaymentMethodsScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { t, row } = useLocale();

  const { data: methods = [], isPending, isError, error, refetch } = usePaymentMethods();
  const setDefault = useSetDefaultPaymentMethod();
  const remove = useRemovePaymentMethod();

  const [pendingRemoval, setPendingRemoval] = useState<PaymentMethod | undefined>();

  if (isError) {
    return (
      <Screen>
        <AppHeader title={t('wallet.paymentMethods')} />
        <ErrorState error={error} onRetry={() => void refetch()} />
      </Screen>
    );
  }

  return (
    <Screen>
      <AppHeader title={t('wallet.paymentMethods')} />

      <View style={{ gap: spacing.lg }}>
        {isPending ? (
          <SkeletonGroup count={2} height={82} />
        ) : methods.length === 0 ? (
          <EmptyState
            icon={<CreditCard size={26} color={colors.brand} strokeWidth={2} />}
            title={t('wallet.noMethods')}
            body={t('wallet.noMethodsBody')}
            action={{ label: t('wallet.addCard'), onPress: () => router.push('/wallet/add-card') }}
          />
        ) : (
          <Card padding="lg" style={{ paddingVertical: spacing.xs }}>
            {methods.map((method, index) => (
              <View key={method.id}>
                {index > 0 ? <Divider /> : null}
                <View
                  style={{
                    flexDirection: row,
                    alignItems: 'center',
                    gap: spacing.md,
                    paddingVertical: spacing.md,
                  }}
                >
                  <View
                    style={{
                      width: 46,
                      height: 46,
                      borderRadius: radius.md,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: colors.surfaceAlt,
                    }}
                  >
                    <CreditCard size={21} color={colors.textSecondary} strokeWidth={2.1} />
                  </View>

                  <View style={{ flex: 1, gap: 5 }}>
                    <AppText variant="titleLg" forceLtrAlign>
                      {method.brand.toUpperCase()} •••• {method.last4}
                    </AppText>
                    <View style={{ flexDirection: row, alignItems: 'center', gap: spacing.sm }}>
                      <AppText variant="bodySm" color="textSecondary" numeric forceLtrAlign>
                        {String(method.expiryMonth).padStart(2, '0')}/{method.expiryYear}
                      </AppText>
                      {method.isDefault ? (
                        <StatusBadge
                          label={t('common.default')}
                          tone="brand"
                          size="sm"
                          showDot={false}
                        />
                      ) : null}
                    </View>
                  </View>

                  {!method.isDefault ? (
                    <PressableScale
                      onPress={() => {
                        haptics.select();
                        setDefault.mutate(method.id);
                      }}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel={t('wallet.setDefault')}
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 16,
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderWidth: 2,
                        borderColor: colors.border,
                      }}
                    >
                      <Check size={15} color={colors.textTertiary} strokeWidth={3} />
                    </PressableScale>
                  ) : null}

                  <PressableScale
                    onPress={() => {
                      haptics.warning();
                      setPendingRemoval(method);
                    }}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={`${t('common.remove')} ${method.last4}`}
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 16,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: colors.dangerSoft,
                    }}
                  >
                    <Trash2 size={15} color={colors.danger} strokeWidth={2.2} />
                  </PressableScale>
                </View>
              </View>
            ))}
          </Card>
        )}

        {remove.isError ? (
          <InlineNotice
            tone="danger"
            title={t('common.somethingWrong')}
            body={errorMessage(remove.error)}
          />
        ) : null}

        {/* The empty state carries its own add button. */}
        {methods.length > 0 ? (
          <AppButton
            label={t('wallet.addCard')}
            variant="secondary"
            onPress={() => router.push('/wallet/add-card')}
            icon={<Plus size={18} color={colors.text} strokeWidth={2.4} />}
          />
        ) : null}

        <AppText variant="caption" color="textTertiary" align="center">
          {t('wallet.securityNote')}
        </AppText>
      </View>

      <BottomSheet
        visible={Boolean(pendingRemoval)}
        onClose={() => setPendingRemoval(undefined)}
        title={t('common.remove')}
        subtitle={
          pendingRemoval
            ? `${pendingRemoval.brand.toUpperCase()} •••• ${pendingRemoval.last4}`
            : undefined
        }
      >
        <View style={{ gap: spacing.md }}>
          <AppButton
            label={t('common.remove')}
            variant="danger"
            loading={remove.isPending}
            onPress={() => {
              if (!pendingRemoval) return;
              remove.mutate(pendingRemoval.id, {
                onSuccess: () => {
                  haptics.success();
                  setPendingRemoval(undefined);
                },
              });
            }}
          />
          <AppButton
            label={t('common.cancel')}
            variant="ghost"
            onPress={() => setPendingRemoval(undefined)}
          />
        </View>
      </BottomSheet>
    </Screen>
  );
}
