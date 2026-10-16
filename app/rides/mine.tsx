import { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { CarFront } from 'lucide-react-native';

import { AppHeader, EmptyState, ErrorState, Screen, Segmented, SkeletonGroup, StatusBadge } from '@/components/ui';
import { RideCard } from '@/components/domain/SharingCards';
import { useMyRides } from '@/hooks/useSharing';
import { useLocale } from '@/hooks/useLocale';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/spacing';
import { rideBookingTone } from '@/utils/sharing';

type Tab = 'offered' | 'booked';

export default function MyRidesScreen() {
  const router = useRouter();
  const { t } = useLocale();
  const { colors } = useTheme();
  const [tab, setTab] = useState<Tab>('booked');
  const { data, isPending, isError, error, refetch } = useMyRides();
  const rides = data?.[tab] ?? [];
  const pendingRequests = (data?.offered ?? []).reduce((sum, ride) => sum + (ride.bookings ?? []).filter((b) => b.status === 'pending').length, 0);

  return (
    <Screen bottomInset={spacing.giant}>
      <AppHeader title={t('ride.mine')} />
      <View style={{ gap: spacing.lg }}>
        <Segmented value={tab} onChange={setTab} variant="inset" options={[
          { value: 'booked', label: t('ride.booked'), badge: data?.booked.length },
          { value: 'offered', label: t('ride.offered'), badge: pendingRequests || undefined },
        ]} />
        {isPending ? <SkeletonGroup count={3} height={120} />
          : isError ? <ErrorState error={error} onRetry={() => void refetch()} />
          : rides.length === 0 ? <EmptyState icon={<CarFront size={30} color={colors.brand} />} title={t('ride.emptyMine')}
              action={tab === 'offered' ? { label: t('ride.offer'), onPress: () => router.push('/rides/new') } : undefined} />
          : rides.map((ride) => (
            <RideCard key={ride.id} ride={ride} onPress={() => router.push(`/rides/${ride.id}`)}
              badge={tab === 'booked' && ride.myBooking
                ? <StatusBadge label={t(`ride.booking.${ride.myBooking.status}`)} tone={rideBookingTone(ride.myBooking.status)} size="sm" />
                : undefined} />
          ))}
      </View>
    </Screen>
  );
}
