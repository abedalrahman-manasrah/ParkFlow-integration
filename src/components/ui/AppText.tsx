import { Text, type TextProps, type TextStyle } from 'react-native';
import { useMemo } from 'react';
import {
  fontFamily,
  systemFallback,
  maxFontSizeMultiplier,
  typography,
  type FontWeightToken,
  type TypographyVariant,
} from '@/theme/typography';
import { useTheme } from '@/theme/ThemeProvider';
import type { ColorScheme } from '@/theme/colors';
import { useLocale } from '@/hooks/useLocale';

type ColorToken = keyof Pick<
  ColorScheme,
  | 'text'
  | 'textSecondary'
  | 'textTertiary'
  | 'textInverse'
  | 'textOnColor'
  | 'brand'
  | 'onDeep'
  | 'onDeepMuted'
  | 'successText'
  | 'warningText'
  | 'dangerText'
  | 'infoText'
  | 'danger'
  | 'success'
>;

export interface AppTextProps extends TextProps {
  variant?: TypographyVariant;
  color?: ColorToken;
  weight?: FontWeightToken;
  align?: 'auto' | 'left' | 'right' | 'center';
  /** Locks digit width so timers and amounts do not jitter as they change. */
  numeric?: boolean;
  /** Ignores the app language and pins alignment (used inside LTR-only chips). */
  forceLtrAlign?: boolean;
}

export function AppText({
  variant = 'body',
  color = 'text',
  weight,
  align,
  numeric = false,
  forceLtrAlign = false,
  style,
  ...rest
}: AppTextProps) {
  const { colors } = useTheme();
  const { textAlign, isRTL } = useLocale();
  const spec = typography[variant];

  const computed = useMemo<TextStyle>(() => {
    const resolvedAlign =
      align ?? (forceLtrAlign ? 'left' : (textAlign as TextStyle['textAlign']));
    return {
      fontFamily: isRTL ? systemFallback : fontFamily[weight ?? spec.weight],
      fontWeight: isRTL
        ? ({ regular: '400', medium: '500', semibold: '600', bold: '700', extrabold: '800' } as const)[weight ?? spec.weight]
        : undefined,
      fontSize: spec.fontSize,
      lineHeight: spec.lineHeight,
      letterSpacing: spec.letterSpacing,
      textTransform: spec.textTransform,
      color: colors[color],
      textAlign: resolvedAlign,
      ...(numeric ? { fontVariant: ['tabular-nums' as const] } : null),
    };
  }, [align, colors, color, forceLtrAlign, numeric, spec, textAlign, isRTL, weight]);

  return (
    <Text maxFontSizeMultiplier={maxFontSizeMultiplier} style={[computed, style]} {...rest} />
  );
}
