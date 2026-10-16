import { memo } from 'react';
import { View } from 'react-native';
import { Zap } from 'lucide-react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { shadow } from '@/theme/shadows';
import type { EvStationStatus } from '@/types';
export const EvStationMarker = memo(function EvStationMarker({ status, selected = false }: { status: EvStationStatus; selected?: boolean }) {
  const { colors } = useTheme();
  const tone = status === 'operational' ? colors.brand : status === 'temporarily_unavailable' ? colors.warning : status === 'planned' ? colors.info : colors.textSecondary;
  return <View style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}>
    <View style={[{ width: selected ? 42 : 36, height: selected ? 42 : 36, borderRadius: 12, borderWidth: selected ? 3 : 2, borderColor: selected ? colors.text : colors.surface, backgroundColor: tone, borderStyle: status === 'planned' ? 'dashed' : 'solid', alignItems: 'center', justifyContent: 'center' }, selected ? shadow.md : shadow.sm]}>
      <Zap size={22} color={colors.surface} strokeWidth={2.5} />
    </View>
  </View>;
});
