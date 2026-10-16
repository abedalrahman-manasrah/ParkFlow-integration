import { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { CreditCard, ShieldCheck } from 'lucide-react-native';

import {
  AppButton,
  AppHeader,
  AppText,
  Card,
  InlineNotice,
  Screen,
  SwitchRow,
  TextField,
} from '@parkflow/client/components/ui';
import { DemoPaymentNotice } from '../../src/components/domain/DemoPaymentNotice';

import { useTheme } from '@parkflow/client/theme/ThemeProvider';
import { spacing } from '@parkflow/design/spacing';
import { useLocale } from '@parkflow/client/hooks/useLocale';
import { useAddPaymentMethod } from '@parkflow/client/hooks/useWallet';
import type { PaymentMethod } from '@parkflow/contracts';
import { errorMessage } from '@parkflow/client/utils/errors';
import { haptics } from '@parkflow/client/utils/haptics';

/**
 * In production this screen is replaced by the payment provider's own SDK field,
 * so the card number never reaches our code. The mock mirrors that boundary: the
 * number typed here is used only to derive the brand and last four, and nothing
 * else is kept or transmitted.
 */
function detectBrand(digits: string): PaymentMethod['brand'] {
  if (digits.startsWith('4')) return 'visa';
  if (/^5[1-5]/.test(digits) || /^2[2-7]/.test(digits)) return 'mastercard';
  if (/^3[47]/.test(digits)) return 'amex';
  return 'visa';
}

const groupCard = (value: string) =>
  value
    .replace(/\D/g, '')
    .slice(0, 19)
    .replace(/(.{4})/g, '$1 ')
    .trim();

const groupExpiry = (value: string) => {
  const digits = value.replace(/\D/g, '').slice(0, 4);
  return digits.length <= 2 ? digits : `${digits.slice(0, 2)}/${digits.slice(2)}`;
};

export default function AddCardScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { t, row } = useLocale();
  const addMethod = useAddPaymentMethod();

  const [number, setNumber] = useState('');
  const [expiry, setExpiry] = useState('');
  const [cvc, setCvc] = useState('');
  const [holder, setHolder] = useState('');
  const [makeDefault, setMakeDefault] = useState(true);

  const digits = number.replace(/\D/g, '');
  const expiryDigits = expiry.replace(/\D/g, '');
  const month = Number(expiryDigits.slice(0, 2));
  const year = Number(`20${expiryDigits.slice(2, 4)}`);

  const numberValid = digits.length >= 14;
  const expiryValid =
    expiryDigits.length === 4 &&
    month >= 1 &&
    month <= 12 &&
    year >= new Date().getFullYear();
  const cvcValid = cvc.replace(/\D/g, '').length >= 3;
  const canSubmit = numberValid && expiryValid && cvcValid;

  const handleSubmit = () => {
    if (!canSubmit) return;
    addMethod.mutate(
      {
        // Only these ever leave the screen.
        last4: digits.slice(-4),
        brand: detectBrand(digits),
        expiryMonth: month,
        expiryYear: year,
        holderName: holder || undefined,
        makeDefault,
      },
      {
        onSuccess: () => {
          haptics.success();
          router.back();
        },
        onError: () => haptics.error(),
      },
    );
  };

  return (
    <Screen keyboardAvoiding>
      <AppHeader title={t('wallet.addCard')} leading="close" />

      <View style={{ gap: spacing.xl }}>
        <DemoPaymentNotice />
        <View
          style={{
            flexDirection: row,
            alignItems: 'flex-start',
            gap: spacing.md,
            padding: spacing.lg,
            borderRadius: 14,
            backgroundColor: colors.brandSofter,
          }}
        >
          <ShieldCheck size={20} color={colors.brand} strokeWidth={2.2} />
          <AppText variant="bodySm" color="textSecondary" style={{ flex: 1 }}>
            {t('wallet.securityNote')}
          </AppText>
        </View>

        <Card padding="lg" style={{ gap: spacing.lg }}>
          <TextField
            label={t('wallet.cardNumber')}
            value={groupCard(number)}
            onChangeText={setNumber}
            placeholder="4242 4242 4242 4242"
            keyboardType="number-pad"
            autoComplete="cc-number"
            maxLength={23}
            leading={<CreditCard size={20} color={colors.textTertiary} strokeWidth={2.2} />}
            error={number && !numberValid ? t('common.required') : undefined}
          />

          <View style={{ flexDirection: row, gap: spacing.md }}>
            <TextField
              label={t('wallet.expiry')}
              containerStyle={{ flex: 1 }}
              value={groupExpiry(expiry)}
              onChangeText={setExpiry}
              placeholder="MM/YY"
              keyboardType="number-pad"
              maxLength={5}
              error={expiry && !expiryValid ? t('common.required') : undefined}
            />
            <TextField
              label={t('wallet.cvc')}
              containerStyle={{ flex: 1 }}
              value={cvc}
              onChangeText={(value) => setCvc(value.replace(/\D/g, '').slice(0, 4))}
              placeholder="123"
              keyboardType="number-pad"
              secureTextEntry
              maxLength={4}
              error={cvc && !cvcValid ? t('common.required') : undefined}
            />
          </View>

          <TextField
            label={`${t('wallet.holderName')} · ${t('common.optional')}`}
            value={holder}
            onChangeText={setHolder}
            placeholder="Yousef Khalil"
            autoCapitalize="words"
          />
        </Card>

        <Card padding="lg">
          <SwitchRow
            label={t('wallet.setDefault')}
            value={makeDefault}
            onValueChange={setMakeDefault}
          />
        </Card>

        {addMethod.isError ? (
          <InlineNotice
            tone="danger"
            title={t('common.somethingWrong')}
            body={errorMessage(addMethod.error)}
          />
        ) : null}

        <AppButton
          label={t('common.add')}
          onPress={handleSubmit}
          disabled={!canSubmit}
          loading={addMethod.isPending}
        />
      </View>
    </Screen>
  );
}
