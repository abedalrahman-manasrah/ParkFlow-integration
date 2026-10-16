import { ChevronDown, ChevronUp, Navigation, ShieldCheck, TriangleAlert, X } from 'lucide-react-native';
import { ScrollView, View } from 'react-native';

import { AppButton, AppText, IconButton, PressableScale } from '@/components/ui';
import { useLocale } from '@/hooks/useLocale';
import { useTheme } from '@/theme/ThemeProvider';
import { radius } from '@/theme/radius';
import { shadow } from '@/theme/shadows';
import { spacing } from '@/theme/spacing';
import type { RouteDestination, RouteClosure, RouteResult } from '@/types';
import { formatDistance } from '@/utils/geo';
import type { RouteImpact, ScoredRouteCandidate } from '@/utils/routeImpact';

function RouteDetails({ route }: { route: RouteResult }) {
  const { colors } = useTheme();
  const { t, locale, row, alignStart } = useLocale();
  const nameOf = (closure: RouteClosure) => (locale === 'ar' ? closure.nameAr : closure.nameEn);
  const statusOf = (closure: RouteClosure) => t(`roads.status.${closure.status}` as const);
  const delayMinutes = route.trafficSummary?.delaySeconds
    ? Math.max(1, Math.round(route.trafficSummary.delaySeconds / 60))
    : undefined;
  const avoided = [
    ...new Map(
      route.rejected.flatMap((item) =>
        item.blockedBy ? [[item.blockedBy.checkpointId, item.blockedBy] as const] : [],
      ),
    ).values(),
  ].filter((closure) =>
    !route.closuresOnRoute.some((onRoute) => onRoute.checkpointId === closure.checkpointId),
  );
  const lines: { key: string; safe: boolean; text: string }[] = [];
  if (route.source === 'straight-line') lines.push({ key: 'approximate', safe: false, text: t('route.approximate') });
  route.closuresOnRoute.forEach((closure) =>
    lines.push({ key: `on-${closure.checkpointId}`, safe: false, text: t('route.passes', { name: nameOf(closure), status: statusOf(closure) }) }),
  );
  avoided.forEach((closure) =>
    lines.push({ key: `avoid-${closure.checkpointId}`, safe: true, text: t('route.avoids', { name: nameOf(closure), status: statusOf(closure) }) }),
  );
  if (lines.length === 0) lines.push({ key: 'clear', safe: true, text: t('route.clear') });

  return (
    <View style={{ gap: spacing.xs, paddingHorizontal: spacing.sm }}>
      {route.trafficSummary ? (
        <View style={{ flexDirection: row, alignItems: 'center', gap: spacing.sm }}>
          <TriangleAlert size={15} color={colors.info} strokeWidth={2.2} />
          <View style={{ flex: 1 }}>
            <AppText variant="caption" color="infoText">
              {t(`route.traffic.${route.trafficSummary.level}` as const)}
            </AppText>
            {delayMinutes ? (
              <AppText variant="caption" color="textSecondary">
                {t('route.trafficDelay', { minutes: delayMinutes })}
              </AppText>
            ) : null}
          </View>
        </View>
      ) : null}
      {lines.map((line) => (
        <View key={line.key} style={{ flexDirection: row, alignItems: 'center', gap: spacing.sm }}>
          {line.safe ? (
            <ShieldCheck size={15} color={colors.success} strokeWidth={2.2} />
          ) : (
            <TriangleAlert size={15} color={colors.warning} strokeWidth={2.2} />
          )}
          <AppText variant="caption" color={line.safe ? 'successText' : 'warningText'} style={{ flex: 1 }}>
            {line.text}
          </AppText>
        </View>
      ))}
    </View>
  );
}

interface RouteNeedsComparison {
  mode: 'needs' | 'shortest';
  needAware: RouteResult;
  shortest: RouteResult;
  extraDurationSeconds: number;
  extraDistanceMeters: number;
  extraPercent: number;
  significant: boolean;
}

