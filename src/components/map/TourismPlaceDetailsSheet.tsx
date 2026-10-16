import { useState } from 'react';
import { Linking, ScrollView, View } from 'react-native';
import { AppButton, AppText, BottomSheet } from '@/components/ui';
import { useLocale } from '@/hooks/useLocale';
import type { TourismPlace } from '@/types';

function safeUrl(value?: string): string | undefined {
  if (!value) return;
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : undefined;
  } catch {
    return;
  }
}

const safePhone = (value?: string): string | undefined => {
  const digits = value?.replace(/\D/g, '').length ?? 0;
  return value && /^\+?[0-9][0-9 ()-]{4,30}[0-9]$/.test(value) && digits >= 7 && digits <= 15
    ? value.replace(/[ ()-]/g, '')
    : undefined;
};

export function TourismPlaceDetailsSheet({
  place,
  onClose,
  onRoute,
}: {
  place?: TourismPlace;
  onClose: () => void;
  onRoute: (place: TourismPlace) => void;
}) {
  const { t, locale, row, dateLocale } = useLocale();
  const [linkError, setLinkError] = useState(false);
  const name = place ? (locale === 'ar' ? place.nameAr : place.nameEn) : undefined;
  const description = place?.descriptionAr;
  const locationNote = place?.locationNoteAr;
  const phone = safePhone(place?.phone);
  const website = safeUrl(place?.website);
  const sourceLinks = place?.sources.map((source) => ({ ...source, href: safeUrl(source.url) })).filter((source) => source.href) ?? [];
  const open = async (url: string) => {
    setLinkError(false);
    try {
      await Linking.openURL(url);
    } catch {
      setLinkError(true);
    }
  };
  const rows = place ? [
    [t('tourism.categories'), place.categories.map((category) => t(`tourism.category.${category}`)).join(' · ')],
    [t('tourism.description'), description],
    [t('tourism.city'), place.cityAr],
    [t('tourism.region'), place.regionAr],
    [t('tourism.address'), place.addressAr],
    [t('tourism.phone'), place.phone],
    [t('tourism.source'), sourceLinks.map((source) => source.publisher).join(' · ')],
    [t('tourism.lastChecked'), new Date(place.sourcesCheckedOn).toLocaleDateString(dateLocale)],
  ] : [];
  return <BottomSheet visible={Boolean(place)} onClose={onClose} title={name} subtitle={t('tourism.details')}>
    {place ? <ScrollView style={{ maxHeight: 460 }} contentContainerStyle={{ gap: 12 }}>
      {rows.filter(([, value]) => Boolean(value)).map(([label, value], index) => <View key={index} style={{ gap: 2 }}>
        <AppText variant="caption" color="textSecondary">{label}</AppText>
        <AppText>{value}</AppText>
      </View>)}
      {locationNote ? <View style={{ gap: 2 }}>
        <AppText variant="caption" color="warningText">{t('tourism.coordinateWarning')}</AppText>
        <AppText>{locationNote}</AppText>
      </View> : null}
      <AppText variant="caption" color="textSecondary">{t('tourism.entranceDisclaimer')}</AppText>
      <AppText variant="caption" color="textSecondary">{t('tourism.disclaimer')}</AppText>
      {linkError ? <AppText variant="caption" color="danger">{t('tourism.linkFailed')}</AppText> : null}
      <AppButton label={t('tourism.route')} size="sm" onPress={() => onRoute(place)} />
      <View style={{ flexDirection: row, gap: 8, flexWrap: 'wrap' }}>
        {phone ? <AppButton label={t('tourism.call')} size="sm" variant="secondary" fullWidth={false} onPress={() => void open(`tel:${phone}`)} /> : null}
        {website ? <AppButton label={t('tourism.website')} size="sm" variant="secondary" fullWidth={false} onPress={() => void open(website)} /> : null}
        {sourceLinks.map((source, index) => (
          <AppButton
            key={`${source.url}-${index}`}
            label={index === 0 ? t('tourism.openSource') : t('tourism.openSourceNumber', { count: index + 1 })}
            size="sm"
            variant="secondary"
            fullWidth={false}
            onPress={() => void open(source.href!)}
          />
        ))}
      </View>
      <AppButton label={t('tourism.close')} variant="ghost" size="sm" onPress={onClose} />
    </ScrollView> : null}
  </BottomSheet>;
}
