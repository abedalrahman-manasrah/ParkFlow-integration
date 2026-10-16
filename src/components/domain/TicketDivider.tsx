import { View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/spacing';

export interface TicketDividerProps {
  /** Must match the surface behind the card, so the notches read as cut-outs. */
  backgroundColor?: string;
  notchSize?: number;
  style?: StyleProp<ViewStyle>;
}

/**
 * The tear line on the receipt: a dashed rule with a half-circle bitten out of
 * each edge. It is what makes the card read as a ticket rather than a panel.
 *
 * The notches are drawn in the page's background colour and pulled outside the
 * card's padding, so they sit exactly on its edges.
 */
export function TicketDivider({ backgroundColor, notchSize = 20, style }: TicketDividerProps) {
  const { colors } = useTheme();
  const notchColor = backgroundColor ?? colors.background;
  const half = notchSize / 2;

  return (
    <View
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          marginVertical: spacing.lg,
          // Reach past the card padding so the notches land on the border.
          marginHorizontal: -spacing.xl,
        },
        style,
      ]}
      pointerEvents="none"
    >
      <View
        style={{
          width: half,
          height: notchSize,
          borderTopEndRadius: half,
          borderBottomEndRadius: half,
          backgroundColor: notchColor,
        }}
      />

      <View style={{ flex: 1, flexDirection: 'row', overflow: 'hidden', gap: 6, paddingHorizontal: spacing.sm }}>
        {Array.from({ length: 28 }).map((_, index) => (
          <View
            key={index}
            style={{ width: 6, height: 2, borderRadius: 1, backgroundColor: colors.border }}
          />
        ))}
      </View>

      <View
        style={{
          width: half,
          height: notchSize,
          borderTopStartRadius: half,
          borderBottomStartRadius: half,
          backgroundColor: notchColor,
        }}
      />
    </View>
  );
}
