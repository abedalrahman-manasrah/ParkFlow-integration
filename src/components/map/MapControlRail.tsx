import type { ReactNode } from 'react';
import { Hash, LocateFixed, QrCode, ScanLine } from 'lucide-react-native';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { AppText, PressableScale, Reveal } from '@/components/ui';
import { useLocale } from '@/hooks/useLocale';
import { useTheme } from '@/theme/ThemeProvider';
import { radius } from '@/theme/radius';
import { shadow } from '@/theme/shadows';
import { spacing } from '@/theme/spacing';
import type { LocationStatus } from '@/hooks/useUserLocation';
import { RoadAlertButton } from './RoadAlertButton';
import { MapLayersButton } from './MapLayersButton';

interface MapControlRailProps {
  locationStatus: LocationStatus;
  locationMessage?: string;
  roadAlertCount: number;
  entryOpen: boolean;
  onLocate: () => void;
  onToggleEntry: () => void;
  onScanQr: () => void;
  onEnterCode: () => void;
  onOpenRoads: () => void;
  enabledLayerCount: number;
  onOpenLayers: () => void;
}

export function MapControlRail({
  locationStatus,
  locationMessage,
  roadAlertCount,
  entryOpen,
  onLocate,
  onToggleEntry,
  onScanQr,
  onEnterCode,
  onOpenRoads,
  enabledLayerCount,
  onOpenLayers,
}: MapControlRailProps) {
  const { colors } = useTheme();
  const { t, isRTL, row } = useLocale();
  const hasLocationProblem = locationStatus === 'denied' || locationStatus === 'unavailable';

  const action = (label: string, icon: ReactNode, onPress: () => void) => (
    <PressableScale
      onPress={onPress}
      haptic="light"
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{
        minHeight: 42,
        flexDirection: row,
        alignItems: 'center',
        gap: spacing.sm,
        paddingHorizontal: spacing.md,
      }}
    >
      {icon}
      <AppText variant="label" numberOfLines={1} style={{ flex: 1 }}>
        {label}
      </AppText>
    </PressableScale>
  );

  return (
    <View style={{ alignItems: isRTL ? 'flex-start' : 'flex-end', gap: spacing.sm }} pointerEvents="box-none">
      {locationMessage ? (
        <Reveal offset={8}>
          <View
            style={[
              {
                maxWidth: 210,
                paddingVertical: spacing.sm,
                paddingHorizontal: spacing.md,
                borderRadius: radius.md,
                backgroundColor: colors.surface,
              },
              shadow.sm,
            ]}
          >
            <AppText variant="caption" color="textSecondary">
              {locationMessage}
            </AppText>
          </View>
        </Reveal>
      ) : null}

      {entryOpen ? (
        <Reveal offset={8}>
          <View
            style={[
              {
                width: 164,
                overflow: 'hidden',
                borderRadius: radius.lg,
                backgroundColor: colors.surface,
              },
              shadow.md,
            ]}
          >
            {action(t('map.scanQr'), <QrCode size={17} color={colors.brand} strokeWidth={2.3} />, onScanQr)}
            <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.divider }} />
            {action(t('map.enterCode'), <Hash size={17} color={colors.brand} strokeWidth={2.3} />, onEnterCode)}
          </View>
        </Reveal>
      ) : null}

      <MapLayersButton enabledCount={enabledLayerCount} onPress={onOpenLayers} />

      <View
        style={[
          {
            width: 44,
            overflow: 'hidden',
            borderRadius: radius.pill,
            backgroundColor: colors.surface,
          },
          shadow.md,
        ]}
      >
        <PressableScale
          onPress={onLocate}
          disabled={locationStatus === 'requesting'}
          haptic="light"
          accessibilityRole="button"
          accessibilityLabel={t('map.recenter')}
          accessibilityState={{ disabled: locationStatus === 'requesting' }}
          style={{
            width: 44,
            height: 44,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: hasLocationProblem ? colors.dangerSoft : colors.surface,
          }}
        >
          {locationStatus === 'requesting' ? (
            <ActivityIndicator size="small" color={colors.brand} />
          ) : (
            <LocateFixed
              size={19}
              color={hasLocationProblem ? colors.dangerText : colors.text}
              strokeWidth={2.3}
            />
          )}
        </PressableScale>
        <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.divider }} />
        <PressableScale
          onPress={onToggleEntry}
          haptic="light"
          accessibilityRole="button"
          accessibilityLabel={t('map.parkingEntry')}
          accessibilityState={{ expanded: entryOpen }}
          style={{
            width: 44,
            height: 44,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: entryOpen ? colors.brandSoft : colors.surface,
          }}
        >
          <ScanLine size={19} color={entryOpen ? colors.brand : colors.text} strokeWidth={2.3} />
        </PressableScale>
        {roadAlertCount > 0 ? (
          <>
            <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.divider }} />
            <RoadAlertButton count={roadAlertCount} onPress={onOpenRoads} />
          </>
        ) : null}
      </View>
    </View>
  );
}