const routeMinutes = (seconds: number) => Math.max(1, Math.round(seconds / 60));
const extraDurationLabel = (seconds: number, locale: 'ar' | 'en') => {
  if (seconds <= 0) return locale === 'ar' ? '+0 د' : '+0 min';
  if (seconds < 60) return locale === 'ar' ? '+أقل من دقيقة' : '+<1 min';
  return locale === 'ar'
    ? `+${Math.round(seconds / 60)} د`
    : `+${Math.round(seconds / 60)} min`;
};

interface CompactRoutePanelProps {
  destination: RouteDestination;
  route?: RouteResult;
  loading: boolean;
  needsNotice?: string;
  routeNeedsComparison?: RouteNeedsComparison;
  detailsExpanded: boolean;
  onDetailsExpandedChange: (expanded: boolean) => void;
  onClose: () => void;
  onOpenMaps: () => void;
  onStartParking?: () => void;
  onOpenDestination?: () => void;
  startDisabled?: boolean;
  impacts?: RouteImpact[];
  suggestedAlternative?: ScoredRouteCandidate;
  originalDurationSeconds?: number;
  usingAlternative?: boolean;
  alternativeDismissed?: boolean;
  onSelectImpact?: (impact: RouteImpact) => void;
  onKeepCurrent?: () => void;
  onUseAlternative?: () => void;
  onUseOriginal?: () => void;
  onShowShortestRoute?: () => void;
  onShowNeedAwareRoute?: () => void;
  showNoAlternative?: boolean;
}

