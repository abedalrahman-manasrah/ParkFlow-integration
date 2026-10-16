import { Crosshair, X } from 'lucide-react-native';
import { View } from 'react-native';

import { AppText, PressableScale } from '@/components/ui';
import { useLocale } from '@/hooks/useLocale';
import { useTheme } from '@/theme/ThemeProvider';
import { radius } from '@/theme/radius';
import { shadow } from '@/theme/shadows';
import { spacing } from '@/theme/spacing';

interface TestLocationControlProps {
  enabled: boolean;
  hasLocation: boolean;
  onToggle: () => void;
}

/**
 * Development-only control. Keeping it isolated makes deleting the entire test
 * location feature a small, explicit change before release.
 */
export function TestLocationControl({ enabled, hasLocation, onToggle }: TestLocationControlProps) {
  const { colors } = useTheme();
  const { t, row } = useLocale();

  return (
    <PressableScale
      testID="test-location-toggle"
      onPress={onToggle}
      haptic="light"
      accessibilityRole="switch"
      accessibilityState={{ checked: enabled }}
      accessibilityLabel={t('ramallahParking.testLocation')}
      style={[
        {
          flexDirection: row,
          alignItems: 'center',
          gap: spacing.xs,
          minHeight: 34,
          maxWidth: 190,
          paddingHorizontal: spacing.md,
          borderRadius: radius.pill,
          backgroundColor: enabled ? colors.danger : colors.surface,
          borderWidth: 1,
          borderColor: enabled ? colors.danger : colors.border,
        },
        shadow.sm,
      ]}
    >
      {enabled ? (
        <X size={14} color={colors.textOnColor} strokeWidth={2.5} />
      ) : (
        <Crosshair size={14} color={colors.dangerText} strokeWidth={2.5} />
      )}
      <AppText
        variant="caption"
        numberOfLines={1}
        style={{ color: enabled ? colors.textOnColor : colors.dangerText }}
      >
        {enabled
          ? hasLocation
            ? t('ramallahParking.testLocationMove')
            : t('ramallahParking.testLocationTap')
          : t('ramallahParking.testLocation')}
      </AppText>
    </PressableScale>
  );
}
