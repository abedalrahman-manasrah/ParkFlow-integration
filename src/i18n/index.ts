import { en, type TranslationKey, type Translations } from './en';
import { ar } from './ar';

export type Locale = 'en' | 'ar';

export const DEFAULT_LOCALE: Locale = 'ar';

export const LOCALES: Locale[] = ['ar', 'en'];

export const localeNames: Record<Locale, string> = {
  en: 'English',
  ar: 'العربية',
};

const dictionaries: Record<Locale, Partial<Translations>> = { en, ar };

/** Arabic renders right-to-left; everything else is left-to-right. */
export const isRtlLocale = (locale: Locale): boolean => locale === 'ar';

/**
 * Intl locale used for dates and numbers. `-u-nu-latn` keeps Latin digits in
 * Arabic so amounts stay consistent with the ₪ formatting used everywhere else.
 */
export const intlLocale = (locale: Locale): string =>
  locale === 'ar' ? 'ar-u-nu-latn' : 'en-US';

/** Replaces {name} placeholders. Missing params are left untouched, not blanked. */
function interpolate(template: string, params?: Record<string, string | number>): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in params ? String(params[key]) : match,
  );
}

export function translate(
  locale: Locale,
  key: TranslationKey,
  params?: Record<string, string | number>,
): string {
  const value = dictionaries[locale]?.[key] ?? en[key];
  return interpolate(value, params);
}

export type { TranslationKey, Translations };
export { en, ar };
