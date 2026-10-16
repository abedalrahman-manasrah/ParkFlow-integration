import { useMemo } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Car, Plus, ShieldAlert } from 'lucide-react-native';

import {
  AppButton,
  AppText,
  EmptyState,
  ErrorState,
  Screen,
  SkeletonGroup,
  TabHeader,
} from '@/components/ui';
import { VehicleCard } from '@/components/domain/VehicleCard';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/spacing';
import { useLocale } from '@/hooks/useLocale';
import { useVehicles } from '@/hooks/useVehicles';
import { useActiveSessions } from '@/hooks/useParking';
import { useViolations } from '@/hooks/useViolations';

const TAB_BAR_CLEARANCE = 96;

export default function VehiclesScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { t } = useLocale();
  const insets = useSafeAreaInsets();

  const { data: vehicles = [], isPending, isError, error, refetch, isRefetching } = useVehicles();
  const { data: activeSessions = [] } = useActiveSessions();
  const { data: violations = [] } = useViolations();

  const activeVehicleIds = activeSessions.map((session) => session.vehicleId);

  /** Unpaid notices per vehicle, so each card can carry its own count. */
  const unpaidByVehicle = useMemo(() => {
    const counts = new Map<string, number>();
    violations
      .filter((violation) => violation.status === 'unpaid' || violation.status === 'overdue')
      .forEach((violation) => {
        counts.set(violation.vehicleId, (counts.get(violation.vehicleId) ?? 0) + 1);
      });
    return counts;
  }, [violations]);

  return (
    <Screen layout="fixed" safeBottom={false}>
      <TabHeader
        title={t('vehicle.myVehicles')}
        style={{ marginBottom: spacing.lg }}
        trailing={
          <AppButton
            label={t('warning.entry')}
            size="sm"
            variant="secondary"
            fullWidth={false}
            style={{ alignSelf: 'center' }}
            icon={<ShieldAlert size={16} color={colors.text} strokeWidth={2.2} />}
            onPress={() => router.push('/vehicles/warning-check')}
          />
        }
      />

      {isPending ? (
        <SkeletonGroup count={3} height={112} />
      ) : isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} tintColor={colors.brand} />
          }
          contentContainerStyle={{
            gap: spacing.lg,
            paddingBottom: TAB_BAR_CLEARANCE + insets.bottom,
            flexGrow: 1,
          }}
        >
          {vehicles.length === 0 ? (
            <EmptyState
              icon={<Car size={28} color={colors.brand} strokeWidth={2} />}
              title={t('vehicle.empty')}
              body={t('vehicle.emptyBody')}
              action={{ label: t('vehicle.addNew'), onPress: () => router.push('/vehicles/add') }}
            />
          ) : (
            <>
              {vehicles.map((vehicle) => (
                <VehicleCard
                  key={vehicle.id}
                  vehicle={vehicle}
                  isParked={activeVehicleIds.includes(vehicle.id)}
                  violationCount={unpaidByVehicle.get(vehicle.id) ?? 0}
                  onPress={() => router.push(`/vehicles/${vehicle.id}`)}
                />
              ))}

              <AppButton
                label={t('vehicle.addNew')}
                variant="secondary"
                onPress={() => router.push('/vehicles/add')}
                icon={<Plus size={18} color={colors.text} strokeWidth={2.4} />}
                style={{ marginTop: spacing.sm }}
              />
            </>
          )}
        </ScrollView>
      )}
    </Screen>
  );
}
