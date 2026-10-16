import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { AppText } from './AppText';
import { useTheme } from '@/theme/ThemeProvider';
import { radius } from '@/theme/radius';
import { spacing } from '@/theme/spacing';
import { duration } from '@/theme/motion';

export interface OtpInputProps {
  value: string;
  onChangeText: (value: string) => void;
  length?: number;
  autoFocus?: boolean;
  hasError?: boolean;
  disabled?: boolean;
  onComplete?: (value: string) => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * One hidden TextInput drives visible boxes. That keeps one-time-code autofill, paste and
 * hardware keyboards working exactly as the platform expects — six separate
 * inputs break all three.
 */
export function OtpInput({
  value,
  onChangeText,
  length = 6,
  autoFocus = true,
  hasError = false,
  disabled = false,
  onComplete,
  style,
  testID,
}: OtpInputProps) {
  const { colors } = useTheme();
  const inputRef = useRef<TextInput>(null);
  const [focused, setFocused] = useState(false);
  const shake = useSharedValue(0);

  useEffect(() => {
    if (!hasError) return;
    shake.value = withSequence(
      withTiming(-8, { duration: 55 }),
      withRepeat(withTiming(8, { duration: 90 }), 3, true),
      withTiming(0, { duration: 55 }),
    );
  }, [hasError, shake]);

  useEffect(() => {
    if (value.length === length) onComplete?.(value);
  }, [value, length, onComplete]);

  const shakeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shake.value }] }));

  const handleChange = (next: string) => {
    const digits = next.replace(/\D/g, '').slice(0, length);
    onChangeText(digits);
  };

  return (
    <Animated.View style={[shakeStyle, style]}>
      <Pressable
        onPress={() => inputRef.current?.focus()}
        accessibilityRole="none"
        // The boxes are decoration; the hidden field below is the real control.
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{ flexDirection: 'row', gap: spacing.sm, justifyContent: 'center' }}
      >
        {Array.from({ length }).map((_, index) => {
          const char = value[index] ?? '';
          const isActive = focused && index === Math.min(value.length, length - 1);
          const filled = char !== '';

          return (
            <View
              key={index}
              style={{
                flex: 1,
                maxWidth: 56,
                height: 62,
                borderRadius: radius.lg,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: colors.surface,
                borderWidth: isActive || filled || hasError ? 2 : StyleSheet.hairlineWidth * 2,
                borderColor: hasError
                  ? colors.danger
                  : isActive
                    ? colors.brand
                    : filled
                      ? colors.borderStrong
                      : colors.border,
              }}
            >
              <AppText variant="h2" align="center" numeric>
                {char}
              </AppText>
            </View>
          );
        })}
      </Pressable>

      <TextInput
        ref={inputRef}
        testID={testID}
        value={value}
        onChangeText={handleChange}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        autoFocus={autoFocus}
        editable={!disabled}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="one-time-code"
        maxLength={length}
        accessibilityLabel="Verification code"
        // Invisible but still hit-testable, so a tap focuses it directly.
        caretHidden
        selectionColor="transparent"
        style={[StyleSheet.absoluteFill, { opacity: 0, color: 'transparent' }]}
      />
    </Animated.View>
  );
}
