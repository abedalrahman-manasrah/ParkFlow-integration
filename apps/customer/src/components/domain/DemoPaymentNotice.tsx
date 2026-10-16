import type { StyleProp, ViewStyle } from 'react-native';

import { InlineNotice } from '@parkflow/client/components/ui';
import { useLocale } from '@parkflow/client/hooks/useLocale';

/** True only for public demo builds whose backend runs the simulated payment provider. */
export const SIMULATED_PAYMENTS = process.env.EXPO_PUBLIC_SIMULATED_PAYMENTS === 'true';

/** Tells demo users that no real card is charged. Renders nothing unless the flag is on. */
export function DemoPaymentNotice({ style }: { style?: StyleProp<ViewStyle> }) {
  const { t } = useLocale();
  if (!SIMULATED_PAYMENTS) return null;
  return (
    <InlineNotice tone="info" title={t('wallet.demoPayment')} body={t('wallet.demoPaymentBody')} style={style} />
  );
}
