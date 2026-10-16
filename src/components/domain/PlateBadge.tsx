import { View, type StyleProp, type ViewStyle } from 'react-native';
import { AppText } from '@/components/ui/AppText';
import { useTheme } from '@/theme/ThemeProvider';
import { useLocale } from '@/hooks/useLocale';
import { radius } from '@/theme/radius';
import { spacing } from '@/theme/spacing';

export interface PlateBadgeProps {
  plateNumber: string;
  size?: 'sm' | 'md' | 'lg';
  tone?: 'default' | 'onDeep';
  style?: StyleProp<ViewStyle>;
}

/**
 * Renders a plate the way it looks on the car — a bordered tag with a coloured
 * edge strip. Making it look physical helps the driver confirm at a glance that
 * they are about to pay for the right vehicle.
 *
 * Always left-to-right: plate numbers are not mirrored in Arabic.
 */
export function PlateBadge({ plateNumber, size = 'md', tone = 'default', style }: PlateBadgeProps) {
  const { colors } = useTheme();
  const { row } = useLocale();

  const metrics = {
    sm: { height: 22, font: 'caption' as const, padding: spacing.sm, strip: 4 },
    md: { height: 28, font: 'label' as const, padding: spacing.md, strip: 5 },
    lg: { height: 38, font: 'h3' as const, padding: spacing.lg, strip: 7 },
  }[size];

  const background = tone === 'onDeep' ? 'rgba(255,255,255,0.14)' : colors.surfaceAlt;
  const border = tone === 'onDeep' ? 'rgba(255,255,255,0.22)' : colors.border;
  const text = tone === 'onDeep' ? colors.onDeep : colors.text;

  // Same wrapper as StatusBadge: hug the reading-start edge without stretching.
  return (
    <View style={{ flexDirection: row, alignItems: 'center' }}>
      <View
        accessibilityLabel={`Plate ${plateNumber}`}
        style={[
          {
            flexDirection: 'row',
            alignItems: 'center',
            height: metrics.height,
            borderRadius: radius.xs,
            borderWidth: 1,
            borderColor: border,
            backgroundColor: background,
            overflow: 'hidden',
          },
          style,
        ]}
      >
        <View style={{ width: metrics.strip, height: '100%', backgroundColor: colors.brand }} />
        <AppText
          variant={metrics.font}
          numeric
          forceLtrAlign
          style={{
            color: text,
            paddingHorizontal: metrics.padding,
            letterSpacing: size === 'lg' ? 1.6 : 1,
          }}
        >
          {plateNumber}
        </AppText>
      </View>
    </View>
  );
}
