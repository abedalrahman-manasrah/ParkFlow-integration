import { forwardRef, useState, type ReactNode } from 'react';
import {
  StyleSheet,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { AppText } from './AppText';
import { useTheme } from '@/theme/ThemeProvider';
import { radius } from '@/theme/radius';
import { spacing } from '@/theme/spacing';
import { fontFamily, systemFallback, maxFontSizeMultiplier } from '@/theme/typography';
import { duration } from '@/theme/motion';
import { useLocale } from '@/hooks/useLocale';

export interface TextFieldProps extends Omit<TextInputProps, 'style'> {
  label?: string;
  hint?: string;
  error?: string;
  leading?: ReactNode;
  trailing?: ReactNode;
  /** Bigger type for primary inputs like the phone number and plate. */
  emphasis?: 'default' | 'strong';
  containerStyle?: StyleProp<ViewStyle>;
  inputStyle?: StyleProp<ViewStyle>;
}

export const TextField = forwardRef<TextInput, TextFieldProps>(function TextField(
  {
    label,
    hint,
    error,
    leading,
    trailing,
    emphasis = 'default',
    containerStyle,
    inputStyle,
    onFocus,
    onBlur,
    ...rest
  },
  ref,
) {
  const { colors } = useTheme();
  const { row, textAlign, isRTL } = useLocale();
  const [focused, setFocused] = useState(false);
  const value = typeof rest.value === 'string' ? rest.value : '';
  const keyboardType = String(rest.keyboardType ?? '');
  const forceLtrInput =
    rest.textContentType === 'emailAddress' ||
    rest.autoComplete === 'email' ||
    ['email-address', 'url', 'phone-pad', 'number-pad', 'numeric', 'decimal-pad'].includes(keyboardType);
  const containsArabic = /[\u0600-\u06ff]/.test(value);
  const inputTextAlign = forceLtrInput ? 'left' : value ? (containsArabic ? 'right' : 'left') : textAlign;
  const inputDirection = forceLtrInput ? 'ltr' : value ? (containsArabic ? 'rtl' : 'ltr') : undefined;

  const focus = useSharedValue(0);

  // Border colour animates instead of snapping — small thing, reads as quality.
  const animatedBorder = useAnimatedStyle(() => ({
    borderColor: error
      ? colors.danger
      : focus.value > 0.5
        ? colors.brand
        : colors.border,
    borderWidth: focus.value > 0.5 || error ? 2 : StyleSheet.hairlineWidth * 2,
  }));

  return (
    <View style={[{ gap: spacing.sm }, containerStyle]}>
      {label ? (
        <AppText variant="label" color="textSecondary">
          {label}
        </AppText>
      ) : null}

      <Animated.View
        style={[
          {
            flexDirection: row,
            alignItems: 'center',
            gap: spacing.md,
            backgroundColor: colors.surface,
            borderRadius: radius.lg,
            paddingHorizontal: spacing.lg,
            minHeight: emphasis === 'strong' ? 64 : 56,
          },
          animatedBorder,
          inputStyle,
        ]}
      >
        {leading}

        <TextInput
          ref={ref}
          style={{
            flex: 1,
            // Without an explicit 0, the web build gives the input a
            // `min-width: auto` floor and it refuses to shrink, pushing rows
            // with a leading element off the edge on narrow phones.
            minWidth: 0,
            color: colors.text,
            fontFamily: isRTL ? systemFallback : emphasis === 'strong' ? fontFamily.bold : fontFamily.medium,
            fontWeight: isRTL ? (emphasis === 'strong' ? '700' : '500') : undefined,
            fontSize: emphasis === 'strong' ? 20 : 16,
            letterSpacing: emphasis === 'strong' ? 0.4 : 0,
            textAlign: inputTextAlign,
            writingDirection: inputDirection,
            // Android adds vertical padding that breaks the centred layout.
            paddingVertical: 0,
          }}
          placeholderTextColor={colors.textTertiary}
          maxFontSizeMultiplier={maxFontSizeMultiplier}
          onFocus={(event) => {
            setFocused(true);
            focus.value = withTiming(1, { duration: duration.fast });
            onFocus?.(event);
          }}
          onBlur={(event) => {
            setFocused(false);
            focus.value = withTiming(0, { duration: duration.fast });
            onBlur?.(event);
          }}
          accessibilityLabel={label}
          {...rest}
        />

        {trailing}
      </Animated.View>

      {error ? (
        <AppText variant="caption" color="danger" accessibilityLiveRegion="polite">
          {error}
        </AppText>
      ) : hint && !focused ? (
        <AppText variant="caption" color="textTertiary">
          {hint}
        </AppText>
      ) : null}
    </View>
  );
});
