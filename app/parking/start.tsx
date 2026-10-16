import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Car, CircleParking, Wallet as WalletIcon, TriangleAlert } from 'lucide-react-native';

import {
  AppButton,
  AppHeader,
  AppText,
  Card,
  Divider,
  DetailRow,
  ErrorState,
  InlineNotice,
  MoneyText,
  PressableScale,
  Screen,
  Segmented,
  Skeleton,
  StatusBadge,
} from '@/components/ui';
import { PlateBadge } from '@/components/domain/PlateBadge';
import { VehicleSelectorSheet } from '@/components/domain/VehicleSelectorSheet';
import { availabilityTone } from '@/components/map/ZoneMarker';

import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/spacing';
import { radius } from '@/theme/radius';
import { useLocale } from '@/hooks/useLocale';
import { useSelectedVehicle } from '@/hooks/useVehicles';
import { useActiveSessions, useStartParking, useZone } from '@/hooks/useParking';
import { useWallet } from '@/hooks/useWallet';
import { useIdempotencyKey } from '@/hooks/useIdempotencyKey';
import { useUserId } from '@/hooks/useSession';
import { useTrust } from '@/hooks/useCommunity';
import type { ParkingMode } from '@/types';
import { discountTariff, estimatePrepaidCost, PREPAID_DURATION_OPTIONS } from '@/utils/pricing';
import { formatClockRange, formatDurationShort } from '@/utils/time';
import { formatMoney, formatRate } from '@/utils/money';
import { errorMessage } from '@/utils/errors';
import { haptics } from '@/utils/haptics';

