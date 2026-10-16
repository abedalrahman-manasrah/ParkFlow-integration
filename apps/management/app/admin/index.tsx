import { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Activity, Flag, History, MapPinned, ShieldCheck, Users, XCircle } from 'lucide-react-native';

import { AdminAudit, AdminReviews, AdminUsers } from '../../src/components/admin/index';
import { AppButton, AppHeader, AppText, BottomSheet, Card, ErrorState, InlineNotice, Screen, Segmented, StatusBadge } from '@parkflow/client/components/ui';
import { useLocale } from '@parkflow/client/hooks/useLocale';
import { services } from '@parkflow/client/services';
import type { AdminZone, OperatorAvailability } from '@parkflow/contracts/services';
import { useAuthStore } from '@parkflow/client/store/authStore';
import { useTheme } from '@parkflow/client/theme/ThemeProvider';
import { spacing } from '@parkflow/design/spacing';
import { radius } from '@parkflow/design/radius';

type AdminTab = 'overview' | 'users' | 'operations' | 'reports' | 'appeals' | 'audit';

function StatCard({ icon, value, label }: { icon: React.ReactNode; value: number | string; label: string }) {
  const { colors } = useTheme();
  return (
    <Card padding="lg" style={{ flex: 1, minWidth: 145, gap: spacing.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <View style={{ width: 32, height: 32, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.brandSofter }}>{icon}</View>
        <AppText variant="h2" numeric>{value}</AppText>
      </View>
      <AppText variant="caption" color="textSecondary">{label}</AppText>
    </Card>
  );
}

export default function AdminHome() {
  const router = useRouter();
  const { colors } = useTheme();
  const { t, locale, row } = useLocale();
  const currentUser = useAuthStore((state) => state.user);
  const queryClient = useQueryClient();
  const isAdmin = currentUser?.role === 'ADMIN';
  const [tab, setTab] = useState<AdminTab>('overview');
  const [zoneTarget, setZoneTarget] = useState<AdminZone | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const summaryQuery = useQuery({ queryKey: ['admin', 'summary'], queryFn: services.admin.summary, enabled: isAdmin });
  const zonesQuery = useQuery({ queryKey: ['admin', 'zones'], queryFn: services.admin.zones, enabled: isAdmin });
  const updateAvailability = useMutation({
    mutationFn: ({ zoneId, availability }: { zoneId: string; availability: OperatorAvailability }) => services.admin.updateAvailability(zoneId, { availability, source: 'ADMIN', confidence: 1 }),
    onSuccess: () => {
      setZoneTarget(null);
      setNotice(locale === 'ar' ? 'تم تسجيل توفر المنطقة ومشاركته مع المستخدمين.' : 'Zone availability was recorded and shared with drivers.');
      void queryClient.invalidateQueries({ queryKey: ['admin'] });
      void queryClient.invalidateQueries({ queryKey: ['zones'] });
    },
  });

  const refresh = () => { void Promise.all([summaryQuery.refetch(), zonesQuery.refetch()]); };

  if (!isAdmin) return <Screen><ErrorState title={t('admin.accessRequired')} error={new Error(t('admin.accessBody'))} /></Screen>;
  if (summaryQuery.isPending && zonesQuery.isPending) return <Screen><AppHeader title={t('admin.title')} /><AppText color="textSecondary">{t('common.loading')}…</AppText></Screen>;
  if (summaryQuery.error && !summaryQuery.data) return <Screen><ErrorState error={summaryQuery.error} onRetry={refresh} /></Screen>;

  const summary = summaryQuery.data;
  const zones = zonesQuery.data ?? [];

  return (
    <Screen contentContainerStyle={{ gap: spacing.xl }}>
      <AppHeader title={t('admin.title')} subtitle={t('admin.subtitle')} leading="back" trailing={<AppButton label={t('admin.refresh')} size="sm" fullWidth={false} variant="secondary" onPress={refresh} loading={summaryQuery.isFetching || zonesQuery.isFetching} />} />
      <View style={{ flexDirection: row, flexWrap: 'wrap', gap: spacing.sm }}>
        <AppButton label={locale === 'ar' ? 'إدارة المواقف والمالكين' : 'Parking & owners'} variant="secondary" fullWidth={false} onPress={() => router.push('/admin/manage')} />
        <AppButton label={locale === 'ar' ? 'المظهر والمحتوى' : 'Appearance & content'} variant="secondary" fullWidth={false} onPress={() => router.push('/admin/appearance')} />
        <AppButton label={locale === 'ar' ? 'توثيق المركبات' : 'Vehicle verification'} variant="secondary" fullWidth={false} onPress={() => router.push('/admin/vehicles')} />
      </View>
      {notice ? <InlineNotice tone="success" title={t('common.done')} body={notice} /> : null}
      <Segmented
        variant="inset"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'overview', label: t('admin.overview') },
          { value: 'users', label: t('admin.users'), badge: summary?.activeUsers },
          { value: 'operations', label: t('admin.zones'), badge: summary?.activeZones },
          { value: 'reports', label: t('admin.reports'), badge: summary?.visibleReports },
          { value: 'appeals', label: t('admin.appeals'), badge: summary?.openAppeals },
          { value: 'audit', label: t('admin.audit') },
        ]}
      />

      {tab === 'overview' ? (
        <View style={{ gap: spacing.xl }}>
          <View style={{ flexDirection: row, flexWrap: 'wrap', gap: spacing.md }}>
            <StatCard icon={<Users size={18} color={colors.brand} />} value={summary?.activeUsers ?? 0} label={t('admin.activeUsers')} />
            <StatCard icon={<XCircle size={18} color={colors.danger} />} value={summary?.suspendedUsers ?? 0} label={t('admin.suspendedUsers')} />
            <StatCard icon={<MapPinned size={18} color={colors.brand} />} value={summary?.activeZones ?? 0} label={t('admin.activeZones')} />
            <StatCard icon={<Flag size={18} color={colors.warning} />} value={summary?.visibleReports ?? 0} label={t('admin.pendingReports')} />
            <StatCard icon={<ShieldCheck size={18} color={colors.info} />} value={summary?.openAppeals ?? 0} label={t('admin.pendingAppeals')} />
            <StatCard icon={<Activity size={18} color={colors.success} />} value={`${summary?.checkedInReservations ?? 0}/${summary?.totalReservations ?? 0}`} label={t('admin.checkedInReservations')} />
          </View>
          <Card padding="lg" tone="brand" style={{ gap: spacing.sm }}>
            <AppText variant="h3">{t('admin.controlCenter')}</AppText>
            <AppText variant="bodySm" color="textSecondary">{t('admin.controlCenterBody')}</AppText>
            <View style={{ flexDirection: row, flexWrap: 'wrap', gap: spacing.sm }}>
              <AppButton label={t('admin.users')} size="sm" fullWidth={false} variant="secondary" onPress={() => setTab('users')} />
              <AppButton label={t('admin.reports')} size="sm" fullWidth={false} variant="secondary" onPress={() => setTab('reports')} />
              <AppButton label={t('admin.appeals')} size="sm" fullWidth={false} variant="secondary" onPress={() => setTab('appeals')} />
            </View>
          </Card>
        </View>
      ) : null}

      {tab === 'users' ? <AdminUsers /> : null}
      {tab === 'reports' ? <AdminReviews kind="reports" /> : null}
      {tab === 'appeals' ? <AdminReviews kind="appeals" /> : null}
      {tab === 'audit' ? <AdminAudit /> : null}
      {tab === 'operations' ? (
        <View style={{ gap: spacing.md }}>
          {zonesQuery.error ? <ErrorState compact error={zonesQuery.error} onRetry={() => { void zonesQuery.refetch(); }} /> : null}
          {zonesQuery.isPending ? <AppText color="textSecondary">{t('common.loading')}…</AppText> : null}
          {!zonesQuery.isPending && !zonesQuery.error && zones.length === 0 ? <Card padding="lg"><AppText color="textSecondary">{t('admin.noZones')}</AppText></Card> : zones.map((zone) => (
            <Card key={zone.id} padding="lg" style={{ gap: spacing.md }}>
              <View style={{ flexDirection: row, alignItems: 'center', gap: spacing.md }}>
                <View style={{ flex: 1, gap: spacing.xs }}>
                  <AppText variant="title">{locale === 'ar' ? zone.nameAr : zone.name}</AppText>
                  <AppText variant="caption" color="textSecondary">{zone.code} · {locale === 'ar' ? zone.cityAr : zone.city}{zone.capacity ? ` · ${zone.capacity}` : ''}</AppText>
                </View>
                <StatusBadge label={zone.active ? t('admin.status.ACTIVE') : t('admin.status.SUSPENDED')} tone={zone.active ? 'success' : 'neutral'} size="sm" />
              </View>
              <AppButton label={t('admin.setAvailability')} size="sm" fullWidth={false} variant="secondary" onPress={() => setZoneTarget(zone)} />
            </Card>
          ))}
        </View>
      ) : null}

      <BottomSheet visible={Boolean(zoneTarget)} onClose={() => setZoneTarget(null)} title={t('admin.setAvailability')} subtitle={zoneTarget ? (locale === 'ar' ? zoneTarget.nameAr : zoneTarget.name) : undefined}>
        <View style={{ gap: spacing.md }}>
          {(['available', 'limited', 'full'] as const).map((availability) => (
            <AppButton key={availability} label={t(`admin.${availability}` as never)} variant={availability === 'full' ? 'danger' : availability === 'limited' ? 'secondary' : 'primary'} loading={updateAvailability.isPending} onPress={() => zoneTarget && updateAvailability.mutate({ zoneId: zoneTarget.id, availability })} />
          ))}
          <AppButton label={t('common.cancel')} variant="ghost" onPress={() => setZoneTarget(null)} disabled={updateAvailability.isPending} />
        </View>
      </BottomSheet>
      {updateAvailability.error ? <InlineNotice tone="danger" title={t('admin.updateFailed')} /> : null}
      <View style={{ alignItems: 'center', gap: spacing.xs }}><History size={18} color={colors.textTertiary} /><AppText variant="caption" color="textTertiary" align="center">{t('admin.audit')}</AppText></View>
    </Screen>
  );
}
