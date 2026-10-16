import { useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CarFront, House, Plus } from 'lucide-react-native';

import {
  AppButton,
  EmptyState,
  ErrorState,
  Screen,
  Segmented,
  SkeletonGroup,
  TabHeader,
} from '@/components/ui';
import { CityPicker } from '@/components/domain/CityPicker';
import { RideCard, SpotCard } from '@/components/domain/SharingCards';
import { useRideSearch, useSpots } from '@/hooks/useSharing';
import { useUserLocation } from '@/hooks/useUserLocation';
import { useLocale } from '@/hooks/useLocale';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/spacing';
import { CITIES } from '@/data/cities';

const TAB_BAR_CLEARANCE = 96;
type Section = 'rides' | 'spots';

export default function ShareScreen() {
  const { t } = useLocale();
  const insets = useSafeAreaInsets();
  const [section, setSection] = useState<Section>('rides');

  return (
    <Screen layout="fixed" safeBottom={false}>
      <TabHeader title={t('share.title')} style={{ marginBottom: spacing.md }} />
      <Segmented
        variant="inset"
        value={section}
        onChange={setSection}
        options={[{ value: 'rides', label: t('share.rides') }, { value: 'spots', label: t('share.spots') }]}
        style={{ marginBottom: spacing.lg }}
      />
      {section === 'rides' ? <RidesSection bottom={TAB_BAR_CLEARANCE + insets.bottom} /> : <SpotsSection bottom={TAB_BAR_CLEARANCE + insets.bottom} />}
    </Screen>
  );
}

function RidesSection({ bottom }: { bottom: number }) {
  const router = useRouter();
  const { t, row } = useLocale();
  const { colors } = useTheme();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const rides = useRideSearch({ from: from || undefined, to: to || undefined });

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={rides.isRefetching} onRefresh={() => void rides.refetch()} tintColor={colors.brand} />}
      contentContainerStyle={{ gap: spacing.lg, paddingBottom: bottom }}
    >
      <View style={{ flexDirection: row, gap: spacing.sm }}>
        <AppButton label={t('ride.offer')} size="sm" icon={<Plus size={16} color={colors.onBrand} />} onPress={() => router.push('/rides/new')} style={{ flex: 1 }} />
        <AppButton label={t('ride.mine')} size="sm" variant="secondary" onPress={() => router.push('/rides/mine')} style={{ flex: 1 }} />
      </View>
      <CityPicker label={t('ride.from')} value={from} onChange={setFrom} allowAny />
      <CityPicker label={t('ride.to')} value={to} onChange={setTo} allowAny />

      {rides.isPending ? <SkeletonGroup count={3} height={120} />
        : rides.isError ? <ErrorState error={rides.error} onRetry={() => void rides.refetch()} />
        : rides.data.length === 0 ? (
          <EmptyState
            icon={<CarFront size={30} color={colors.brand} />}
            title={t('ride.emptyTitle')}
            body={t('ride.emptyBody')}
            action={{ label: t('ride.offer'), onPress: () => router.push('/rides/new') }}
          />
        ) : rides.data.map((ride) => <RideCard key={ride.id} ride={ride} onPress={() => router.push(`/rides/${ride.id}`)} />)}
    </ScrollView>
  );
}

function SpotsSection({ bottom }: { bottom: number }) {
  const router = useRouter();
  const { t, row } = useLocale();
  const { colors } = useTheme();
  const { location } = useUserLocation();
  const spots = useSpots(location ?? CITIES[0]!.center);

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={spots.isRefetching} onRefresh={() => void spots.refetch()} tintColor={colors.brand} />}
      contentContainerStyle={{ gap: spacing.lg, paddingBottom: bottom }}
    >
      <View style={{ flexDirection: row, gap: spacing.sm }}>
        <AppButton label={t('spot.listMine')} size="sm" icon={<Plus size={16} color={colors.onBrand} />} onPress={() => router.push('/spots/new')} style={{ flex: 1 }} />
        <AppButton label={t('spot.mine')} size="sm" variant="secondary" onPress={() => router.push('/spots/mine')} style={{ flex: 1 }} />
      </View>
      {spots.isPending ? <SkeletonGroup count={3} height={120} />
        : spots.isError ? <ErrorState error={spots.error} onRetry={() => void spots.refetch()} />
        : spots.data.length === 0 ? (
          <EmptyState
            icon={<House size={30} color={colors.brand} />}
            title={t('spot.emptyTitle')}
            body={t('spot.emptyBody')}
            action={{ label: t('spot.listMine'), onPress: () => router.push('/spots/new') }}
          />
        ) : spots.data.map((spot) => <SpotCard key={spot.id} spot={spot} onPress={() => router.push(`/spots/${spot.id}`)} />)}
    </ScrollView>
  );
}

