import { ScrollView, View } from 'react-native';
import { AppButton, AppText, BottomSheet } from '@/components/ui';
import { useLocale } from '@/hooks/useLocale';
import { EV_CONNECTOR_TYPES, EV_STATION_STATUSES } from '@/types';
import { useEvStationsStore } from '@/store/evStationsStore';

export function EvFiltersSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { t, row } = useLocale();
  const filters = useEvStationsStore((s) => s.filters);
  const setFilters = useEvStationsStore((s) => s.setFilters);
  return <BottomSheet visible={visible} onClose={onClose} title={t('ev.filters')}>
    <ScrollView style={{ maxHeight: 400 }} contentContainerStyle={{ gap: 12 }}>
      <AppText weight="bold">{t('ev.connectorType')}</AppText>
      <View style={{ flexDirection: row, flexWrap: 'wrap', gap: 8 }}>
        {[undefined, ...EV_CONNECTOR_TYPES].map((value) => <AppButton key={value ?? 'all'} size="sm" fullWidth={false} variant={filters.connectorType === value ? 'primary' : 'secondary'} label={value ? t(`ev.connector.${value}`) : t('ev.allConnectors')} onPress={() => setFilters({ ...filters, connectorType: value })} />)}
      </View>
      <AppText weight="bold">{t('ev.minPower')}</AppText>
      <View style={{ flexDirection: row, flexWrap: 'wrap', gap: 8 }}>
        {[undefined, 22, 50, 100, 150].map((value) => <AppButton key={value ?? 'all'} size="sm" fullWidth={false} variant={filters.minPowerKw === value ? 'primary' : 'secondary'} label={value ? `${value}+ kW` : t('ev.anyPower')} onPress={() => setFilters({ ...filters, minPowerKw: value })} />)}
      </View>
      <AppText weight="bold">{t('ev.statusLabel')}</AppText>
      <View style={{ flexDirection: row, flexWrap: 'wrap', gap: 8 }}>
        {[undefined, ...EV_STATION_STATUSES].map((value) => <AppButton key={value ?? 'all'} size="sm" fullWidth={false} variant={filters.status === value ? 'primary' : 'secondary'} label={value ? t(`ev.status.${value}`) : t('ev.allStatuses')} onPress={() => setFilters({ ...filters, status: value })} />)}
      </View>
      <AppButton label={t('ev.reset')} size="sm" variant="ghost" onPress={() => setFilters({})} />
      <AppButton label={t('ev.close')} size="sm" onPress={onClose} />
    </ScrollView>
  </BottomSheet>;
}
