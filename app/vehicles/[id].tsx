import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Car, Truck, Bike, CarTaxiFront, ScrollText, BadgeCheck, Trash2, ShieldAlert } from 'lucide-react-native';

import {
  AppButton,
  AppHeader,
  AppText,
  BottomSheet,
  Card,
  DetailRow,
  Divider,
  EmptyState,
  ErrorState,
  InlineNotice,
  ListItem,
  MoneyText,
  Screen,
  SectionHeader,
  Skeleton,
  StatusBadge,
} from '@/components/ui';
import { PlateBadge } from '@/components/domain/PlateBadge';

import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/spacing';
import { radius } from '@/theme/radius';
import { useLocale } from '@/hooks/useLocale';
import {
  useSetDefaultVehicle,
  useUnlinkVehicle,
  useVehicle,
  useVehiclePermits,
} from '@/hooks/useVehicles';
import { useActiveSessions, useSessionHistory, useZones } from '@/hooks/useParking';
import { useViolations } from '@/hooks/useViolations';
import type { VehicleType } from '@/types';
import { formatDate, formatDuration, formatTime, secondsBetween } from '@/utils/time';
import { errorMessage } from '@/utils/errors';
import { haptics } from '@/utils/haptics';
import { isPlateOnlyName } from '@/utils/plate';

const TYPE_ICONS: Record<VehicleType, typeof Car> = {
  private: Car,
  commercial: Truck,
  taxi: CarTaxiFront,
  motorcycle: Bike,
};

