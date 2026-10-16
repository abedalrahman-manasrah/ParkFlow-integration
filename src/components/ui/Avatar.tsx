import { View, type StyleProp, type ViewStyle } from 'react-native';
import { AppText } from './AppText';
import { useTheme } from '@/theme/ThemeProvider';
import { radius } from '@/theme/radius';

export interface AvatarProps {
  name?: string;
  size?: number;
  tone?: 'brand' | 'deep' | 'surface';
  style?: StyleProp<ViewStyle>;
}

/** Initials avatar — no remote image dependency, works offline. */
export function Avatar({ name, size = 48, tone = 'brand', style }: AvatarProps) {
  const { colors } = useTheme();

  const initials =
    (name ?? '')
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('') || '·';

  const background =
    tone === 'deep' ? colors.deep : tone === 'surface' ? colors.surfaceAlt : colors.brandSoft;
  const foreground =
    tone === 'deep' ? colors.onDeep : tone === 'surface' ? colors.text : colors.successText;

  return (
    <View
      accessibilityLabel={name}
      style={[
        {
          width: size,
          height: size,
          borderRadius: radius.pill,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: background,
        },
        style,
      ]}
    >
      <AppText
        variant={size >= 56 ? 'h2' : 'title'}
        align="center"
        style={{ color: foreground, fontSize: size * 0.36, lineHeight: size * 0.44 }}
      >
        {initials}
      </AppText>
    </View>
  );
}
