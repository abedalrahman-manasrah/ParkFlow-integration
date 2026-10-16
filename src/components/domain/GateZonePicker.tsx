import { useState } from 'react';
import { View } from 'react-native';
import { AppText, Card, Divider, ListItem, SearchField, Skeleton } from '@/components/ui';
import { useLocale } from '@/hooks/useLocale';
import { spacing } from '@/theme/spacing';
import type { GateZone } from '@/types';

/** Pick the lot this gate or patrol works at; collapses to one line once chosen. */
export function GateZonePicker({ zones, loading, value, onChange }: {
  zones: GateZone[]; loading?: boolean; value?: GateZone; onChange: (zone: GateZone | undefined) => void;
}) {
  const { t, locale } = useLocale();
  const [search, setSearch] = useState('');
  const name = (zone: GateZone) => (locale === 'ar' ? zone.nameAr : zone.name);
  if (loading) return <Skeleton height={64} />;
  if (value) {
    return (
      <Card padding="lg" style={{ paddingVertical: spacing.xs }}>
        <ListItem title={name(value)} subtitle={`${value.code} · ${locale === 'ar' ? value.cityAr : value.city}`} onPress={() => onChange(undefined)}
          trailing={<AppText variant="label" color="brand">{t('gate.changeLot')}</AppText>} />
      </Card>
    );
  }
  const query = search.trim().toLowerCase();
  const shown = zones.filter((z) => !query || `${z.code} ${z.name} ${z.nameAr} ${z.city}`.toLowerCase().includes(query)).slice(0, 30);
  return (
    <View style={{ gap: spacing.sm }}>
      <AppText variant="label" color="textSecondary">{t('gate.chooseLot')}</AppText>
      <SearchField value={search} onChangeText={setSearch} placeholder={t('gate.searchLot')} />
      <Card padding="lg" style={{ paddingVertical: spacing.xs }}>
        {shown.length === 0 ? <AppText variant="bodySm" color="textSecondary" style={{ paddingVertical: spacing.md }}>{t('gate.noLots')}</AppText>
          : shown.map((zone, index) => (
            <View key={zone.id}>
              {index ? <Divider /> : null}
              <ListItem title={name(zone)} subtitle={`${zone.code} · ${locale === 'ar' ? zone.cityAr : zone.city}`} showChevron onPress={() => onChange(zone)} />
            </View>
          ))}
      </Card>
    </View>
  );
}
