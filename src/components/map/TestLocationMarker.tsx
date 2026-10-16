import { Crosshair } from 'lucide-react-native';
import { View } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { shadow } from '@/theme/shadows';

/** Distinct marker used only by the removable development test-location tool. */
export function TestLocationMarker() {
  const { colors } = useTheme();

  return (
    <View
      style={[
        {
          width: 34,
          height: 34,
          borderRadius: 17,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.danger,
          borderWidth: 3,
          borderColor: colors.surface,
        },
        shadow.md,
      ]}
    >
      <Crosshair size={18} color={colors.textOnColor} strokeWidth={2.5} />
    </View>
  );
}