export default function VehicleDetailScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { t, row, alignEnd, dateLocale, locale } = useLocale();
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data: vehicle, isPending, isError, error, refetch } = useVehicle(id);
  const { data: sessions = [] } = useSessionHistory(id);
  const { data: violations = [] } = useViolations(id);
  const { data: activeSessions = [] } = useActiveSessions();
  const { data: permits = [] } = useVehiclePermits(id);
  const { data: zones = [] } = useZones();
  const setDefault = useSetDefaultVehicle();
  const unlink = useUnlinkVehicle();

  const [removeOpen, setRemoveOpen] = useState(false);

  const activeSession = activeSessions.find((session) => session.vehicleId === id);
  // A live session is surfaced separately above, so "history" means finished
  // sessions only — otherwise the count and the list disagree.
  const history = useMemo(
    () => sessions.filter((session) => session.status !== 'ACTIVE'),
    [sessions],
  );
  const recentHistory = history.slice(0, 3);
  const unpaidViolations = violations.filter(
    (violation) => violation.status === 'unpaid' || violation.status === 'overdue',
  );

  if (isError) {
    return (
      <Screen>
        <AppHeader title={t('vehicle.details')} />
        <ErrorState error={error} onRetry={() => void refetch()} />
      </Screen>
    );
  }

  if (isPending || !vehicle) {
    return (
      <Screen>
        <AppHeader title={t('vehicle.details')} />
        <View style={{ gap: spacing.lg }}>
          <Skeleton height={160} radiusToken="xl" />
          <Skeleton height={180} radiusToken="xl" />
        </View>
      </Screen>
    );
  }

  const Icon = TYPE_ICONS[vehicle.type];
  // Without a nickname the name is just the plate, which the badge already shows.
  const sameAsPlate = isPlateOnlyName(vehicle.displayName, vehicle.plateNumber);

  const handleRemove = () => {
    unlink.mutate(vehicle.id, {
      onSuccess: () => {
        haptics.success();
        setRemoveOpen(false);
        router.back();
      },
      onError: () => haptics.error(),
    });
  };

  return (
    <Screen>
      <AppHeader
        title={t('vehicle.details')}
        trailing={
          <AppButton
            label={t('warning.entry')}
            size="sm"
            variant="secondary"
            fullWidth={false}
            style={{ alignSelf: 'center' }}
            icon={<ShieldAlert size={16} color={colors.text} strokeWidth={2.2} />}
            onPress={() => router.push({ pathname: '/vehicles/warning-check', params: { vehicleId: id } })}
          />
        }
      />

      <View style={{ gap: spacing.xl }}>
        {/* ---- Identity ------------------------------------------------ */}
        <Card padding="xl" style={{ alignItems: 'center', gap: spacing.md }}>
          <View
            style={{
              width: 96,
              height: 96,
              borderRadius: radius.xxl,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: colors.brandSofter,
            }}
          >
            <Icon size={44} color={colors.brand} strokeWidth={1.8} />
          </View>

          <AppText variant="h2" align="center">
            {sameAsPlate ? t(`vehicle.type.${vehicle.type}` as const) : vehicle.displayName}
          </AppText>
          <PlateBadge plateNumber={vehicle.plateNumber} size="lg" />

          <View style={{ flexDirection: row, gap: spacing.sm, flexWrap: 'wrap', justifyContent: 'center' }}>
            {vehicle.isDefault ? (
              <StatusBadge label={t('vehicle.isDefault')} tone="brand" size="sm" showDot={false} />
            ) : null}
            {activeSession ? (
              <StatusBadge label={t('vehicle.parkedNow')} tone="success" size="sm" />
            ) : null}
          </View>
        </Card>

        {activeSession ? (
          <InlineNotice
            tone="success"
            title={t('parking.active')}
            body={
              locale === 'ar'
                ? activeSession.pricingRulesSnapshot.zoneNameAr
                : activeSession.pricingRulesSnapshot.zoneName
            }
            action={{
              label: t('parking.viewActive'),
              onPress: () => router.push(`/parking/active/${activeSession.id}`),
            }}
          />
        ) : null}

        {/* ---- Attributes ---------------------------------------------- */}
        <Card padding="lg" style={{ gap: spacing.md }}>
          <DetailRow label={t('vehicle.type')} value={t(`vehicle.type.${vehicle.type}` as const)} />
          {vehicle.make ? <DetailRow label={t('vehicle.make')} value={vehicle.make} /> : null}
          {vehicle.model ? <DetailRow label={t('vehicle.model')} value={vehicle.model} /> : null}
          {vehicle.color ? <DetailRow label={t('vehicle.color')} value={vehicle.color} /> : null}
          <DetailRow label={t('vehicle.addedOn')} value={formatDate(vehicle.createdAt, dateLocale)} />
        </Card>

        {!vehicle.isDefault ? (
          <AppButton
            label={t('vehicle.setDefault')}
            variant="secondary"
            loading={setDefault.isPending}
            onPress={() => setDefault.mutate(vehicle.id)}
            icon={<BadgeCheck size={18} color={colors.text} strokeWidth={2.2} />}
          />
        ) : null}

        {/* ---- Parking history ----------------------------------------- */}
        <View>
          <SectionHeader
            title={t('vehicle.parkingHistory')}
            subtitle={
              history.length === 1
                ? t('vehicle.sessionCountOne')
                : t('vehicle.sessionCount', { count: history.length })
            }
          />
          <Card padding="lg" style={{ paddingVertical: spacing.xs }}>
            {recentHistory.length === 0 ? (
              <EmptyState compact title={t('parking.noHistory')} body={t('parking.noHistoryBody')} />
            ) : (
              recentHistory.map((session, index) => (
                <View key={session.id}>
                  {index > 0 ? <Divider /> : null}
                  <ListItem
                    title={
                      locale === 'ar'
                        ? session.pricingRulesSnapshot.zoneNameAr
                        : session.pricingRulesSnapshot.zoneName
                    }
                    subtitle={`${formatDate(session.startedAt, dateLocale)} · ${formatTime(session.startedAt, dateLocale)} — ${
                      session.stoppedAt ? formatTime(session.stoppedAt, dateLocale) : '—'
                    }`}
                    trailing={
                      <View style={{ alignItems: alignEnd, gap: 3 }}>
                        <MoneyText value={session.finalCost ?? session.currentCost} variant="title" />
                        <AppText variant="caption" color="textTertiary" numeric>
                          {session.stoppedAt
                            ? formatDuration(secondsBetween(session.startedAt, session.stoppedAt))
                            : '—'}
                        </AppText>
                      </View>
                    }
                    onPress={() => router.push(`/parking/receipt/${session.id}`)}
                  />
                </View>
              ))
            )}
          </Card>
        </View>

        {/* ---- Violations ---------------------------------------------- */}
        <View>
          <SectionHeader
            title={t('vehicle.violations')}
            action={{ label: t('common.seeAll'), onPress: () => router.push('/violations') }}
          />
          <Card padding="lg" style={{ paddingVertical: spacing.xs }}>
            {violations.length === 0 ? (
              <EmptyState compact title={t('violation.empty')} body={t('violation.emptyBody')} />
            ) : (
              violations.slice(0, 3).map((violation, index) => (
                <View key={violation.id}>
                  {index > 0 ? <Divider /> : null}
                  <ListItem
                    title={t(`violation.type.${violation.type}` as const)}
                    subtitle={`${violation.locationName} · ${formatDate(violation.issuedAt, dateLocale)}`}
                    leading={
                      <View
                        style={{
                          width: 40,
                          height: 40,
                          borderRadius: radius.md,
                          alignItems: 'center',
                          justifyContent: 'center',
                          backgroundColor:
                            violation.status === 'paid' ? colors.surfaceAlt : colors.dangerSoft,
                        }}
                      >
                        <ScrollText
                          size={18}
                          color={violation.status === 'paid' ? colors.textSecondary : colors.danger}
                          strokeWidth={2.1}
                        />
                      </View>
                    }
                    trailing={<MoneyText value={-violation.amount} variant="title" />}
                    onPress={() => router.push(`/violations/${violation.id}`)}
                  />
                </View>
              ))
            )}
          </Card>
        </View>

        {/* ---- Permits -------------------------------------------------- */}
        <View>
          <SectionHeader title={t('vehicle.permits')} />
          <Card padding="lg" style={{ paddingVertical: spacing.xs }}>
            {permits.length === 0 ? (
              <EmptyState compact title={t('vehicle.noPermits')} />
            ) : (
              permits.map((permit, index) => {
                const active = permit.status === 'active';
                const zoneNames = permit.zoneIds
                  .map((zoneId) => {
                    const zone = zones.find((z) => z.id === zoneId);
                    if (!zone) return zoneId;
                    return locale === 'ar' ? zone.nameAr : zone.name;
                  })
                  .join(', ');
                const validity = t(active ? 'permit.validUntil' : 'permit.expiredOn', {
                  date: formatDate(permit.validTo, dateLocale),
                });

                return (
                  <View key={permit.id}>
                    {index > 0 ? <Divider /> : null}
                    <ListItem
                      title={t(`permit.type.${permit.type}` as const)}
                      subtitle={`${zoneNames} · ${validity}`}
                      leading={
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
                          <BadgeCheck
                            size={18}
                            color={active ? colors.brand : colors.textTertiary}
                            strokeWidth={2.1}
                          />
                        </View>
                      }
                      trailing={
                        <StatusBadge
                          label={t(`permit.status.${permit.status}` as const)}
                          tone={active ? 'success' : 'neutral'}
                        />
                      }
                    />
                  </View>
                );
              })
            )}
          </Card>
        </View>

        {/* ---- Danger zone ---------------------------------------------- */}
        <AppButton
          label={t('vehicle.remove')}
          variant="danger"
          onPress={() => {
            haptics.warning();
            setRemoveOpen(true);
          }}
          icon={<Trash2 size={18} color={colors.dangerText} strokeWidth={2.2} />}
        />

        <AppText variant="caption" color="textTertiary" align="center">
          {t('vehicle.removeBody')}
        </AppText>
      </View>

      <BottomSheet
        visible={removeOpen}
        onClose={() => setRemoveOpen(false)}
        title={t('vehicle.removeTitle')}
        subtitle={t('vehicle.removeBody')}
      >
        <View style={{ gap: spacing.md }}>
          {activeSession ? (
            <InlineNotice tone="warning" title={t('vehicle.removeBlocked')} />
          ) : null}

          {unlink.isError ? (
            <InlineNotice
              tone="danger"
              title={t('common.somethingWrong')}
              body={errorMessage(unlink.error)}
            />
          ) : null}

          {unpaidViolations.length > 0 ? (
            <InlineNotice
              tone="info"
              title={`${unpaidViolations.length} ${t('violation.unpaid')}`}
              body={t('vehicle.removeBody')}
            />
          ) : null}

          <AppButton
            label={t('vehicle.remove')}
            variant="danger"
            loading={unlink.isPending}
            disabled={Boolean(activeSession)}
            onPress={handleRemove}
          />
          <AppButton label={t('common.cancel')} variant="ghost" onPress={() => setRemoveOpen(false)} />
        </View>
      </BottomSheet>
    </Screen>
  );
}
