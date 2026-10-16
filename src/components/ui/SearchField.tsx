import { StyleSheet, TextInput, View, type StyleProp, type ViewStyle } from 'react-native';
import { Search, X } from 'lucide-react-native';
import { IconButton } from './IconButton';
import { useTheme } from '@/theme/ThemeProvider';
import { radius } from '@/theme/radius';
import { spacing } from '@/theme/spacing';
import { fontFamily, systemFallback, maxFontSizeMultiplier } from '@/theme/typography';
import { useLocale } from '@/hooks/useLocale';

export interface SearchFieldProps {
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  onSubmit?: () => void;
  autoFocus?: boolean;
  /** Floating variant sits over the map and needs its own elevation. */
  tone?: 'surface' | 'plain';
  trailing?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function SearchField({
  value,
  onChangeText,
  placeholder,
  onSubmit,
  autoFocus = false,
  tone = 'surface',
  trailing,
  style,
  testID,
}: SearchFieldProps) {
  const { colors } = useTheme();
  const { row, textAlign, isRTL, t } = useLocale();
  const inputTextAlign = value.length > 0 ? (/[\u0600-\u06ff]/.test(value) ? 'right' : 'left') : textAlign;
  const inputDirection = value.length > 0 ? (/[\u0600-\u06ff]/.test(value) ? 'rtl' : 'ltr') : undefined;

  return (
    <View
      testID={testID}
      style={[
        {
          flexDirection: row,
          alignItems: 'center',
          gap: spacing.md,
          height: 52,
          paddingHorizontal: spacing.lg,
          borderRadius: radius.lg,
          backgroundColor: tone === 'surface' ? colors.surface : colors.surfaceAlt,
          borderWidth: StyleSheet.hairlineWidth * 2,
          borderColor: colors.border,
        },
        style,
      ]}
    >
      <Search size={20} color={colors.textTertiary} strokeWidth={2.2} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textTertiary}
        onSubmitEditing={onSubmit}
        autoFocus={autoFocus}
        returnKeyType="search"
        maxFontSizeMultiplier={maxFontSizeMultiplier}
        accessibilityLabel={placeholder}
        style={{
          flex: 1,
          color: colors.text,
          fontFamily: isRTL ? systemFallback : fontFamily.medium,
          fontWeight: isRTL ? '500' : undefined,
          fontSize: 15,
          textAlign: inputTextAlign,
          writingDirection: inputDirection,
          paddingVertical: 0,
        }}
      />
      {value.length > 0 ? (
        <IconButton
          icon={<X size={16} color={colors.textSecondary} strokeWidth={2.4} />}
          tone="ghost"
          size={28}
          onPress={() => onChangeText('')}
          accessibilityLabel={t('common.close')}
          style={{ backgroundColor: colors.surfaceAlt }}
        />
      ) : (
        trailing
      )}
    </View>
  );
}
