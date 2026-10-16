import { View } from 'react-native';
import { MapPin } from 'lucide-react-native';
import { AppText } from '@/components/ui/AppText';
import { useTheme } from '@/theme/ThemeProvider';
import { radius } from '@/theme/radius';
import { shadow } from '@/theme/shadows';

/** The place a landmark search resolved to — "قرب دوار المنارة" pins Al-Manara. */
export function LandmarkMarker({ name }: { name: string }) {
  const { colors } = useTheme();

  return (
    <View
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 4,
          paddingVertical: 5,
          paddingHorizontal: 10,
          borderRadius: radius.pill,
          backgroundColor: colors.info,
        },
        shadow.md,
      ]}
    >
      <MapPin size={14} color={colors.textOnColor} strokeWidth={2.4} />
      <AppText variant="caption" numberOfLines={1} style={{ color: colors.textOnColor, maxWidth: 160 }}>
        {name}
      </AppText>
    </View>
  );
}
