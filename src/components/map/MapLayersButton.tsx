import { Layers3 } from 'lucide-react-native';
import { View } from 'react-native';
import { AppText, IconButton } from '@/components/ui';
import { useLocale } from '@/hooks/useLocale';
import { useTheme } from '@/theme/ThemeProvider';
import { radius } from '@/theme/radius';

export function MapLayersButton({ enabledCount, onPress }: { enabledCount: number; onPress: () => void }) {
  const { colors } = useTheme();
  const { t } = useLocale();
  return (
    <View>
      <IconButton
        icon={<Layers3 size={19} color={colors.text} strokeWidth={2.3} />}
        onPress={onPress}
        accessibilityLabel={t('mapLayers.layers')}
        size={44}
      />
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: -3,
          right: -3,
          minWidth: 18,
          height: 18,
          paddingHorizontal: 4,
          borderRadius: radius.pill,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.brand,
          borderWidth: 2,
          borderColor: colors.surface,
        }}
      >
        <AppText variant="caption" numeric style={{ color: colors.onBrand, fontSize: 9 }}>
          {enabledCount}
        </AppText>
      </View>
    </View>
  );
}
