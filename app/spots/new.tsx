import { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Clock3, LocateFixed } from 'lucide-react-native';

import {
  AppButton,
  AppHeader,
  AppText,
  Card,
  InlineNotice,
  PressableScale,
  Screen,
  SwitchRow,
  TextField,
} from '@/components/ui';
import { CityPicker } from '@/components/domain/CityPicker';
import { StepperRow } from '@/components/domain/StepperRow';
import { useCreateSpot } from '@/hooks/useSharing';
import { useUserLocation } from '@/hooks/useUserLocation';
import { useLocale } from '@/hooks/useLocale';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/spacing';
import { radius } from '@/theme/radius';
import { CITIES, cityLabel } from '@/data/cities';
import { errorMessage } from '@/utils/errors';
import { haptics } from '@/utils/haptics';
import { shekelsToMinor, weekdayNames } from '@/utils/sharing';

/** Minutes after midnight → "HH:MM"; 1440 (end of day) is sent as "00:00". */
const clock = (minutes: number) => minutes >= 1440 ? '00:00' : `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
const shown = (minutes: number) => minutes >= 1440 ? '24:00' : clock(minutes);

export default function ListSpotScreen() {
  const router = useRouter();
  const { t, row, locale, dateLocale } = useLocale();
  const { colors } = useTheme();
  const createSpot = useCreateSpot();
  const { location, request, status } = useUserLocation(false);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [city, setCity] = useState('Ramallah');
  const [areaHint, setAreaHint] = useState('');
  const [fullAddress, setFullAddress] = useState('');
  const [hourly, setHourly] = useState('5');
  const [daily, setDaily] = useState('');
  const [weekdays, setWeekdays] = useState([0, 1, 2, 3, 4]);
  const [from, setFrom] = useState(8 * 60);
  const [until, setUntil] = useState(18 * 60);
  const [covered, setCovered] = useState(false);
  const [van, setVan] = useState(false);
  const [instantBook, setInstantBook] = useState(true);

  const point = location ?? CITIES.find((c) => c.name === city)!.center;
  const hourlyMinor = shekelsToMinor(hourly);
  const dailyMinor = daily.trim() ? shekelsToMinor(daily) : undefined;
  const hourlyInvalid = !Number.isFinite(hourlyMinor) || hourlyMinor < 100 || hourlyMinor > 5000;
  const dailyInvalid = dailyMinor !== undefined && (!Number.isFinite(dailyMinor) || dailyMinor < 100 || dailyMinor > 30000);
  const canPublish = title.trim().length > 0 && areaHint.trim().length > 0 && fullAddress.trim().length >= 3
    && !hourlyInvalid && !dailyInvalid && weekdays.length > 0 && until > from;
  const names = weekdayNames(dateLocale);

  const toggleDay = (day: number) => setWeekdays((days) => days.includes(day) ? days.filter((d) => d !== day) : [...days, day].sort());

  const publish = () => createSpot.mutate({
    title: title.trim(), description: description.trim() || undefined, city, areaHint: areaHint.trim(), fullAddress: fullAddress.trim(),
    latitude: point.latitude, longitude: point.longitude, vehicleSize: van ? 'van' : 'car', covered,
    hourlyRate: hourlyMinor, dailyRate: dailyMinor, weekdays, availableFrom: clock(from), availableTo: clock(until), instantBook,
  }, {
    onSuccess: (spot) => { haptics.success(); router.replace(`/spots/${spot.id}`); },
    onError: () => haptics.error(),
  });

  return (
    <Screen keyboardAvoiding bottomInset={spacing.giant}>
      <AppHeader title={t('spot.newTitle')} subtitle={t('spot.newSubtitle')} leading="close" />
      <View style={{ gap: spacing.lg }}>
        <Card padding="lg" style={{ gap: spacing.lg }}>
          <TextField label={t('spot.titleLabel')} placeholder={t('spot.titlePlaceholder')} value={title} onChangeText={setTitle} maxLength={200} />
          <TextField label={t('spot.descriptionLabel')} value={description} onChangeText={setDescription} maxLength={500} multiline />
        </Card>

        <Card padding="lg" style={{ gap: spacing.lg }}>
          <CityPicker label={t('spot.city')} value={city} onChange={setCity} />
          <TextField label={t('spot.areaLabel')} placeholder={t('spot.areaPlaceholder')} value={areaHint} onChangeText={setAreaHint} maxLength={200} />
          <TextField label={t('spot.addressLabel')} placeholder={t('spot.addressPlaceholder')} value={fullAddress} onChangeText={setFullAddress} maxLength={300} />
          <View style={{ gap: spacing.sm }}>
            <AppText variant="label" color="textSecondary">{t('spot.location')}</AppText>
            <AppText variant="caption" color="textTertiary">
              {location ? t('spot.usingLocation') : t('spot.usingCity', { city: cityLabel(city, locale) })}
            </AppText>
            <AppButton label={t('spot.useMyLocation')} size="sm" variant="secondary" loading={status === 'requesting'}
              icon={<LocateFixed size={16} color={colors.text} />} onPress={() => void request()} />
          </View>
          <AppText variant="caption" color="textTertiary">{t('spot.privacyNote')}</AppText>
        </Card>

        <Card padding="lg" style={{ gap: spacing.lg }}>
          <TextField label={t('spot.hourlyRate')} value={hourly} onChangeText={setHourly} keyboardType="decimal-pad" maxLength={5}
            error={hourlyInvalid ? t('spot.invalidPrice') : undefined} />
          <TextField label={t('spot.dailyRate')} value={daily} onChangeText={setDaily} keyboardType="decimal-pad" maxLength={6} />
          <View style={{ gap: spacing.sm }}>
            <AppText variant="label" color="textSecondary">{t('spot.days')}</AppText>
            <View style={{ flexDirection: row, flexWrap: 'wrap', gap: spacing.xs }}>
              {names.map((name, day) => {
                const on = weekdays.includes(day);
                return (
                  <PressableScale key={day} onPress={() => toggleDay(day)} accessibilityRole="checkbox" accessibilityState={{ checked: on }}
                    style={{ paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.pill, backgroundColor: on ? colors.brand : colors.surfaceAlt }}>
                    <AppText variant="label" style={{ color: on ? colors.onBrand : colors.textSecondary }}>{name}</AppText>
                  </PressableScale>
                );
              })}
            </View>
          </View>
          <StepperRow icon={<Clock3 size={18} color={colors.textSecondary} />} label={t('spot.from')} value={shown(from)}
            onMinus={() => setFrom((m) => Math.max(0, m - 30))} onPlus={() => setFrom((m) => Math.min(until - 60, m + 30))} minusDisabled={from <= 0} plusDisabled={from >= until - 60} />
          <StepperRow icon={<Clock3 size={18} color={colors.textSecondary} />} label={t('spot.until')} value={shown(until)}
            onMinus={() => setUntil((m) => Math.max(from + 60, m - 30))} onPlus={() => setUntil((m) => Math.min(1440, m + 30))} minusDisabled={until <= from + 60} plusDisabled={until >= 1440} />
        </Card>

        <Card padding="lg" style={{ gap: spacing.md }}>
          <SwitchRow label={t('spot.covered')} description={t('spot.coveredDescription')} value={covered} onValueChange={setCovered} />
          <SwitchRow label={t('spot.van')} description={t('spot.vanDescription')} value={van} onValueChange={setVan} />
          <SwitchRow label={t('spot.instant')} description={t('spot.instantDescription')} value={instantBook} onValueChange={setInstantBook} />
        </Card>

        {createSpot.isError ? <InlineNotice tone="danger" title={t('common.somethingWrong')} body={errorMessage(createSpot.error)} /> : null}
        <AppButton label={t('spot.publish')} onPress={publish} loading={createSpot.isPending} disabled={!canPublish} />
      </View>
    </Screen>
  );
}
