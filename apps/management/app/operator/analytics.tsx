import { View } from 'react-native';
import { AppHeader, AppText, Card, EmptyState, ErrorState, Screen, SkeletonGroup } from '@parkflow/client/components/ui';
import { useLocale } from '@parkflow/client/hooks/useLocale';
import { useQuery } from '@tanstack/react-query';
import { api } from '@parkflow/client/services/http/apiClient';

interface OperatorAnalyticsResponse {
  zones: Array<{
    zoneId: string;
    name: string;
    nameAr: string;
    reservationConversion: { checkedIn: number; total: number };
    feedQuality: { samples: number };
  }>;
}

export default function OperatorAnalytics() {
  const { t, locale } = useLocale();
  const { data, isPending, isError, error, refetch } = useQuery({ queryKey: ['operator', 'analytics'], queryFn: () => api<OperatorAnalyticsResponse>('/operator/analytics') });
  if (isPending) return <Screen><SkeletonGroup count={2} /></Screen>;
  return <Screen><AppHeader title={t('operator.analyticsTitle')} />
    {isError ? <ErrorState error={error} onRetry={() => { void refetch(); }} /> : (data?.zones ?? []).length === 0 ? <EmptyState title={t('operator.noZones')} body={t('operator.noZonesBody')} /> : <View style={{ gap: 12 }}>
      {(data?.zones ?? []).map(z => <Card key={z.zoneId}>
        <AppText variant="title">{locale === 'ar' ? z.nameAr : z.name}</AppText>
        <AppText>{t('operator.analyticsReservations', { checkedIn: z.reservationConversion.checkedIn, total: z.reservationConversion.total })}</AppText>
        <AppText>{t('operator.analyticsSamples', { count: z.feedQuality.samples })}</AppText>
      </Card>)}
    </View>}
  </Screen>;
}
