import { View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Rect, Stop, Circle, G } from 'react-native-svg';
import { AppText } from '@/components/ui/AppText';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/spacing';
import { useLocale } from '@/hooks/useLocale';
import { palette } from '@/theme/colors';

export interface LogoMarkProps {
  size?: number;
  /** `light` for dark backgrounds, `dark` for light surfaces. */
  tone?: 'light' | 'dark';
  style?: StyleProp<ViewStyle>;
}

/**
 * The ParkFlow mark: a parking "P" with the counter left open on the right so
 * three motion lines can flow out of it. Parking plus movement in one glyph.
 *
 * Drawn as vectors so it stays crisp at any size and ships no raster assets.
 */
export function LogoMark({ size = 64, tone = 'dark', style }: LogoMarkProps) {
  const gradientFrom = tone === 'light' ? palette.emerald400 : palette.emerald500;
  const gradientTo = tone === 'light' ? palette.emerald600 : palette.emerald700;
  const cutout = tone === 'light' ? palette.emerald950 : palette.white;

  return (
    <View style={style} accessibilityRole="image" accessibilityLabel="ParkFlow">
      <Svg width={size} height={size} viewBox="0 0 64 64">
        <Defs>
          <LinearGradient id="pfTile" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={gradientFrom} />
            <Stop offset="1" stopColor={gradientTo} />
          </LinearGradient>
        </Defs>

        <Rect x="0" y="0" width="64" height="64" rx="18" fill="url(#pfTile)" />

        {/* Stem of the P */}
        <Rect x="17" y="14" width="7.5" height="36" rx="3.4" fill={cutout} />

        {/* Bowl — an open arc rather than a closed loop, so the form reads as
            moving rather than sealed. */}
        <Path
          d="M24.5 17.4h9.4a8.6 8.6 0 0 1 0 17.2h-9.4"
          stroke={cutout}
          strokeWidth="7"
          strokeLinecap="round"
          fill="none"
        />

        {/* Flow lines leaving the bowl */}
        <G stroke={cutout} strokeWidth="4.6" strokeLinecap="round" opacity={0.95}>
          <Path d="M35.5 43.2h13.2" />
          <Path d="M28.5 50.6h12" />
        </G>
        <Circle cx="47.6" cy="50.6" r="2.7" fill={cutout} opacity={0.95} />
      </Svg>
    </View>
  );
}

export interface WordmarkProps {
  size?: 'sm' | 'md' | 'lg';
  tone?: 'light' | 'dark';
  showRegion?: boolean;
  style?: StyleProp<ViewStyle>;
}

/**
 * Name + mark lockup. Product naming lives here and in `brand.*` translation
 * keys alone, so renaming the app stays a two-file change.
 */
export function Wordmark({ size = 'md', tone = 'dark', showRegion = true, style }: WordmarkProps) {
  const { row, t } = useLocale();
  const { colors } = useTheme();

  const markSize = size === 'lg' ? 56 : size === 'md' ? 40 : 30;
  const titleVariant = size === 'lg' ? 'h1' : size === 'md' ? 'h2' : 'h3';
  const color = tone === 'light' ? colors.onDeep : colors.text;
  const mutedColor = tone === 'light' ? colors.onDeepMuted : colors.textSecondary;

  return (
    <View style={[{ flexDirection: row, alignItems: 'center', gap: spacing.md }, style]}>
      <LogoMark size={markSize} tone={tone} />
      <View style={{ gap: 1 }}>
        <AppText variant={titleVariant} style={{ color }}>
          {t('brand.name')}
        </AppText>
        {showRegion ? (
          <AppText variant="caption" style={{ color: mutedColor, letterSpacing: 1.4 }}>
            {t('brand.region').toUpperCase()}
          </AppText>
        ) : null}
      </View>
    </View>
  );
}