export function CompactRoutePanel({
  destination,
  route,
  loading,
  needsNotice,
  routeNeedsComparison,
  detailsExpanded,
  onDetailsExpandedChange,
  onClose,
  onOpenMaps,
  onStartParking,
  onOpenDestination,
  startDisabled = false,
  impacts = [],
  suggestedAlternative,
  originalDurationSeconds,
  usingAlternative = false,
  alternativeDismissed = false,
  onSelectImpact,
  onKeepCurrent,
  onUseAlternative,
  onUseOriginal,
  onShowShortestRoute,
  onShowNeedAwareRoute,
  showNoAlternative = false,
}: CompactRoutePanelProps) {
  const { colors } = useTheme();
  const { t, locale, row, alignStart } = useLocale();
  const name = locale === 'ar' && destination.type !== 'ev_station' ? destination.nameAr ?? destination.name : destination.name;
  const Chevron = detailsExpanded ? ChevronDown : ChevronUp;
  const primaryImpact = impacts[0];
  const issueName = primaryImpact ? t(`roadReports.type.${primaryImpact.report.type}`) : '';
  const issueText = primaryImpact
    ? primaryImpact.distanceAheadMeters === undefined
      ? t('route.issueOnRoute', { type: issueName })
      : t('route.issueAhead', { type: issueName, distance: formatDistance(primaryImpact.distanceAheadMeters) })
    : '';
  const destinationActionLabel =
    destination.type === 'parking'
      ? t('zone.startParking')
      : destination.type === 'ev_station'
        ? t('ev.details')
        : destination.type === 'car_service'
          ? t('carServices.details')
          : t('tourism.details');
  const durationDeltaMinutes = suggestedAlternative && originalDurationSeconds !== undefined
    ? Math.round((suggestedAlternative.durationSeconds - originalDurationSeconds) / 60)
    : 0;
  const needAwareSummary = routeNeedsComparison
    ? t('route.summary', {
        minutes: routeMinutes(routeNeedsComparison.needAware.durationSeconds),
        distance: formatDistance(routeNeedsComparison.needAware.distanceMeters),
      })
    : '';
  const shortestSummary = routeNeedsComparison
    ? t('route.summary', {
        minutes: routeMinutes(routeNeedsComparison.shortest.durationSeconds),
        distance: formatDistance(routeNeedsComparison.shortest.distanceMeters),
      })
    : '';
  const differenceSummary = routeNeedsComparison
    ? `${extraDurationLabel(routeNeedsComparison.extraDurationSeconds, locale)} · +${formatDistance(routeNeedsComparison.extraDistanceMeters)} · +${routeNeedsComparison.extraPercent}%`
    : '';

  return (
    <View
      testID="compact-route-panel"
      style={[
        { gap: spacing.sm, padding: spacing.md, borderRadius: radius.xxl, backgroundColor: colors.surface },
        shadow.md,
      ]}
    >
      <View style={{ flexDirection: row, alignItems: 'center', gap: spacing.sm }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <AppText variant="caption" color="textTertiary">{t('route.destination')}</AppText>
          <AppText variant="title" numberOfLines={1}>{name}</AppText>
        </View>
        {route ? (
          <AppText variant="title" color="brand" numeric>
            {t('route.summary', { minutes: Math.max(1, Math.round(route.durationSeconds / 60)), distance: formatDistance(route.distanceMeters) })}
          </AppText>
        ) : loading ? (
          <AppText variant="caption" color="textSecondary">{t('route.loading')}</AppText>
        ) : null}
        <IconButton
          icon={<X size={16} color={colors.textSecondary} strokeWidth={2.3} />}
          onPress={onClose}
          accessibilityLabel={t('route.close')}
          tone="ghost"
          size={32}
        />
      </View>

      {primaryImpact ? (
        <PressableScale
          onPress={() => onSelectImpact?.(primaryImpact)}
          accessibilityRole="button"
          style={{ flexDirection: row, alignItems: 'center', gap: spacing.sm, padding: spacing.sm, borderRadius: radius.md, backgroundColor: colors.warningSoft }}
        >
          <TriangleAlert size={17} color={colors.warningText} strokeWidth={2.3} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <AppText variant="caption" color="warningText" weight="bold">{issueText}</AppText>
            <AppText variant="caption" color="warningText">
              {impacts.length > 1 ? t('route.issueCount', { count: impacts.length }) : null}
              {primaryImpact.report.status === 'unverified' ? `${impacts.length > 1 ? ' · ' : ''}${t('route.unverified')}` : null}
            </AppText>
          </View>
        </PressableScale>
      ) : null}

      {needsNotice ? (
        <View style={{ padding: spacing.sm, borderRadius: radius.md, backgroundColor: colors.warningSoft }}>
          <AppText variant="caption" color="warningText">{needsNotice}</AppText>
        </View>
      ) : null}

      {routeNeedsComparison ? (
        <View style={{ gap: spacing.sm }}>
          {routeNeedsComparison.significant && routeNeedsComparison.mode === 'needs' ? (
            <View style={{ gap: spacing.sm, padding: spacing.sm, borderRadius: radius.md, backgroundColor: colors.dangerSoft }}>
              <View style={{ flexDirection: row, alignItems: 'flex-start', gap: spacing.sm }}>
                <TriangleAlert size={17} color={colors.dangerText} strokeWidth={2.3} />
                <AppText variant="caption" color="dangerText" weight="bold" style={{ flex: 1 }}>
                  {t('route.needAwareLongWarning', {
                    minutes: Math.max(1, Math.round(routeNeedsComparison.extraDurationSeconds / 60)),
                    distance: formatDistance(routeNeedsComparison.extraDistanceMeters),
                  })}
                </AppText>
              </View>
              <AppButton
                label={t('route.showShortestRoute')}
                onPress={onShowShortestRoute}
                variant="danger"
                size="sm"
              />
            </View>
          ) : null}

          <View style={{ gap: spacing.xs, padding: spacing.sm, borderRadius: radius.md, backgroundColor: colors.surfaceAlt }}>
            <View style={{ flexDirection: row, gap: spacing.sm, justifyContent: 'space-between' }}>
              <AppText variant="caption" color="textSecondary" style={{ flex: 1 }}>{t('route.needAwareLabel')}</AppText>
              <AppText variant="caption" color="text" numeric>{needAwareSummary}</AppText>
            </View>
            <View style={{ flexDirection: row, gap: spacing.sm, justifyContent: 'space-between' }}>
              <AppText variant="caption" color="textSecondary" style={{ flex: 1 }}>{t('route.shortestLabel')}</AppText>
              <AppText variant="caption" color="text" numeric>{shortestSummary}</AppText>
            </View>
            <View style={{ flexDirection: row, gap: spacing.sm, justifyContent: 'space-between' }}>
              <AppText variant="caption" color={routeNeedsComparison.significant ? 'dangerText' : 'textSecondary'} style={{ flex: 1 }}>
                {t('route.differenceLabel')}
              </AppText>
              <AppText variant="caption" color={routeNeedsComparison.significant ? 'dangerText' : 'textSecondary'} numeric>
                {differenceSummary}
              </AppText>
            </View>
            {routeNeedsComparison.mode === 'shortest' ? (
              <AppButton
                label={t('route.showNeedAwareRoute')}
                onPress={onShowNeedAwareRoute}
                variant="tonal"
                size="sm"
              />
            ) : !routeNeedsComparison.significant ? (
              <AppButton
                label={t('route.showShortestRoute')}
                onPress={onShowShortestRoute}
                variant="secondary"
                size="sm"
              />
            ) : null}
          </View>
        </View>
      ) : null}

      {usingAlternative ? (
        <View style={{ gap: spacing.sm, padding: spacing.sm, borderRadius: radius.md, backgroundColor: colors.successSoft }}>
          <AppText variant="caption" color="successText" weight="bold">{t('route.usingAlternative')}</AppText>
          <AppButton label={t('route.useOriginal')} onPress={onUseOriginal} variant="tonal" size="sm" />
        </View>
      ) : suggestedAlternative && !alternativeDismissed ? (
        <View style={{ gap: spacing.sm, padding: spacing.sm, borderRadius: radius.md, backgroundColor: colors.infoSoft }}>
          <AppText variant="caption" color="infoText" weight="bold">
            {durationDeltaMinutes > 0
              ? t('route.alternativeAdds', { minutes: durationDeltaMinutes })
              : t('route.alternativeSaves', { minutes: Math.abs(durationDeltaMinutes) })}
          </AppText>
          <View style={{ flexDirection: row, gap: spacing.sm }}>
            <AppButton label={t('route.keepCurrent')} onPress={onKeepCurrent} variant="secondary" size="sm" style={{ flex: 1 }} />
            <AppButton label={t('route.useAlternative')} onPress={onUseAlternative} size="sm" style={{ flex: 1 }} />
          </View>
        </View>
      ) : showNoAlternative && !alternativeDismissed ? (
        <AppText variant="caption" color="textSecondary">{t('route.noSaferAlternative')}</AppText>
      ) : null}

      {route ? (
        <>
          <PressableScale
            onPress={() => onDetailsExpandedChange(!detailsExpanded)}
            accessibilityRole="button"
            accessibilityLabel={detailsExpanded ? t('route.hideDetails') : t('route.details')}
            accessibilityState={{ expanded: detailsExpanded }}
            style={{ flexDirection: row, alignItems: 'center', gap: spacing.xs, alignSelf: alignStart }}
          >
            <AppText variant="caption" color="textSecondary">
              {detailsExpanded ? t('route.hideDetails') : t('route.details')}
            </AppText>
            <Chevron size={14} color={colors.textSecondary} strokeWidth={2.3} />
          </PressableScale>
          {detailsExpanded ? (
            <ScrollView style={{ maxHeight: 108 }} showsVerticalScrollIndicator={false} nestedScrollEnabled>
              <RouteDetails route={route} />
            </ScrollView>
          ) : null}
        </>
      ) : null}

      <View style={{ flexDirection: row, gap: spacing.sm }}>
        <AppButton
          label={t('route.openMaps')}
          variant="secondary"
          size="sm"
          style={{ flex: 1 }}
          onPress={onOpenMaps}
          icon={<Navigation size={15} color={colors.text} strokeWidth={2.2} />}
        />
        {destination.type === 'place' ? null : (
          <AppButton
            label={destinationActionLabel}
            size="sm"
            style={{ flex: 1 }}
            onPress={destination.type === 'parking' ? onStartParking : onOpenDestination}
            disabled={destination.type === 'parking' && (startDisabled || destination.zone.availability === 'full')}
          />
        )}
      </View>
    </View>
  );
}
