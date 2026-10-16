import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Clock, MapPin, X } from 'lucide-react-native';

import {
  AppButton,
  AppText,
  BottomSheet,
  Card,
  DetailRow,
  Divider,
  ErrorState,
  IconButton,
  InlineNotice,
  MoneyText,
  PressableScale,
  Screen,
  Skeleton,
} from '@/components/ui';
import { PlateBadge } from '@/components/domain/PlateBadge';
import { TimerRing } from '@/components/domain/TimerRing';

import { useTheme } from '@/theme/ThemeProvider';
import { spacing, screenPadding } from '@/theme/spacing';
import { radius } from '@/theme/radius';
import { shadow } from '@/theme/shadows';
import { useLocale } from '@/hooks/useLocale';
import {
  useExtendParking,
  useSessionBreakdown,
  useSessionById,
  useStopParking,
  useZone,
} from '@/hooks/useParking';
import { useVehicle } from '@/hooks/useVehicles';
import { useWallet } from '@/hooks/useWallet';
import { PREPAID_DURATION_OPTIONS, estimatePrepaidCost } from '@/utils/pricing';
import { formatDuration, formatDurationShort, formatTime, secondsBetween } from '@/utils/time';
import { formatMoney, formatRate } from '@/utils/money';
import { errorMessage } from '@/utils/errors';
import { haptics } from '@/utils/haptics';
import { speak } from '@/utils/voice';
import { usePreferencesStore } from '@/store/preferencesStore';