export default function StartParkingScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { t, row, dateLocale, locale } = useLocale();
  const { zoneId } = useLocalSearchParams<{ zoneId: string }>();
  const userId = useUserId();

  const { data: zone, isPending, isError, error, refetch } = useZone(zoneId);
  const { vehicles, selected, select } = useSelectedVehicle();
  const { data: wallet } = useWallet();
  const { data: activeSessions = [] } = useActiveSessions();
  const startParking = useStartParking();
  const idempotency = useIdempotencyKey('start');
  const { data: trust } = useTrust();

  const [vehicleSheetOpen, setVehicleSheetOpen] = useState(false);
  const [mode, setMode] = useState<ParkingMode | undefined>();
  const [durationMinutes, setDurationMinutes] = useState(60);

  const effectiveMode = mode ?? zone?.defaultMode ?? 'start_stop';

  /** The one hard rule: a vehicle can only hold one live session. */
  const clashingSession = activeSessions.find((s) => s.vehicleId === selected?.id);

  // The same loyalty discount the service applies at start, so what is shown is what is charged.
  const discount = trust?.discountPercent ?? 0;
  const tariff = useMemo(
    () => (zone ? discountTariff(zone.tariff, discount) : undefined),
    [zone, discount],
  );

  const prepaidCost = useMemo(
    () => (tariff && effectiveMode === 'prepaid' ? estimatePrepaidCost(tariff, durationMinutes) : 0),
    [tariff, effectiveMode, durationMinutes],
  );

  const balance = wallet?.balance ?? 0;
  const insufficient = effectiveMode === 'prepaid' && prepaidCost > balance;
  const lowBalance = !insufficient && balance < (tariff?.hourlyRate ?? 0);

  if (isError) {
    return (
      <Screen>
        <AppHeader title={t('parking.details')} />
        <ErrorState error={error} onRetry={() => void refetch()} />
      </Screen>
    );
  }

  const today = zone?.operatingHours.find((h) => h.weekday === new Date().getDay());
  const activeVehicleIds = activeSessions.map((s) => s.vehicleId);

  const handleStart = () => {
    if (!zone || !selected || !userId) return;
    startParking.mutate(
      {
        userId,
        vehicleId: selected.id,
        zoneId: zone.id,
        mode: effectiveMode,
        durationMinutes: effectiveMode === 'prepaid' ? durationMinutes : undefined,
        entryMethod: 'gps',
        idempotencyKey: idempotency.key(),
      },
      {
        onSuccess: (session) => {
          haptics.success();
          idempotency.reset();
          router.replace(`/parking/active/${session.id}`);
        },
        onError: () => haptics.error(),
      },
    );
  };

  return (
    <Screen bottomInset={spacing.giant}>
      <AppHeader title={t('parking.details')} leading="close" />

      {isPending || !zone ? (
        <View style={{ gap: spacing.lg }}>
          <Skeleton height={120} radiusToken="xl" />
          <Skeleton height={180} radiusToken="xl" />
          <Skeleton height={140} radiusToken="xl" />
        </View>
      ) : (
        <View style={{ gap: spacing.lg }}>
          {/* ---- Vehicle confirmation --------------------------------- */}
          <View style={{ gap: spacing.sm }}>
            <AppText variant="overline" color="textTertiary">
              {t('parking.confirmVehicle')}
            </AppText>

            <PressableScale
              onPress={() => {
                haptics.select();
                setVehicleSheetOpen(true);
              }}
              scaleTo={0.99}
              accessibilityRole="button"
              accessibilityLabel={
                selected ? `${selected.displayName}, ${selected.plateNumber}` : t('vehicle.select')
              }
              accessibilityHint={t('parking.wrongVehicle')}
            >
              <Card
                tone="outline"
                padding="lg"
                style={{
                  flexDirection: row,
                  alignItems: 'center',
                  gap: spacing.md,
                  borderColor: colors.brand,
                  borderWidth: 2,
                }}
              >
                <View
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: radius.md,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: colors.brandSoft,
                  }}
                >
                  <Car size={22} color={colors.brand} strokeWidth={2.2} />
                </View>
                <View style={{ flex: 1, gap: 6 }}>
                  <AppText variant="titleLg" numberOfLines={1}>
                    {selected?.displayName ?? t('vehicle.select')}
                  </AppText>
                  {selected ? <PlateBadge plateNumber={selected.plateNumber} size="sm" /> : null}
                </View>
                <AppText variant="label" color="brand">
                  {t('common.edit')}
                </AppText>
              </Card>
            </PressableScale>

            <AppText variant="caption" color="textTertiary">
              {t('parking.wrongVehicle')}
            </AppText>
          </View>

          {clashingSession ? (
            <InlineNotice
              tone="warning"
              title={t('parking.alreadyActive')}
              body={t('parking.alreadyActiveBody')}
              action={{
                label: t('parking.viewActive'),
                onPress: () => router.replace(`/parking/active/${clashingSession.id}`),
              }}
            />
          ) : null}

          {zone.parkingAllowed === false && zone.accessRestriction ? (
            <InlineNotice
              tone="warning"
              title={t('zone.restrictedAccess')}
              body={
                locale === 'ar'
                  ? zone.accessRestrictionAr ?? zone.accessRestriction
                  : zone.accessRestriction
              }
            />
          ) : null}

          {/* ---- Location --------------------------------------------- */}
          <Card padding="lg" style={{ gap: spacing.md }}>
            <View style={{ flexDirection: row, alignItems: 'center', gap: spacing.md }}>
              <View
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: radius.md,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: colors.surfaceAlt,
                }}
              >
                <CircleParking size={20} color={colors.textSecondary} strokeWidth={2.2} />
              </View>
              <View style={{ flex: 1, gap: 3 }}>
                <AppText variant="titleLg">{locale === 'ar' ? zone.nameAr : zone.name}</AppText>
                <AppText variant="bodySm" color="textSecondary">
                  {t('violation.zone')} {zone.code}
                </AppText>
              </View>
              <StatusBadge
                label={t(`zone.${zone.availability}` as const)}
                tone={availabilityTone(zone.availability)}
                size="sm"
              />
            </View>

            <Divider />

            <DetailRow
              label={t('zone.rate')}
              value={`${formatRate((tariff ?? zone.tariff).hourlyRate)} ${t('common.perHour')}`}
            />
            <DetailRow
              label={t('zone.operatingHours')}
              value={
                today && !today.closed
                  ? formatClockRange(today.opensAt, today.closesAt, dateLocale)
                  : t('zone.closedNow')
              }
            />
            <DetailRow
              label={t('zone.maxStay')}
              value={
                zone.tariff.maxStayMinutes
                  ? formatDurationShort(zone.tariff.maxStayMinutes * 60)
                  : '—'
              }
            />
          </Card>

          {trust && discount > 0 ? (
            <InlineNotice
              tone="info"
              title={t('points.appliedDiscount', {
                tier: t(`points.tier.${trust.tier}` as const),
                percent: discount,
              })}
            />
          ) : null}

          {/* ---- Mode + duration --------------------------------------- */}
          {zone.supportedModes.length > 1 ? (
            <View style={{ gap: spacing.sm }}>
              <AppText variant="overline" color="textTertiary">
                {t('parking.mode')}
              </AppText>
              <Segmented
                variant="inset"
                value={effectiveMode}
                onChange={(value) => setMode(value)}
                options={zone.supportedModes.map((supported) => ({
                  value: supported,
                  label: t(`parking.mode.${supported}` as const),
                }))}
              />
              <AppText variant="caption" color="textTertiary">
                {t(`parking.modeHint.${effectiveMode}` as const)}
              </AppText>
            </View>
          ) : null}

          {effectiveMode === 'prepaid' ? (
            <View style={{ gap: spacing.sm }}>
              <AppText variant="overline" color="textTertiary">
                {t('parking.duration')}
              </AppText>
              <View style={{ flexDirection: row, gap: spacing.sm }}>
                {PREPAID_DURATION_OPTIONS.filter(
                  (option) =>
                    !zone.tariff.maxStayMinutes || option.minutes <= zone.tariff.maxStayMinutes,
                ).map((option) => {
                  const active = option.minutes === durationMinutes;
                  return (
                    <PressableScale
                      key={option.minutes}
                      onPress={() => {
                        haptics.select();
                        setDurationMinutes(option.minutes);
                      }}
                      scaleTo={0.95}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: active }}
                      accessibilityLabel={formatDurationShort(option.minutes * 60)}
                      style={{
                        flex: 1,
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 2,
                        paddingVertical: spacing.md,
                        borderRadius: radius.lg,
                        backgroundColor: active ? colors.brandSoft : colors.surface,
                        borderWidth: active ? 2 : 1,
                        borderColor: active ? colors.brand : colors.border,
                      }}
                    >
                      <AppText
                        variant="title"
                        numeric
                        align="center"
                        style={{ color: active ? colors.successText : colors.text }}
                      >
                        {formatDurationShort(option.minutes * 60)}
                      </AppText>
                      <AppText variant="caption" color="textTertiary" numeric align="center">
                        {formatMoney(estimatePrepaidCost(tariff ?? zone.tariff, option.minutes))}
                      </AppText>
                    </PressableScale>
                  );
                })}
              </View>
            </View>
          ) : null}

          {/* ---- Payment ---------------------------------------------- */}
          <Card padding="lg" style={{ gap: spacing.md }}>
            <View style={{ flexDirection: row, alignItems: 'center', gap: spacing.md }}>
              <View
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: radius.md,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: colors.surfaceAlt,
                }}
              >
                <WalletIcon size={20} color={colors.textSecondary} strokeWidth={2.2} />
              </View>
              <View style={{ flex: 1, gap: 3 }}>
                <AppText variant="titleLg">{t('wallet.title')}</AppText>
                <AppText variant="bodySm" color="textSecondary">
                  {t('parking.payment')}
                </AppText>
              </View>
              <MoneyText value={balance} variant="titleLg" />
            </View>

            {effectiveMode === 'prepaid' ? (
              <>
                <Divider />
                <DetailRow label={t('parking.total')} emphasis>
                  <MoneyText value={prepaidCost} variant="h3" color="brand" />
                </DetailRow>
              </>
            ) : null}
          </Card>

          {insufficient ? (
            <InlineNotice
              tone="danger"
              title={t('parking.lowBalance')}
              body={t('parking.lowBalanceBody', { balance: formatMoney(balance) })}
              action={{ label: t('parking.topUpNow'), onPress: () => router.push('/wallet/topup') }}
              icon={<TriangleAlert size={20} color={colors.dangerText} strokeWidth={2.2} />}
            />
          ) : lowBalance ? (
            <InlineNotice
              tone="warning"
              title={t('parking.lowBalance')}
              body={t('parking.lowBalanceBody', { balance: formatMoney(balance) })}
              action={{ label: t('parking.topUpNow'), onPress: () => router.push('/wallet/topup') }}
            />
          ) : null}

          {startParking.isError ? (
            <InlineNotice
              tone="danger"
              title={t('common.somethingWrong')}
              body={errorMessage(startParking.error)}
            />
          ) : null}

          <AppText variant="caption" color="textTertiary" align="center">
            {t('parking.zoneConfirmBody')}
          </AppText>

          <AppButton
            label={t('parking.start')}
            onPress={handleStart}
            loading={startParking.isPending}
            disabled={
              !selected ||
              Boolean(clashingSession) ||
              insufficient ||
              zone.parkingAllowed === false ||
              zone.availability === 'full'
            }
            testID="start-parking-cta"
          />
        </View>
      )}

      <VehicleSelectorSheet
        visible={vehicleSheetOpen}
        onClose={() => setVehicleSheetOpen(false)}
        vehicles={vehicles}
        selectedId={selected?.id}
        activeVehicleIds={activeVehicleIds}
        onSelect={(vehicle) => {
          select(vehicle.id);
          setVehicleSheetOpen(false);
        }}
        onAddVehicle={() => {
          setVehicleSheetOpen(false);
          router.push('/vehicles/add');
        }}
      />
    </Screen>
  );
}
