import { useEffect, useState } from 'react';
import { View } from 'react-native';
import {
  Accessibility,
  Navigation,
  Clock,
  Timer,
  Building2,
  CircleParking,
  Users,
  TriangleAlert,
  Info,
  Map,
} from 'lucide-react-native';

import { AppButton, AppText, BottomSheet, Divider, StatusBadge } from '@/components/ui';
import { availabilityTone } from '@/components/map/ZoneMarker';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/spacing';
import { radius } from '@/theme/radius';
import { useLocale } from '@/hooks/useLocale';
import { useReportZone } from '@/hooks/useCommunity';
import type { ParkingZone, ReportedAvailability } from '@/types';
import { formatRate } from '@/utils/money';
import { formatClockRange, formatDurationShort, isWithinOperatingHours } from '@/utils/time';
import { formatDistance } from '@/utils/geo';

export interface ZoneSheetProps {
  zone?: ParkingZone;
  visible: boolean;
  onClose: () => void;
  /** Metres from the user, when a location fix is available. */
  distanceMeters?: number;
  onNavigate: (zone: ParkingZone) => void;
  onStartParking: (zone: ParkingZone) => void;
  onReserve: (zone: ParkingZone) => void;
  onViewParkingMap: (zone: ParkingZone) => void;
  /** Disables the CTA when the zone cannot be parked in right now. */
  startDisabled?: boolean;
}

