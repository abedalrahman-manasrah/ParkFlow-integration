import { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { House } from 'lucide-react-native';

import { AppHeader, Card, Divider, EmptyState, ErrorState, Screen, Segmented, SkeletonGroup, StatusBadge } from '@/components/ui';
import { SpotCard } from '@/components/domain/SharingCards';
import { SpotBookingRow } from '@/components/domain/SpotBookingRow';
import { useMySpots } from '@/hooks/useSharing';
import { useLocale } from '@/hooks/useLocale';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/spacing';
import type { SpotBooking } from '@/types';

type Tab = 'bookings' | 'requests' | 'spots';

export default function MySpotsScreen() {
  const router = useRouter();
  const { t } = useLocale();
  const { colors } = useTheme();
  const [tab, setTab] = useState<Tab>('bookings');
  const { data, isPending, isError, error, refetch } = useMySpots();
  const pending = data?.requests.filter((b) => b.status === 'pending').length ?? 0;
  const empty = <EmptyState icon={<House size={30} color={colors.brand} />} title={t('ride.emptyMine')}
    action={tab === 'bookings' ? undefined : { label: t('spot.listMine'), onPress: () => router.push('/spots/new') }} />;

  const bookingList = (bookings: SpotBooking[]) => bookings.length === 0 ? empty : (
    <Card padding="lg" style={{ gap: spacing.md }}>
      {bookings.map((b, index) => <View key={b.id} style={{ gap: spacing.md }}>{index ? <Divider /> : null}<SpotBookingRow booking={b} showSpot /></View>)}
    </Card>
  );

  return (
    <Screen bottomInset={spacing.giant}>
      <AppHeader title={t('spot.mine')} />
      <View style={{ gap: spacing.lg }}>
        <Segmented value={tab} onChange={setTab} variant="inset" options={[
          { value: 'bookings', label: t('spot.myBookings') },
          { value: 'requests', label: t('spot.bookings'), badge: pending || undefined },
          { value: 'spots', label: t('spot.mySpots') },
        ]} />
        {isPending ? <SkeletonGroup count={3} height={120} />
          : isError ? <ErrorState error={error} onRetry={() => void refetch()} />
          : tab === 'bookings' ? bookingList(data.bookings)
          : tab === 'requests' ? bookingList(data.requests)
          : data.spots.length === 0 ? empty
          : data.spots.map((spot) => (
            <SpotCard key={spot.id} spot={spot} onPress={() => router.push(`/spots/${spot.id}`)}
              badge={<StatusBadge label={spot.active ? t('spot.live') : t('spot.paused')} tone={spot.active ? 'success' : 'warning'} size="sm" />} />
          ))}
      </View>
    </Screen>
  );
}
