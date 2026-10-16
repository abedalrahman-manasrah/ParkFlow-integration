import { memo } from 'react';
import { View } from 'react-native';
import { Landmark, Building2, Trees, MapPin, UsersRound } from 'lucide-react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { shadow } from '@/theme/shadows';
import type { TourismPlaceCategory } from '@/types';

const markerTone = (category: TourismPlaceCategory, colors: ReturnType<typeof useTheme>['colors']) => {
  switch (category) {
    case 'historic_landmark': return colors.warning;
    case 'museum': return colors.brand;
    case 'park_garden': return colors.success;
    case 'visitor_attraction': return colors.info;
    case 'family_rest': return colors.success;
    case 'prayer_place': return colors.brand;
  }
};

const Icon = ({ category, color }: { category: TourismPlaceCategory; color: string }) => {
  const props = { size: 21, color, strokeWidth: 2.5 };
  switch (category) {
    case 'historic_landmark': return <Landmark {...props} />;
    case 'museum': return <Building2 {...props} />;
    case 'park_garden': return <Trees {...props} />;
    case 'visitor_attraction': return <MapPin {...props} />;
    case 'family_rest': return <UsersRound {...props} />;
    case 'prayer_place': return <Building2 {...props} />;
  }
};

export const TourismPlaceMarker = memo(function TourismPlaceMarker({ category, selected = false }: { category: TourismPlaceCategory; selected?: boolean }) {
  const { colors } = useTheme();
  const tone = markerTone(category, colors);
  return <View style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}>
    <View style={[{ width: selected ? 42 : 36, height: selected ? 42 : 36, borderRadius: 12, borderWidth: selected ? 3 : 2, borderColor: selected ? colors.text : colors.surface, backgroundColor: tone, alignItems: 'center', justifyContent: 'center' }, selected ? shadow.md : shadow.sm]}>
      <Icon category={category} color={colors.surface} />
    </View>
  </View>;
});
