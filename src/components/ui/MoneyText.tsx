import type { StyleProp, TextStyle } from 'react-native';
import { AppText, type AppTextProps } from './AppText';
import { formatMoney } from '@/utils/money';

export interface MoneyTextProps extends Omit<AppTextProps, 'children' | 'numeric'> {
  /** Minor units (agora). */
  value: number;
  signed?: boolean;
  hideSymbol?: boolean;
  decimals?: number;
  style?: StyleProp<TextStyle>;
}

/** Always tabular so columns of amounts line up and live totals do not jitter. */
export function MoneyText({
  value,
  signed = false,
  hideSymbol = false,
  decimals = 2,
  variant = 'title',
  ...rest
}: MoneyTextProps) {
  return (
    <AppText variant={variant} numeric {...rest}>
      {formatMoney(value, { signed, hideSymbol, decimals })}
    </AppText>
  );
}
