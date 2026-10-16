import { ScrollView, View, type StyleProp, type ViewStyle } from 'react-native';
import { AppText } from './AppText';
import { PressableScale } from './PressableScale';
import { useTheme } from '@/theme/ThemeProvider';
import { radius } from '@/theme/radius';
import { spacing } from '@/theme/spacing';
import { useLocale } from '@/hooks/useLocale';

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  /** Optional count shown after the label, e.g. filter result totals. */
  badge?: number;
}

export interface SegmentedProps<T extends string> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** `pills` scroll horizontally; `inset` fills the width evenly. */
  variant?: 'pills' | 'inset';
  style?: StyleProp<ViewStyle>;
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  variant = 'pills',
  style,
}: SegmentedProps<T>) {
  const { colors } = useTheme();
  const { row } = useLocale();

  const items = options.map((option) => {
    const active = option.value === value;
    return (
      <PressableScale
        key={option.value}
        onPress={() => onChange(option.value)}
        haptic="select"
        scaleTo={0.96}
        accessibilityRole="tab"
        accessibilityState={{ selected: active }}
        accessibilityLabel={option.label}
        style={{
          flex: variant === 'inset' ? 1 : undefined,
          flexDirection: row,
          alignItems: 'center',
          justifyContent: 'center',
          gap: spacing.xs + 2,
          paddingHorizontal: variant === 'inset' ? spacing.sm : spacing.lg,
          minHeight: 44,
          borderRadius: radius.md,
          backgroundColor: active
            ? variant === 'inset'
              ? colors.surface
              : colors.brandSoft
            : 'transparent',
        }}
      >
        <AppText
          variant="label"
          numberOfLines={1}
          style={{
            color: active
              ? variant === 'inset'
                ? colors.text
                : colors.successText
              : colors.textSecondary,
          }}
        >
          {option.label}
        </AppText>
        {option.badge != null && option.badge > 0 ? (
          <AppText
            variant="caption"
            numeric
            style={{ color: active ? colors.successText : colors.textTertiary }}
          >
            {option.badge}
          </AppText>
        ) : null}
      </PressableScale>
    );
  });

  if (variant === 'inset') {
    return (
      <View
        style={[
          {
            flexDirection: row,
            padding: 4,
            gap: 4,
            borderRadius: radius.md,
            backgroundColor: colors.surfaceAlt,
          },
          style,
        ]}
      >
        {items}
      </View>
    );
  }

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={style}
      contentContainerStyle={{ flexDirection: row, gap: spacing.sm }}
    >
      {items}
    </ScrollView>
  );
}
