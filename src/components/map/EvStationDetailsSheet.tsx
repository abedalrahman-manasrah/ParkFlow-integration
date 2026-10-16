import { useState } from 'react';
import { Linking, ScrollView, View } from 'react-native';
import { AppButton, AppText, BottomSheet } from '@/components/ui';
import { useLocale } from '@/hooks/useLocale';
import type { EvChargingStation } from '@/types';

function safeSource(value?: string): string | undefined {
  if (!value) return;
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : undefined; } catch { return; }
}
export function EvStationDetailsSheet({ station, onClose, onRoute }: { station?: EvChargingStation; onClose: () => void; onRoute: (station: EvChargingStation) => void }) {
  const { t, row, dateLocale } = useLocale();
  const [linkError, setLinkError] = useState(false);
  const source = safeSource(station?.sourceUrl);
  const phoneDigits = station?.phone?.replace(/\D/g, '').length ?? 0;
  const phone = station?.phone && /^\+?[0-9][0-9 ()-]{4,30}[0-9]$/.test(station.phone) && phoneDigits >= 7 && phoneDigits <= 15 ? station.phone.replace(/[ ()-]/g, '') : undefined;
  const open = async (url: string) => { setLinkError(false); try { await Linking.openURL(url); } catch { setLinkError(true); } };
  const rows = station ? [
    [t('ev.operator'), station.operatorName], ['', [station.address, station.city].filter(Boolean).join(' · ')],
    [t('ev.pricing'), station.pricingText], [t('ev.hours'), station.openingHoursText],
    [t('ev.call'), phone ? station.phone : undefined], [t('ev.source'), station.sourceName],
    [t('ev.verified'), station.lastVerifiedAt ? new Date(station.lastVerifiedAt).toLocaleDateString(dateLocale) : undefined],
  ] : [];
  return <BottomSheet visible={Boolean(station)} onClose={onClose} title={station?.name} subtitle={t('ev.station')}>
    {station ? <ScrollView style={{ maxHeight: 420 }} contentContainerStyle={{ gap: 12 }}>
      <AppText variant="caption" color="textSecondary">{t('ev.statusLabel')}</AppText>
      <AppText weight="bold">{t(`ev.status.${station.status}`)}</AppText>
      <AppText variant="caption" color="textSecondary">{t('ev.accessLabel')}</AppText>
      <AppText>{t(`ev.access.${station.accessType}`)}</AppText>
      {rows.filter(([, value]) => Boolean(value)).map(([label, value], i) => <View key={i} style={{ gap: 2 }}>
        {label ? <AppText variant="caption" color="textSecondary">{label}</AppText> : null}<AppText>{value}</AppText>
      </View>)}
      {station.pricingText ? <AppText variant="caption" color="textSecondary">{t('ev.pricingNote')}</AppText> : null}
      {station.connectors.length ? <AppText variant="caption" color="textSecondary">{t('ev.connector')} · {t('ev.power')}</AppText> : null}
      {station.connectors.map((c, i) => <View key={i} style={{ flexDirection: row, justifyContent: 'space-between', gap: 8 }}>
        <AppText weight="bold">{t(`ev.connector.${c.type}`)}</AppText><AppText variant="caption">{t('ev.quantity', { count: c.quantity, power: c.powerKw })}</AppText>
      </View>)}
      <AppText variant="caption" color="textSecondary">{t('ev.liveNote')}</AppText>
      {linkError ? <AppText variant="caption" color="danger">{t('ev.linkFailed')}</AppText> : null}
      <AppButton label={t('ev.route')} size="sm" onPress={() => onRoute(station)} />
      <View style={{ flexDirection: row, gap: 8 }}>
        {phone ? <AppButton label={t('ev.call')} size="sm" variant="secondary" style={{ flex: 1 }} onPress={() => void open(`tel:${phone}`)} /> : null}
        {source ? <AppButton label={t('ev.openSource')} size="sm" variant="secondary" style={{ flex: 1 }} onPress={() => void open(source)} /> : null}
      </View>
      <AppButton label={t('ev.close')} variant="ghost" size="sm" onPress={onClose} />
    </ScrollView> : null}
  </BottomSheet>;
}
