import { useState } from 'react';
import { Linking, ScrollView, View } from 'react-native';
import { AppButton, AppText, BottomSheet } from '@/components/ui';
import { useLocale } from '@/hooks/useLocale';
import type { CarServiceBusiness } from '@/types';

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

const pricingText = (value: unknown): string | undefined => {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return undefined;
  }
};

export function CarServiceDetailsSheet({
  service,
  onClose,
  onRoute,
}: {
  service?: CarServiceBusiness;
  onClose: () => void;
  onRoute: (service: CarServiceBusiness) => void;
}) {
  const { t, locale, row, dateLocale } = useLocale();
  const [linkError, setLinkError] = useState(false);
  const name = service ? (locale === 'ar' ? service.nameAr : service.nameEn) : undefined;
  const address = service ? (locale === 'ar' ? service.addressAr : service.addressEn) : undefined;
  const services = service ? (locale === 'ar' ? service.servicesAr : service.servicesEn) : [];
  const coordinateNote = service ? (locale === 'ar' ? service.coordinateNoteAr : service.coordinateNoteEn) : undefined;
  const phone = safePhone(service?.phone);
  const website = safeUrl(service?.website);
  const source = safeUrl(service?.sourceUrl);
  const secondarySource = safeUrl(service?.secondarySourceUrl);
  const price = pricingText(service?.pricing);
  const open = async (url: string) => {
    setLinkError(false);
    try {
      await Linking.openURL(url);
    } catch {
      setLinkError(true);
    }
  };
  const rows = service ? [
    [t('carServices.categories'), service.categories.map((category) => t(`carServices.category.${category}`)).join(' · ')],
    [t('carServices.address'), address],
    [t('carServices.phone'), service.phone],
    [t('carServices.hours'), service.openingHoursText],
    [t('carServices.services'), services.join(' · ')],
    [t('carServices.pricing'), price ?? t('carServices.pricingUnavailable')],
    [t('carServices.source'), service.sourceName],
    [t('carServices.lastChecked'), new Date(service.lastCheckedAt).toLocaleDateString(dateLocale)],
  ] : [];
  return <BottomSheet visible={Boolean(service)} onClose={onClose} title={name} subtitle={t('carServices.details')}>
    {service ? <ScrollView style={{ maxHeight: 460 }} contentContainerStyle={{ gap: 12 }}>
      {rows.filter(([, value]) => Boolean(value)).map(([label, value], index) => <View key={index} style={{ gap: 2 }}>
        <AppText variant="caption" color="textSecondary">{label}</AppText>
        <AppText>{value}</AppText>
      </View>)}
      {coordinateNote ? <View style={{ gap: 2 }}>
        <AppText variant="caption" color="warningText">{t('carServices.coordinateWarning')}</AppText>
        <AppText>{coordinateNote}</AppText>
      </View> : null}
      <AppText variant="caption" color="textSecondary">{t('carServices.disclaimer')}</AppText>
      {linkError ? <AppText variant="caption" color="danger">{t('carServices.linkFailed')}</AppText> : null}
      <AppButton label={t('carServices.route')} size="sm" onPress={() => onRoute(service)} />
      <View style={{ flexDirection: row, gap: 8, flexWrap: 'wrap' }}>
        {phone ? <AppButton label={t('carServices.call')} size="sm" variant="secondary" fullWidth={false} onPress={() => void open(`tel:${phone}`)} /> : null}
        {website ? <AppButton label={t('carServices.website')} size="sm" variant="secondary" fullWidth={false} onPress={() => void open(website)} /> : null}
        {source ? <AppButton label={t('carServices.openSource')} size="sm" variant="secondary" fullWidth={false} onPress={() => void open(source)} /> : null}
        {secondarySource ? <AppButton label={t('carServices.openSecondarySource')} size="sm" variant="secondary" fullWidth={false} onPress={() => void open(secondarySource)} /> : null}
      </View>
      <AppButton label={t('carServices.close')} variant="ghost" size="sm" onPress={onClose} />
    </ScrollView> : null}
  </BottomSheet>;
}
