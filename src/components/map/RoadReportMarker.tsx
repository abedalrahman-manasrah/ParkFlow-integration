import { View } from 'react-native';
import {
  Ban,
  Car,
  CircleHelp,
  Construction,
  MapPin,
  Shield,
  TrafficCone,
  TriangleAlert,
} from 'lucide-react-native';
import type { RoadReportType } from '@/types';
import { useTheme } from '@/theme/ThemeProvider';
import { radius } from '@/theme/radius';
import { shadow } from '@/theme/shadows';

export function roadReportColor(type: RoadReportType, colors: ReturnType<typeof useTheme>['colors']) {
  switch (type) {
    case 'accident': return colors.danger;
    case 'traffic_congestion': return colors.warning;
    case 'closed_road': return colors.dangerDeep;
    case 'checkpoint': return colors.deep;
    case 'road_hazard': return colors.warningText;
    case 'construction': return colors.parkingRestricted;
    case 'police': return colors.info;
    case 'other': return colors.neutralText;
  }
}

function ReportIcon({ type, color, size = 17 }: { type: RoadReportType; color: string; size?: number }) {
  const props = { color, size, strokeWidth: 2.5 };
  switch (type) {
    case 'accident': return <TriangleAlert {...props} />;
    case 'traffic_congestion': return <Car {...props} />;
    case 'closed_road': return <Ban {...props} />;
    case 'checkpoint': return <MapPin {...props} />;
    case 'road_hazard': return <TrafficCone {...props} />;
    case 'construction': return <Construction {...props} />;
    case 'police': return <Shield {...props} />;
    case 'other': return <CircleHelp {...props} />;
  }
}

export function RoadReportMarker({ type, selected = false }: { type: RoadReportType; selected?: boolean }) {
  const { colors } = useTheme();
  const color = roadReportColor(type, colors);
  const size = selected ? 38 : 32;
  return (
    <View style={{ width: size, height: size + 6, alignItems: 'center' }}>
      <View
        style={[
          {
            width: size,
            height: size,
            borderRadius: radius.pill,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: color,
            borderColor: colors.surface,
            borderWidth: selected ? 4 : 3,
          },
          shadow.md,
        ]}
      >
        <ReportIcon type={type} color={colors.textOnColor} size={selected ? 19 : 16} />
      </View>
      <View style={{ width: 0, height: 0, borderLeftWidth: 4, borderRightWidth: 4, borderTopWidth: 6, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderTopColor: color }} />
    </View>
  );
}

export { ReportIcon };
