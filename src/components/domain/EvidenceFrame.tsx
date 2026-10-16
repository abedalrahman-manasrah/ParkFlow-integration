import { View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Rect, Stop, G, Circle } from 'react-native-svg';

import { AppText } from '@/components/ui/AppText';
import { PlateBadge } from './PlateBadge';
import { useTheme } from '@/theme/ThemeProvider';
import { radius } from '@/theme/radius';
import { spacing } from '@/theme/spacing';
import { formatDateTime } from '@/utils/time';
import { useLocale } from '@/hooks/useLocale';

export type EvidenceView = 'wide' | 'plate' | 'context';

export interface EvidenceFrameProps {
  view: EvidenceView;
  plateNumber: string;
  capturedAt: string;
  deviceId?: string;
  height?: number;
  style?: StyleProp<ViewStyle>;
}

/**
 * A rendered stand-in for an enforcement capture.
 *
 * Real photos come from the issuing authority's ANPR systems, which this build
 * has no access to. Rather than ship broken image slots or stock photography
 * that could be mistaken for real evidence, each frame is drawn as a clearly
 * synthetic scene and labelled as sample data — while keeping the layout,
 * overlays and metadata identical to the production screen.
 */
export function EvidenceFrame({
  view,
  plateNumber,
  capturedAt,
  deviceId,
  height = 220,
  style,
}: EvidenceFrameProps) {
  const { colors } = useTheme();
  const { t, dateLocale, row } = useLocale();

  const isPlateCrop = view === 'plate';

  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={`${t('evidence.title')} — ${plateNumber}`}
      style={[
        {
          height,
          borderRadius: radius.lg,
          overflow: 'hidden',
          backgroundColor: '#111A17',
          borderWidth: 1,
          borderColor: colors.border,
        },
        style,
      ]}
    >
      <Svg width="100%" height="100%" viewBox="0 0 320 220" preserveAspectRatio="xMidYMid slice">
        <Defs>
          <LinearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#1E2E28" />
            <Stop offset="1" stopColor="#0D1613" />
          </LinearGradient>
          <LinearGradient id="body" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#4A5D56" />
            <Stop offset="1" stopColor="#2A3A34" />
          </LinearGradient>
        </Defs>

        <Rect x="0" y="0" width="320" height="220" fill="url(#sky)" />

        {isPlateCrop ? (
          <G>
            {/* Tight crop: the plate fills the frame. */}
            <Rect x="40" y="70" width="240" height="80" rx="8" fill="#E8EDEA" />
            <Rect x="40" y="70" width="26" height="80" rx="8" fill="#0A8F5F" />
            <Rect x="76" y="96" width="180" height="28" rx="3" fill="#9AA8A2" opacity="0.35" />
            <Rect x="34" y="64" width="252" height="92" rx="10" fill="none" stroke="#22C58B" strokeWidth="3" />
          </G>
        ) : (
          <G>
            {/* Road */}
            <Rect x="0" y="150" width="320" height="70" fill="#1A2621" />
            <Rect x="0" y="148" width="320" height="3" fill="#2E3F38" />
            {[20, 90, 160, 230, 300].map((x) => (
              <Rect key={x} x={x} y="196" width="34" height="4" rx="2" fill="#3A4C45" />
            ))}

            {/* Kerb + parking bay marking */}
            <Rect x="0" y="150" width="320" height="6" fill="#F5C451" opacity="0.5" />

            {/* Vehicle silhouette */}
            <Path
              d="M62 150 L74 118 Q78 108 90 106 L196 106 Q210 108 216 118 L232 150 Z"
              fill="url(#body)"
            />
            <Path d="M92 112 L184 112 L196 136 L84 136 Z" fill="#8FA8A0" opacity="0.5" />
            <Circle cx="98" cy="152" r="15" fill="#141C19" />
            <Circle cx="98" cy="152" r="6" fill="#33443E" />
            <Circle cx="198" cy="152" r="15" fill="#141C19" />
            <Circle cx="198" cy="152" r="6" fill="#33443E" />

            {/* Plate, highlighted the way ANPR marks its read */}
            <Rect x="122" y="136" width="56" height="16" rx="2" fill="#E8EDEA" />
            <Rect x="122" y="136" width="7" height="16" rx="2" fill="#0A8F5F" />
            <Rect x="116" y="130" width="68" height="28" rx="4" fill="none" stroke="#22C58B" strokeWidth="2.5" />

            {view === 'context' ? (
              <>
                {/* Zone sign, to place the vehicle in a paid bay */}
                <Rect x="258" y="70" width="42" height="54" rx="4" fill="#0F3D2E" />
                <Rect x="266" y="80" width="26" height="6" rx="2" fill="#9BEDCC" />
                <Rect x="266" y="92" width="26" height="6" rx="2" fill="#9BEDCC" opacity="0.6" />
                <Rect x="276" y="124" width="5" height="30" fill="#2E3F38" />
              </>
            ) : null}
          </G>
        )}

        {/* Corner reticles — the visual language of a machine capture. */}
        {[
          [10, 10, 1, 1],
          [310, 10, -1, 1],
          [10, 210, 1, -1],
          [310, 210, -1, -1],
        ].map(([x, y, dx, dy]) => (
          <G key={`${x}-${y}`}>
            <Rect x={x! - (dx! > 0 ? 0 : 22)} y={y!} width="22" height="2" fill="#22C58B" opacity="0.7" />
            <Rect x={x!} y={y! - (dy! > 0 ? 0 : 22)} width="2" height="22" fill="#22C58B" opacity="0.7" />
          </G>
        ))}
      </Svg>

      {/* ---- Overlays -------------------------------------------------- */}
      <View
        style={{
          position: 'absolute',
          top: spacing.md,
          left: spacing.md,
          right: spacing.md,
          flexDirection: row,
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: spacing.sm,
        }}
      >
        <View
          style={{
            paddingVertical: 4,
            paddingHorizontal: spacing.sm,
            borderRadius: radius.xs,
            backgroundColor: 'rgba(0,0,0,0.55)',
          }}
        >
          <AppText variant="caption" numeric forceLtrAlign style={{ color: '#D3F8E7' }}>
            {formatDateTime(capturedAt, dateLocale)}
          </AppText>
        </View>

        {deviceId ? (
          <View
            style={{
              paddingVertical: 4,
              paddingHorizontal: spacing.sm,
              borderRadius: radius.xs,
              backgroundColor: 'rgba(0,0,0,0.55)',
            }}
          >
            <AppText variant="caption" numeric forceLtrAlign style={{ color: '#D3F8E7' }}>
              {deviceId}
            </AppText>
          </View>
        ) : null}
      </View>

      <View
        style={{
          position: 'absolute',
          bottom: spacing.md,
          left: spacing.md,
          right: spacing.md,
          flexDirection: row,
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: spacing.sm,
        }}
      >
        <PlateBadge plateNumber={plateNumber} size="sm" />
        <View
          style={{
            paddingVertical: 3,
            paddingHorizontal: spacing.sm,
            borderRadius: radius.xs,
            backgroundColor: 'rgba(0,0,0,0.55)',
          }}
        >
          <AppText variant="caption" style={{ color: '#9BEDCC', fontSize: 10 }}>
            SAMPLE CAPTURE
          </AppText>
        </View>
      </View>
    </View>
  );
}
