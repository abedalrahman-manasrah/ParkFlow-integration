import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import QRCode from 'react-native-qrcode-svg';
import { Car } from 'lucide-react-native';

import { AppHeader, AppText, Card, EmptyState, ErrorState, Screen, Segmented, Skeleton } from '@/components/ui';
import { PlateBadge } from '@/components/domain/PlateBadge';
import { useVehicles } from '@/hooks/useVehicles';
import { useGatePass } from '@/hooks/useGates';
import { useLocale } from '@/hooks/useLocale';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/spacing';

/** The QR a driver shows at a QR gate. It renews every minute so a screenshot can't be reused. */
export default function GatePassScreen() {
  const router = useRouter();
  const { t } = useLocale();
  const { colors } = useTheme();
  const { data: vehicles = [], isPending: loadingVehicles } = useVehicles();
  const [vehicleId, setVehicleId] = useState<string>();
  useEffect(() => {
    if (!vehicleId && vehicles.length) setVehicleId((vehicles.find((v) => v.isDefault) ?? vehicles[0])!.id);
  }, [vehicleId, vehicles]);
  const pass = useGatePass(vehicleId);

  return (
    <Screen bottomInset={spacing.giant}>
      <AppHeader title={t('gate.passTitle')} subtitle={t('gate.passSubtitle')} />
      {loadingVehicles ? <Skeleton height={320} />
        : vehicles.length === 0 ? (
          <EmptyState icon={<Car size={30} color={colors.brand} />} title={t('ride.noVehicle')}
            action={{ label: t('ride.addVehicle'), onPress: () => router.push('/vehicles/add') }} />
        ) : (
          <View style={{ gap: spacing.lg }}>
            {vehicles.length > 1 ? (
              <Segmented value={vehicleId ?? ''} onChange={setVehicleId} options={vehicles.map((v) => ({ value: v.id, label: v.displayName }))} />
            ) : null}
            <Card padding="xl" style={{ alignItems: 'center', gap: spacing.lg }}>
              {pass.isError ? <ErrorState error={pass.error} onRetry={() => void pass.refetch()} />
                : !pass.data ? <Skeleton height={240} width={240} />
                : (
                  <>
                    <View style={{ padding: spacing.md, backgroundColor: '#FFFFFF', borderRadius: 16 }}>
                      <QRCode value={pass.data.value} size={240} color="#000000" backgroundColor="#FFFFFF" />
                    </View>
                    <PlateBadge plateNumber={pass.data.plateNumber} size="lg" />
                    <AppText variant="caption" color="textTertiary" align="center">{t('gate.passRefresh')}</AppText>
                  </>
                )}
            </Card>
            <Card padding="lg" tone="outline" style={{ gap: spacing.sm }}>
              <AppText variant="title">{t('gate.howTitle')}</AppText>
              <AppText variant="bodySm" color="textSecondary">{t('gate.howBody')}</AppText>
            </Card>
          </View>
        )}
    </Screen>
  );
}
