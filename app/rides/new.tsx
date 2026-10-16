import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { CalendarDays, Clock3, Users } from 'lucide-react-native';

import {
  AppButton,
  AppHeader,
  AppText,
  Card,
  InlineNotice,
  Screen,
  Segmented,
  SwitchRow,
  TextField,
} from '@/components/ui';
import { CityPicker } from '@/components/domain/CityPicker';
import { StepperRow } from '@/components/domain/StepperRow';
import { useCreateRide, useSetGender } from '@/hooks/useSharing';
import { useVehicles } from '@/hooks/useVehicles';
import { useCurrentUser } from '@/hooks/useSession';
import { useLocale } from '@/hooks/useLocale';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/spacing';
import { formatDate, formatTime } from '@/utils/time';
import { errorMessage } from '@/utils/errors';
import { haptics } from '@/utils/haptics';

const HALF_HOUR = 30 * 60_000;
const earliest = () => Math.ceil((Date.now() + 20 * 60_000) / HALF_HOUR) * HALF_HOUR;

export default function OfferRideScreen() {
  const router = useRouter();
  const { t, dateLocale } = useLocale();
  const { colors } = useTheme();
  const { user } = useCurrentUser();
  const { data: vehicles = [] } = useVehicles();
  const createRide = useCreateRide();
  const setGender = useSetGender();

  const [fromCity, setFromCity] = useState('Ramallah');
  const [toCity, setToCity] = useState('Nablus');
  const [meetingPoint, setMeetingPoint] = useState('');
  const [departMs, setDepartMs] = useState(() => earliest() + 2 * HALF_HOUR);
  const [seats, setSeats] = useState(3);
  const [vehicleId, setVehicleId] = useState('');
  const [womenOnly, setWomenOnly] = useState(false);
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!vehicleId && vehicles.length) setVehicleId((vehicles.find((v) => v.isDefault) ?? vehicles[0])!.id);
  }, [vehicleId, vehicles]);

  const sameCity = fromCity === toCity;
  const needsWoman = womenOnly && user?.gender !== 'female';
  const canPublish = Boolean(vehicleId) && meetingPoint.trim().length > 0 && !sameCity && !needsWoman;

  const shift = (ms: number) => {
    const next = departMs + ms;
    if (next >= earliest() && next <= Date.now() + 60 * 86_400_000) setDepartMs(next);
  };

  const publish = () => createRide.mutate({
    fromCity, toCity, meetingPoint: meetingPoint.trim(), departAt: new Date(departMs).toISOString(),
    seatsTotal: seats, vehicleId, womenOnly, notes: notes.trim() || undefined,
  }, {
    onSuccess: (ride) => { haptics.success(); router.replace(`/rides/${ride.id}`); },
    onError: () => haptics.error(),
  });

  return (
    <Screen keyboardAvoiding bottomInset={spacing.giant}>
      <AppHeader title={t('ride.offer')} subtitle={t('ride.newSubtitle')} leading="close" />
      <View style={{ gap: spacing.lg }}>
        <Card padding="lg" style={{ gap: spacing.lg }}>
          <CityPicker label={t('ride.from')} value={fromCity} onChange={setFromCity} />
          <CityPicker label={t('ride.to')} value={toCity} onChange={setToCity} />
          {sameCity ? <AppText variant="caption" color="danger">{t('ride.sameCity')}</AppText> : null}
          <TextField label={t('ride.meetingPoint')} placeholder={t('ride.meetingPlaceholder')} value={meetingPoint} onChangeText={setMeetingPoint} maxLength={200} />
        </Card>

        <Card padding="lg" style={{ gap: spacing.lg }}>
          <StepperRow icon={<CalendarDays size={18} color={colors.textSecondary} />} label={t('ride.date')} value={formatDate(new Date(departMs).toISOString(), dateLocale)}
            onMinus={() => shift(-86_400_000)} onPlus={() => shift(86_400_000)} minusDisabled={departMs - 86_400_000 < earliest()} />
          <StepperRow icon={<Clock3 size={18} color={colors.textSecondary} />} label={t('ride.time')} value={formatTime(new Date(departMs).toISOString(), dateLocale)}
            onMinus={() => shift(-HALF_HOUR)} onPlus={() => shift(HALF_HOUR)} minusDisabled={departMs - HALF_HOUR < earliest()} />
          <StepperRow icon={<Users size={18} color={colors.textSecondary} />} label={t('ride.seats')} value={String(seats)}
            onMinus={() => setSeats((n) => Math.max(1, n - 1))} onPlus={() => setSeats((n) => Math.min(8, n + 1))} minusDisabled={seats <= 1} plusDisabled={seats >= 8} />
        </Card>

        <Card padding="lg" style={{ gap: spacing.lg }}>
          {vehicles.length ? (
            <View style={{ gap: spacing.sm }}>
              <AppText variant="label" color="textSecondary">{t('ride.vehicle')}</AppText>
              <Segmented value={vehicleId} onChange={setVehicleId} options={vehicles.map((v) => ({ value: v.id, label: v.displayName }))} />
            </View>
          ) : (
            <InlineNotice tone="warning" title={t('ride.noVehicle')} action={{ label: t('ride.addVehicle'), onPress: () => router.push('/vehicles/add') }} />
          )}
          <SwitchRow label={t('ride.womenOnly')} description={t('ride.womenOnlyDescription')} value={womenOnly} onValueChange={setWomenOnly} />
          {needsWoman ? <AppButton label={t('ride.confirmWoman')} variant="secondary" loading={setGender.isPending} onPress={() => setGender.mutate('female')} /> : null}
          <TextField label={t('ride.notesLabel')} value={notes} onChangeText={setNotes} maxLength={300} multiline />
        </Card>

        {createRide.isError ? <InlineNotice tone="danger" title={t('common.somethingWrong')} body={errorMessage(createRide.error)} /> : null}
        <AppButton label={t('ride.publish')} onPress={publish} loading={createRide.isPending} disabled={!canPublish} />
      </View>
    </Screen>
  );
}