/** Compact fact tile used inside the sheet — three across, no wall of text. */
function Fact({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  const { colors } = useTheme();

  return (
    <View
      style={{
        flex: 1,
        gap: 6,
        padding: spacing.md,
        borderRadius: radius.md,
        backgroundColor: colors.surfaceAlt,
      }}
    >
      {icon}
      <AppText variant="caption" color="textTertiary" numberOfLines={1}>
        {label}
      </AppText>
      <AppText variant="title" numberOfLines={1} numeric>
        {value}
      </AppText>
    </View>
  );
}

export function ZoneSheet({
  zone,
  visible,
  onClose,
  distanceMeters,
  onNavigate,
  onStartParking,
  onReserve,
  onViewParkingMap,
  startDisabled = false,
}: ZoneSheetProps) {
  const { colors } = useTheme();
  const { t, row, dateLocale, locale } = useLocale();
  const reportZone = useReportZone();
  const [thanks, setThanks] = useState<'points' | 'counted' | undefined>();

  // Each zone starts with a fresh report prompt.
  useEffect(() => {
    setThanks(undefined);
    reportZone.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zone?.id]);

  if (!zone) {
    return <BottomSheet visible={false} onClose={onClose}>{null}</BottomSheet>;
  }

  const today = zone.operatingHours.find((h) => h.weekday === new Date().getDay());
  const isOpenNow = isWithinOperatingHours(zone.operatingHours);
  const isGarage = zone.kind === 'garage' || zone.kind === 'private';
  const name = locale === 'ar' ? zone.nameAr : zone.name;
  const city = locale === 'ar' ? zone.cityAr : zone.city;

  const availabilityLabel = t(`zone.${zone.availability}` as const);
  const ownershipLabel = zone.ownership
    ? t(`ramallahParking.ownership.${zone.ownership}` as const)
    : undefined;
  const restriction =
    locale === 'ar' ? zone.accessRestrictionAr ?? zone.accessRestriction : zone.accessRestriction;

  const sendReport = (availability: ReportedAvailability) =>
    reportZone.mutate(
      { zoneId: zone.id, availability },
      { onSuccess: (result) => setThanks(result.points ? 'points' : 'counted') },
    );

  return (
    <BottomSheet visible={visible} onClose={onClose} scrollable testID="zone-sheet">
      <View style={{ gap: spacing.lg }}>
        <View style={{ flexDirection: row, alignItems: 'flex-start', gap: spacing.md }}>
          <View
            style={{
              width: 46,
              height: 46,
              borderRadius: radius.md,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: isGarage ? colors.infoSoft : colors.brandSoft,
            }}
          >
            {isGarage ? (
              <Building2 size={22} color={colors.info} strokeWidth={2.2} />
            ) : (
              <CircleParking size={22} color={colors.brand} strokeWidth={2.2} />
            )}
          </View>

          <View style={{ flex: 1, gap: 4 }}>
            <AppText variant="h2" numberOfLines={2}>
              {name}
            </AppText>
            <AppText variant="bodySm" color="textSecondary">
              {[t(`zone.kind.${zone.kind}` as const), ownershipLabel, zone.code, city]
                .filter(Boolean)
                .join(' · ')}
            </AppText>
          </View>
        </View>

        <View style={{ flexDirection: row, alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' }}>
          <StatusBadge label={availabilityLabel} tone={availabilityTone(zone.availability)} />
          {isOpenNow ? (
            <StatusBadge label={t('zone.openNow')} tone="neutral" showDot={false} />
          ) : (
            <StatusBadge label={t('zone.closedNow')} tone="info" showDot={false} />
          )}
          {distanceMeters != null ? (
            <AppText variant="bodySm" color="textTertiary">
              {formatDistance(distanceMeters)} {t('common.away')}
            </AppText>
          ) : null}
        </View>

        {zone.crowd ? (
          <View style={{ flexDirection: row, alignItems: 'center', gap: spacing.sm }}>
            <Users size={14} color={colors.textTertiary} strokeWidth={2.2} />
            <AppText variant="caption" color="textSecondary" style={{ flex: 1 }}>
              {t('zone.crowdLine', {
                level: t(`zone.${zone.crowd.availability}` as const),
                minutes: zone.crowd.minutesSinceReport,
                count: zone.crowd.reportCount,
              })}
            </AppText>
          </View>
        ) : null}

        {restriction ? (
          <View
            style={{
              flexDirection: row,
              alignItems: 'flex-start',
              gap: spacing.sm,
              padding: spacing.sm,
              borderRadius: radius.md,
              backgroundColor: colors.warningSoft,
            }}
          >
            <TriangleAlert size={16} color={colors.warningText} strokeWidth={2.3} />
            <AppText variant="caption" color="warningText" style={{ flex: 1 }}>
              {restriction}
            </AppText>
          </View>
        ) : null}

        {zone.prototypeData ? (
          <View style={{ flexDirection: row, alignItems: 'center', gap: spacing.sm }}>
            <Info size={14} color={colors.textTertiary} strokeWidth={2.2} />
            <AppText variant="caption" color="textTertiary" style={{ flex: 1 }}>
              {t('zone.prototypeData')}
            </AppText>
          </View>
        ) : null}

        {/* Two tiles, not three: an hours range never fits a third of the width
            and was being truncated, so it gets its own full-width row below. */}
        <View style={{ gap: spacing.sm }}>
          <View style={{ flexDirection: row, gap: spacing.sm }}>
            <Fact
              icon={<CircleParking size={16} color={colors.textTertiary} strokeWidth={2.2} />}
              label={t('zone.rate')}
              value={`${formatRate(zone.tariff.hourlyRate)}${t('common.perHour')}`}
            />
            <Fact
              icon={<Timer size={16} color={colors.textTertiary} strokeWidth={2.2} />}
              label={t('zone.maxStay')}
              value={
                zone.tariff.maxStayMinutes
                  ? formatDurationShort(zone.tariff.maxStayMinutes * 60)
                  : '—'
              }
            />
          </View>

          <View
            style={{
              flexDirection: row,
              alignItems: 'center',
              gap: spacing.md,
              paddingVertical: spacing.md,
              paddingHorizontal: spacing.lg,
              borderRadius: radius.md,
              backgroundColor: colors.surfaceAlt,
            }}
          >
            <Clock size={16} color={colors.textTertiary} strokeWidth={2.2} />
            <AppText variant="caption" color="textTertiary" style={{ flex: 1 }}>
              {t('zone.operatingHours')}
            </AppText>
            <AppText variant="title" numeric>
              {today && !today.closed
                ? formatClockRange(today.opensAt, today.closesAt, dateLocale)
                : t('zone.closedNow')}
            </AppText>
          </View>

          {zone.accessibleSpots ? (
            <View
              style={{
                flexDirection: row,
                alignItems: 'center',
                gap: spacing.md,
                paddingVertical: spacing.md,
                paddingHorizontal: spacing.lg,
                borderRadius: radius.md,
                backgroundColor: colors.infoSoft,
              }}
            >
              <Accessibility size={16} color={colors.info} strokeWidth={2.2} />
              <AppText variant="caption" color="infoText" style={{ flex: 1 }}>
                {t('zone.accessibleShort')}
              </AppText>
              <AppText variant="title" numeric color="infoText">
                {zone.accessibleSpots}
              </AppText>
            </View>
          ) : null}
        </View>

        {/* One-tap driver report — feeds the crowd availability everyone sees. */}
        <View style={{ gap: spacing.sm }}>
          <AppText variant="label" color="textSecondary">
            {t('zone.reportPrompt')}
          </AppText>
          <View style={{ flexDirection: row, gap: spacing.sm }}>
            {(['available', 'limited', 'full'] as const).map((level) => (
              <AppButton
                key={level}
                label={t(`zone.report.${level}` as const)}
                variant="secondary"
                size="sm"
                style={{ flex: 1 }}
                loading={reportZone.isPending && reportZone.variables?.availability === level}
                disabled={reportZone.isPending}
                onPress={() => sendReport(level)}
              />
            ))}
          </View>
          {thanks ? (
            <AppText variant="caption" color="successText">
              {thanks === 'points'
                ? t('zone.reportThanksPoints', { points: 5 })
                : t('zone.reportThanks')}
            </AppText>
          ) : null}
          {reportZone.isError ? (
            <AppText variant="caption" color="warningText">
              {t('zone.reportFailed')}
            </AppText>
          ) : null}
        </View>

        <Divider />

        <AppButton
          label={t('parkingLayout.viewMap')}
          variant="secondary"
          icon={<Map size={18} color={colors.text} strokeWidth={2.2} />}
          onPress={() => onViewParkingMap(zone)}
          testID="zone-view-parking-map"
        />

        <AppButton
          label={t('reservation.reserveSpot')}
          variant="tonal"
          onPress={() => onReserve(zone)}
          disabled={startDisabled}
          testID="zone-reserve-spot"
        />

        <View style={{ flexDirection: row, gap: spacing.md }}>
          <AppButton
            label={t('zone.route')}
            variant="secondary"
            onPress={() => onNavigate(zone)}
            icon={<Navigation size={18} color={colors.text} strokeWidth={2.2} />}
            style={{ flex: 1 }}
          />
          <AppButton
            label={t('zone.startParking')}
            onPress={() => onStartParking(zone)}
            disabled={startDisabled || zone.availability === 'full'}
            style={{ flex: 1.35 }}
            testID="zone-start-parking"
          />
        </View>
      </View>
    </BottomSheet>
  );
}
