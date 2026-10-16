import type { Currency } from '@/types';

export const CURRENCY_SYMBOL: Record<Currency, string> = {
  ILS: '₪',
};

/** Minor units (agora) -> major units. */
export const toMajor = (minor: number) => minor / 100;
export const toMinor = (major: number) => Math.round(major * 100);

interface FormatOptions {
  currency?: Currency;
  /** Prefix an explicit +/- (used by the activity ledger). */
  signed?: boolean;
  /** Drop the currency symbol — for inputs and compact chips. */
  hideSymbol?: boolean;
  decimals?: number;
}

/**
 * Formats minor units for display: 2350 -> "23.50 ₪".
 * The symbol trails the number, which reads correctly in both en and ar.
 */
export function formatMoney(minor: number, options: FormatOptions = {}): string {
  const { currency = 'ILS', signed = false, hideSymbol = false, decimals = 2 } = options;
  const value = Math.abs(toMajor(minor));
  const body = value.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  const sign = signed ? (minor < 0 ? '-' : '+') : minor < 0 ? '-' : '';
  const symbol = hideSymbol ? '' : ` ${CURRENCY_SYMBOL[currency]}`;
  return `${sign}${body}${symbol}`;
}

/** "3 ₪ / hour" style rate label — trims a pointless ".00". */
export function formatRate(minorPerHour: number, currency: Currency = 'ILS'): string {
  const value = toMajor(minorPerHour);
  const body = Number.isInteger(value) ? String(value) : value.toFixed(2);
  return `${body} ${CURRENCY_SYMBOL[currency]}`;
}