export default function ActiveParkingScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { t, row, dateLocale, locale } = useLocale();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data: session, isPending, isError, error, refetch } = useSessionById(id);
  const { data: vehicle } = useVehicle(session?.vehicleId);
  const { data: zone } = useZone(session?.parkingZoneId);
  const { data: wallet } = useWallet();
  const breakdown = useSessionBreakdown(session);

  const stopParking = useStopParking();
  const extendParking = useExtendParking();

  const [confirmStopOpen, setConfirmStopOpen] = useState(false);
  const [extendOpen, setExtendOpen] = useState(false);
  const [extendMinutes, setExtendMinutes] = useState(60);

  // A session that ended elsewhere (or was already stopped) belongs on the
  // receipt, not on a live timer.
  useEffect(() => {
    if (session && session.status !== 'ACTIVE') {
      router.replace(`/parking/receipt/${session.id}`);
    }
  }, [session, router]);

  // Spoken alerts fire once per session, and only when the user opted in.
  const voiceAlerts = usePreferencesStore((s) => s.voiceAlerts);
  const alerted = useRef({ tenMinutes: false, overstay: false });
  useEffect(() => {
    if (!voiceAlerts || !session || session.status !== 'ACTIVE' || !breakdown) return;
    if (breakdown.isOverstay && !alerted.current.overstay) {
      alerted.current.overstay = true;
      speak(t('voice.overstay'), locale);
      return;
    }
    const remaining = breakdown.remainingSeconds;
    if (
      session.parkingMode === 'prepaid' &&
      remaining !== undefined &&
      remaining > 0 &&
      remaining <= 600 &&
      !alerted.current.tenMinutes
    ) {
      alerted.current.tenMinutes = true;
      speak(t('voice.tenMinutes'), locale);
    }
  }, [voiceAlerts, session, breakdown, t, locale]);

  if (isError) {
    return (
      <Screen>
        <ErrorState error={error} onRetry={() => void refetch()} />
      </Screen>
    );
  }

  if (isPending || !session || !breakdown) {
    return (
      <Screen tone="deep">
        <View style={{ gap: spacing.xl, paddingTop: spacing.xxxl }}>
          <Skeleton height={40} width="50%" radiusToken="md" />
          <Skeleton height={90} radiusToken="lg" />
          <Skeleton height={220} radiusToken="xl" />
        </View>
      </Screen>
    );
  }

  const isPrepaid = session.parkingMode === 'prepaid';
  const isOverstay = breakdown.isOverstay;
  const cost = breakdown.cost;
  const balanceAfter = (wallet?.balance ?? 0) - (isPrepaid ? 0 : cost);

  const primarySeconds = isPrepaid ? (breakdown.remainingSeconds ?? 0) : breakdown.elapsedSeconds;
  const primaryLabel = isPrepaid ? t('parking.timeRemaining') : t('parking.active');

  /**
   * How full the ring is. Prepaid measures against the time bought; start/stop
   * measures against the zone's maximum stay. A zone with neither has no
   * meaningful denominator, so the ring stays empty rather than inventing one.
   */
  const ringProgress = (() => {
    if (isPrepaid && session.endsAt) {
      const total = secondsBetween(session.startedAt, session.endsAt);
      return total > 0 ? (total - primarySeconds) / total : 1;
    }
    const maxStay = session.rateSnapshot.maxStayMinutes;
    if (maxStay) return breakdown.elapsedSeconds / (maxStay * 60);
    return undefined;
  })();

  const handleStop = () => {
    stopParking.mutate(session.id, {
      onSuccess: (stopped) => {
        haptics.success();
        setConfirmStopOpen(false);
        router.replace(`/parking/receipt/${stopped.id}`);
      },
      onError: () => haptics.error(),
    });
  };

  const handleExtend = () => {
    extendParking.mutate(
      { sessionId: session.id, minutes: extendMinutes },
      {
        onSuccess: () => {
          haptics.success();
          setExtendOpen(false);
        },
        onError: () => haptics.error(),
      },
    );
  };

  const accent = colors.onDeep;

  return (
    <View style={{ flex: 1, backgroundColor: colors.deep }}>
      <StatusBar style="light" />

      <LinearGradient
        colors={isOverstay ? [colors.deepAlt, colors.dangerDeep] : [colors.deepAlt, colors.deep]}
        style={{ flex: 1 }}
      >
        <View
          style={{
            flex: 1,
            paddingTop: insets.top + spacing.sm,
            paddingBottom: insets.bottom + spacing.lg,
            paddingHorizontal: screenPadding,
          }}
        >
          <View style={{ flexDirection: row, alignItems: 'center', gap: spacing.md }}>
            <IconButton
              icon={<X size={20} color={colors.onDeep} strokeWidth={2.4} />}
              tone="glass"
              size={40}
              onPress={() => router.replace('/(tabs)/map')}
              accessibilityLabel={t('common.close')}
            />
            <View style={{ flex: 1 }} />
            <View
              style={{
                flexDirection: row,
                alignItems: 'center',
                gap: spacing.sm,
                paddingVertical: 6,
                paddingHorizontal: spacing.md,
                borderRadius: radius.pill,
                backgroundColor: 'rgba(255,255,255,0.1)',
              }}
            >
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: accent }} />
              <AppText variant="label" style={{ color: accent }}>
                {isOverstay ? t('parking.overstay') : t('parking.activeShort')}
              </AppText>
            </View>
          </View>

          {/* ---- Timer -------------------------------------------------- */}
          <View style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.xxl }}>
            <TimerRing progress={ringProgress} overstay={isOverstay} size={272}>
              <AppText variant="overline" style={{ color: colors.onDeepMuted }}>
                {primaryLabel}
              </AppText>

              <AppText
                variant="displayXl"
                numeric
                align="center"
                style={{ color: colors.onDeep, marginTop: spacing.xs }}
                accessibilityLabel={`${primaryLabel} ${formatDurationShort(primarySeconds)}`}
              >
                {formatDuration(primarySeconds)}
              </AppText>

              <View
                style={{
                  flexDirection: row,
                  alignItems: 'baseline',
                  gap: spacing.sm,
                  marginTop: spacing.sm,
                }}
              >
                <AppText variant="bodySm" style={{ color: colors.onDeepMuted }}>
                  {isPrepaid ? t('parking.total') : t('parking.currentCost')}
                </AppText>
                <MoneyText value={cost} variant="h3" style={{ color: accent }} />
              </View>
            </TimerRing>
          </View>

          {isOverstay ? (
            <InlineNotice
              tone="danger"
              title={t('parking.overstay')}
              body={t('parking.overstayBody')}
              style={{ marginBottom: spacing.lg }}
            />
          ) : null}

          {/* ---- Details ------------------------------------------------ */}
          <Card
            padding="lg"
            style={{ gap: spacing.md, backgroundColor: 'rgba(255,255,255,0.07)' }}
            tone="plain"
          >
            <View style={{ flexDirection: row, alignItems: 'center', gap: spacing.md }}>
              <View
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: radius.md,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: 'rgba(255,255,255,0.1)',
                }}
              >
                <MapPin size={18} color={accent} strokeWidth={2.2} />
              </View>
              <View style={{ flex: 1, gap: 3 }}>
                <AppText variant="titleLg" color="onDeep" numberOfLines={1}>
                  {locale === 'ar'
                    ? session.pricingRulesSnapshot.zoneNameAr
                    : session.pricingRulesSnapshot.zoneName}
                </AppText>
                <AppText variant="bodySm" color="onDeepMuted">
                  {session.pricingRulesSnapshot.zoneCode}
                </AppText>
              </View>
              {vehicle ? <PlateBadge plateNumber={vehicle.plateNumber} size="sm" tone="onDeep" /> : null}
            </View>

            <Divider style={{ backgroundColor: 'rgba(255,255,255,0.12)' }} />

            <DetailRow label={t('parking.vehicle')}>
              <AppText variant="title" color="onDeep">
                {vehicle?.displayName ?? '—'}
              </AppText>
            </DetailRow>
            <DetailRow label={t('parking.started')}>
              <AppText variant="title" color="onDeep" numeric>
                {formatTime(session.startedAt, dateLocale)}
              </AppText>
            </DetailRow>
            <DetailRow label={t('zone.rate')}>
              <AppText variant="title" color="onDeep" numeric>
                {formatRate(session.rateSnapshot.hourlyRate)} {t('common.perHour')}
              </AppText>
            </DetailRow>
            {isPrepaid && session.endsAt ? (
              <DetailRow label={t('parking.expiresAt')}>
                <AppText variant="title" color="onDeep" numeric>
                  {formatTime(session.endsAt, dateLocale)}
                </AppText>
              </DetailRow>
            ) : (
              <DetailRow label={t('parking.estimatedBalance')}>
                <AppText variant="title" color="onDeep" numeric>
                  {formatMoney(balanceAfter)}
                </AppText>
              </DetailRow>
            )}
          </Card>

          <View style={{ flex: 1 }} />

          {/* ---- Actions ------------------------------------------------ */}
          <View style={{ gap: spacing.md }}>
            {isPrepaid ? (
              <AppButton
                label={t('parking.extend')}
                variant="inverse"
                icon={<Clock size={18} color={colors.deep} strokeWidth={2.2} />}
                onPress={() => {
                  haptics.light();
                  setExtendOpen(true);
                }}
              />
            ) : null}

            <PressableScale
              onPress={() => {
                haptics.medium();
                setConfirmStopOpen(true);
              }}
              scaleTo={0.97}
              accessibilityRole="button"
              accessibilityLabel={t('parking.stop')}
              style={[
                {
                  height: 60,
                  borderRadius: radius.lg,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: isOverstay ? colors.surface : colors.danger,
                },
                shadow.lg,
              ]}
              testID="stop-parking-cta"
            >
              <AppText
                variant="button"
                style={{ color: isOverstay ? colors.danger : colors.textOnColor, letterSpacing: 0.4 }}
              >
                {t('parking.stop').toUpperCase()}
              </AppText>
            </PressableScale>
          </View>
        </View>
      </LinearGradient>

      {/* ---- Stop confirmation ------------------------------------------ */}
      <BottomSheet
        visible={confirmStopOpen}
        onClose={() => setConfirmStopOpen(false)}
        title={t('parking.stopTitle')}
        subtitle={t('parking.stopBody')}
        testID="stop-sheet"
      >
        <View style={{ gap: spacing.lg }}>
          <Card tone="sunken" padding="lg" style={{ gap: spacing.md }}>
            <DetailRow label={t('parking.duration')} value={formatDuration(breakdown.elapsedSeconds)} />
            <Divider />
            <DetailRow label={t('parking.total')} emphasis>
              <MoneyText value={cost} variant="h3" color="brand" />
            </DetailRow>
          </Card>

          {stopParking.isError ? (
            <InlineNotice
              tone="danger"
              title={t('common.somethingWrong')}
              body={errorMessage(stopParking.error)}
            />
          ) : null}

          <AppButton
            label={t('parking.stop')}
            onPress={handleStop}
            loading={stopParking.isPending}
            testID="confirm-stop"
          />
          <AppButton
            label={t('common.cancel')}
            variant="ghost"
            onPress={() => setConfirmStopOpen(false)}
            disabled={stopParking.isPending}
          />
        </View>
      </BottomSheet>

      {/* ---- Extend ------------------------------------------------------ */}
      <BottomSheet
        visible={extendOpen}
        onClose={() => setExtendOpen(false)}
        title={t('parking.extendTitle')}
        subtitle={t('parking.extendBody')}
      >
        <View style={{ gap: spacing.lg }}>
          <View style={{ flexDirection: row, gap: spacing.sm }}>
            {PREPAID_DURATION_OPTIONS.map((option) => {
              const active = option.minutes === extendMinutes;
              return (
                <PressableScale
                  key={option.minutes}
                  onPress={() => {
                    haptics.select();
                    setExtendMinutes(option.minutes);
                  }}
                  scaleTo={0.95}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={formatDurationShort(option.minutes * 60)}
                  style={{
                    flex: 1,
                    alignItems: 'center',
                    gap: 2,
                    paddingVertical: spacing.md,
                    borderRadius: radius.lg,
                    backgroundColor: active ? colors.brandSoft : colors.surface,
                    borderWidth: active ? 2 : 1,
                    borderColor: active ? colors.brand : colors.border,
                  }}
                >
                  <AppText variant="title" numeric align="center">
                    {formatDurationShort(option.minutes * 60)}
                  </AppText>
                  <AppText variant="caption" color="textTertiary" numeric align="center">
                    {zone ? formatMoney(estimatePrepaidCost(zone.tariff, option.minutes)) : '—'}
                  </AppText>
                </PressableScale>
              );
            })}
          </View>

          {extendParking.isError ? (
            <InlineNotice
              tone="danger"
              title={t('common.somethingWrong')}
              body={errorMessage(extendParking.error)}
            />
          ) : null}

          <AppButton
            label={t('parking.extend')}
            onPress={handleExtend}
            loading={extendParking.isPending}
          />
        </View>
      </BottomSheet>
    </View>
  );
}
