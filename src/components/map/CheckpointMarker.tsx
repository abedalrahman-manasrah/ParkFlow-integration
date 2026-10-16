import { View } from 'react-native';
import { ShieldCheck, ShieldX, TrafficCone } from 'lucide-react-native';
import { AppText } from '@/components/ui/AppText';
import { useTheme } from '@/theme/ThemeProvider';
import type { ColorScheme } from '@/theme/colors';
import { radius } from '@/theme/radius';
import { shadow } from '@/theme/shadows';
import type { CheckpointStatus } from '@/types';

export function checkpointColor(
  status: CheckpointStatus,
  assumed: boolean,
  colors: ColorScheme,
): string {
  if (assumed) return colors.textTertiary;
  if (status === 'closed') return colors.danger;
  if (status === 'congested') return colors.warning;
  return colors.success;
}

export function CheckpointIcon({
  status,
  color,
  size = 14,
}: {
  status: CheckpointStatus;
  color: string;
  size?: number;
}) {
  const Icon = status === 'closed' ? ShieldX : status === 'congested' ? TrafficCone : ShieldCheck;
  return <Icon size={size} color={color} strokeWidth={2.4} />;
}

export interface CheckpointMarkerProps {
  status: CheckpointStatus;
  assumed: boolean;
  label?: string;
}

/** Map pin for a checkpoint: status colour and icon, so it never relies on colour alone. */
export function CheckpointMarker({ status, assumed, label }: CheckpointMarkerProps) {
  const { colors } = useTheme();
  const color = checkpointColor(status, assumed, colors);

  return (
    <View
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 4,
          paddingVertical: 4,
          paddingHorizontal: 8,
          borderRadius: radius.pill,
          borderWidth: 2,
          borderColor: color,
          backgroundColor: colors.surface,
        },
        shadow.sm,
      ]}
    >
      <CheckpointIcon status={status} color={color} />
      {label ? (
        <AppText variant="caption" numberOfLines={1} style={{ maxWidth: 120 }}>
          {label}
        </AppText>
      ) : null}
    </View>
  );
}
