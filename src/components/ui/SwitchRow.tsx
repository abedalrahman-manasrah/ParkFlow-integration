import { Switch, View, type StyleProp, type ViewStyle } from 'react-native';
import { AppText } from './AppText';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/spacing';
import { useLocale } from '@/hooks/useLocale';
import { haptics } from '@/utils/haptics';

export interface SwitchRowProps {
  label: string;
  description?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function SwitchRow({
  label,
  description,
  value,
  onValueChange,
  disabled = false,
  style,
}: SwitchRowProps) {
  const { colors } = useTheme();
  const { row } = useLocale();

  return (
    <View
      style={[
        {
          flexDirection: row,
          alignItems: 'center',
          gap: spacing.lg,
          paddingVertical: spacing.sm,
          opacity: disabled ? 0.5 : 1,
        },
        style,
      ]}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <AppText variant="titleLg">{label}</AppText>
        {description ? (
          <AppText variant="bodySm" color="textSecondary">
            {description}
          </AppText>
        ) : null}
      </View>
      <Switch
        value={value}
        disabled={disabled}
        onValueChange={(next) => {
          haptics.select();
          onValueChange(next);
        }}
        trackColor={{ false: colors.borderStrong, true: colors.brand }}
        thumbColor={colors.surface}
        ios_backgroundColor={colors.borderStrong}
        accessibilityLabel={label}
      />
    </View>
  );
}
