import { memo } from 'react';
import { View } from 'react-native';
import { Droplets, Gauge, Wrench, CircleDot } from 'lucide-react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { shadow } from '@/theme/shadows';
import type { CarServiceCategory } from '@/types';

const markerTone = (category: CarServiceCategory, colors: ReturnType<typeof useTheme>['colors']) => {
  switch (category) {
    case 'car_wash': return colors.info;
    case 'oil_change': return colors.warning;
    case 'maintenance': return colors.brand;
    case 'tire_service': return colors.neutralText;
  }
};

const Icon = ({ category, color }: { category: CarServiceCategory; color: string }) => {
  const props = { size: 21, color, strokeWidth: 2.5 };
  switch (category) {
    case 'car_wash': return <Droplets {...props} />;
    case 'oil_change': return <Gauge {...props} />;
    case 'maintenance': return <Wrench {...props} />;
    case 'tire_service': return <CircleDot {...props} />;
  }
};

export const CarServiceMarker = memo(function CarServiceMarker({ category, selected = false }: { category: CarServiceCategory; selected?: boolean }) {
  const { colors } = useTheme();
  const tone = markerTone(category, colors);
  return <View style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}>
    <View style={[{ width: selected ? 42 : 36, height: selected ? 42 : 36, borderRadius: 12, borderWidth: selected ? 3 : 2, borderColor: selected ? colors.text : colors.surface, backgroundColor: tone, alignItems: 'center', justifyContent: 'center' }, selected ? shadow.md : shadow.sm]}>
      <Icon category={category} color={colors.surface} />
    </View>
  </View>;
});
