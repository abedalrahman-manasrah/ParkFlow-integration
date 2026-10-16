import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { useLocale } from '@/hooks/useLocale';

export function Divider({
  style,
  inset = 0,
}: {
  style?: StyleProp<ViewStyle>;
  inset?: number;
}) {
  const { colors } = useTheme();
  const { isRTL } = useLocale();
  return (
    <View
      style={[
        { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, [isRTL ? 'marginRight' : 'marginLeft']: inset },
        style,
      ]}
    />
  );
}
