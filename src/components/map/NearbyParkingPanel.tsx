import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { ChevronDown, ChevronUp } from 'lucide-react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';

import { AppButton, AppText, PressableScale, SkeletonGroup } from '@/components/ui';
import { useLocale } from '@/hooks/useLocale';
import { useTheme } from '@/theme/ThemeProvider';
import { radius } from '@/theme/radius';
import { shadow } from '@/theme/shadows';
import { spacing } from '@/theme/spacing';
import { CompactZoneCard, type NearbyZone } from './CompactZoneCard';

interface NearbyParkingPanelProps {
  zones: NearbyZone[];
  /** First fetch still in flight — zones is '[]' either way, so this is the
   * only thing that tells "still loading" apart from "genuinely none nearby". */
  loading?: boolean;
  /** The zones request failed outright, rather than just returning none. */
  error?: boolean;
  onRetry?: () => void;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  onSelectZone: (item: NearbyZone) => void;
}

/** Height the list may take in the partially expanded state. */
const PARTIAL_LIST_HEIGHT = 200;

/**
 * Three visible states: collapsed (header + nearest zone), partially expanded
 * (a short scrollable list) and full (half the screen). Tap the header or swipe
 * to move between them; the map state only tracks collapsed vs expanded.
 */
export function NearbyParkingPanel({
  zones,
  loading = false,
  error = false,
  onRetry,
  expanded,
  onExpandedChange,
  onSelectZone,
}: NearbyParkingPanelProps) {
  const { colors } = useTheme();
  const { t, row } = useLocale();
  const { height: windowHeight } = useWindowDimensions();
  const [full, setFull] = useState(false);
  const Chevron = expanded ? ChevronDown : ChevronUp;

  // Collapsing the panel always lands back in the partial state next time.
  useEffect(() => {
    if (!expanded) setFull(false);
  }, [expanded]);

  const swipe = useMemo(
    () =>
      Gesture.Pan().onEnd((event) => {
        if (event.translationY < -24) {
          if (expanded) runOnJS(setFull)(true);
          else runOnJS(onExpandedChange)(true);
        }
        if (event.translationY > 24) {
          if (full) runOnJS(setFull)(false);
          else if (expanded) runOnJS(onExpandedChange)(false);
        }
      }),
    [expanded, full, onExpandedChange],
  );

  return (
    <View
      testID="nearby-parking-panel"
      style={[
        {
          marginHorizontal: spacing.md,
          marginBottom: spacing.lg,
          paddingBottom: spacing.md,
          borderRadius: radius.xl,
          overflow: 'hidden',
          backgroundColor: colors.surface,
          borderWidth: StyleSheet.hairlineWidth * 2,
          borderColor: colors.border,
        },
        shadow.sm,
      ]}
    >
      <GestureDetector gesture={swipe}>
        <View>
          <View style={{ alignItems: 'center', paddingTop: spacing.sm }}>
            <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: colors.borderStrong }} />
          </View>

          <PressableScale
            onPress={() => onExpandedChange(!expanded)}
            dimTo={0.85}
            accessibilityRole="button"
            accessibilityLabel={expanded ? t('map.collapseNearby') : t('map.expandNearby')}
            accessibilityState={{ expanded }}
            style={{
              flexDirection: row,
              alignItems: 'center',
              gap: spacing.md,
              paddingTop: spacing.md,
              paddingBottom: spacing.md,
              paddingHorizontal: spacing.lg,
            }}
          >
            <View style={{ flex: 1, gap: 2 }}>
              <AppText variant="titleLg">{t('map.nearby')}</AppText>
              <AppText variant="caption" color="textTertiary" numeric>
                {loading ? t('common.loading') : t('map.zonesFound', { count: zones.length })}
              </AppText>
            </View>
            <Chevron size={16} color={colors.textTertiary} strokeWidth={2.2} />
          </PressableScale>
        </View>
      </GestureDetector>

      <View style={{ paddingHorizontal: spacing.md }}>
        {loading ? (
          <SkeletonGroup count={expanded ? 3 : 1} height={58} style={{ paddingVertical: spacing.xs }} />
        ) : error ? (
          <View style={{ paddingHorizontal: spacing.md, paddingVertical: spacing.md, gap: spacing.sm, alignItems: 'flex-start' }}>
            <AppText variant="title">{t('map.zonesFailed')}</AppText>
            <AppText variant="caption" color="textSecondary">
              {t('map.zonesFailedBody')}
            </AppText>
            {onRetry ? (
              <AppButton label={t('common.retry')} size="sm" fullWidth={false} variant="secondary" onPress={onRetry} />
            ) : null}
          </View>
        ) : zones.length === 0 ? (
          <View style={{ paddingHorizontal: spacing.md, paddingVertical: spacing.md, gap: spacing.xs }}>
            <AppText variant="title">{t('map.noZones')}</AppText>
            <AppText variant="caption" color="textSecondary">
              {t('map.noZonesBody')}
            </AppText>
          </View>
        ) : expanded ? (
          <ScrollView
            style={{ maxHeight: full ? windowHeight * 0.5 : PARTIAL_LIST_HEIGHT }}
            contentContainerStyle={{ gap: spacing.sm }}
            showsVerticalScrollIndicator={false}
            nestedScrollEnabled
          >
            {zones.map((item) => (
              <CompactZoneCard key={item.zone.id} item={item} onPress={() => onSelectZone(item)} />
            ))}
          </ScrollView>
        ) : (
          <CompactZoneCard item={zones[0]!} onPress={() => onSelectZone(zones[0]!)} />
        )}
      </View>
    </View>
  );
}
