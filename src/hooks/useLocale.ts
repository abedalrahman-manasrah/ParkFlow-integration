import { useCallback, useEffect, useMemo } from 'react';
import { I18nManager, Platform } from 'react-native';
import {
  intlLocale,
  isRtlLocale,
  translate,
  type Locale,
  type TranslationKey,
} from '@/i18n';
import { usePreferencesStore } from '@/store/preferencesStore';

export interface LocaleContext {
  locale: Locale;
  isRTL: boolean;
  /** Locale string for Intl date/number formatting. */
  dateLocale: string;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
  setLocale: (locale: Locale) => void;
  /** Flip a row when the language is RTL. */
  row: 'row' | 'row-reverse';
  textAlign: 'left' | 'right';
  /** Cross-axis value that hugs the reading start / end edge of a column. */
  alignStart: 'flex-start' | 'flex-end';
  alignEnd: 'flex-start' | 'flex-end';
  /** Direction multiplier for translateX-style animations and chevrons. */
  dir: 1 | -1;
}

/**
 * Layout direction is driven from React state rather than `I18nManager.forceRTL`
 * because forcing RTL natively requires a full app restart. Components consume
 * `row` / `textAlign` / `dir` so Arabic mirrors correctly the moment it is
 * selected — and we still tell I18nManager to allow RTL so native text input and
 * system components behave.
 */
/**
 * Components mirror themselves through `row` / `textAlign`, the same way they do
 * on native where the layout engine stays left-to-right. A `dir="rtl"` document
 * would flip every flex row a second time and undo that mirroring, so the page
 * keeps an LTR layout; Arabic text still shapes correctly because each text root
 * renders with `dir="auto"`.
 */
function applyWebDocumentLocale(locale: Locale) {
  document.documentElement.dir = 'ltr';
  document.documentElement.lang = locale;
}

export function useLocale(): LocaleContext {
  const locale = usePreferencesStore((s) => s.locale);
  const setStoredLocale = usePreferencesStore((s) => s.setLocale);

  const isRTL = isRtlLocale(locale);

  useEffect(() => {
    if (Platform.OS !== 'web') {
      I18nManager.allowRTL(isRTL);
    } else if (typeof document !== 'undefined') {
      applyWebDocumentLocale(locale);
    }
  }, [isRTL, locale]);

  const t = useCallback(
    (key: TranslationKey, params?: Record<string, string | number>) =>
      translate(locale, key, params),
    [locale],
  );

  const setLocale = useCallback(
    (next: Locale) => {
      setStoredLocale(next);
      if (Platform.OS !== 'web') {
        I18nManager.allowRTL(isRtlLocale(next));
      } else if (typeof document !== 'undefined') {
        applyWebDocumentLocale(next);
      }
    },
    [setStoredLocale],
  );

  return useMemo(
    () => ({
      locale,
      isRTL,
      dateLocale: intlLocale(locale),
      t,
      setLocale,
      row: isRTL ? 'row-reverse' : 'row',
      textAlign: isRTL ? 'right' : 'left',
      alignStart: isRTL ? 'flex-end' : 'flex-start',
      alignEnd: isRTL ? 'flex-start' : 'flex-end',
      dir: isRTL ? -1 : 1,
    }),
    [locale, isRTL, t, setLocale],
  );
}
