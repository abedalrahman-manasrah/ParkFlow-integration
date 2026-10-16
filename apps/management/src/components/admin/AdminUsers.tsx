import { useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Search, UserRound, UserRoundCheck, UserRoundX } from 'lucide-react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  AppButton,
  AppText,
  BottomSheet,
  Card,
  ErrorState,
  InlineNotice,
  PressableScale,
  StatusBadge,
  TextField,
} from '@parkflow/client/components/ui';
import { useLocale } from '@parkflow/client/hooks/useLocale';
import { services } from '@parkflow/client/services';
import type { AdminRole, AdminStatus, AdminUser } from '@parkflow/contracts/services';
import { useAuthStore } from '@parkflow/client/store/authStore';
import { useTheme } from '@parkflow/client/theme/ThemeProvider';
import { radius } from '@parkflow/design/radius';
import { spacing } from '@parkflow/design/spacing';
import { formatDate } from '@parkflow/client/utils/time';
import { errorMessage } from '@parkflow/client/utils/errors';

type Role = Exclude<AdminRole, undefined>;
type EditStep = 'edit' | 'review';

const PAGE_SIZE = 20;
const roles: Role[] = ['USER', 'PARKING_OPERATOR', 'ENFORCEMENT_OFFICER', 'ADMIN'];
const statuses: AdminStatus[] = ['ACTIVE', 'SUSPENDED'];

const labels: Record<string, { en: string; ar: string }> = {
  USER: { en: 'User', ar: 'مستخدم' },
  PARKING_OPERATOR: { en: 'Parking operator', ar: 'مشغّل مواقف' },
  ENFORCEMENT_OFFICER: { en: 'Enforcement officer', ar: 'مراقب مواقف' },
  ADMIN: { en: 'Admin', ar: 'مسؤول' },
  ACTIVE: { en: 'Active', ar: 'نشط' },
  SUSPENDED: { en: 'Suspended', ar: 'موقوف' },
};

function label(value: string, locale: string) {
  const entry = labels[value];
  return entry ? entry[locale === 'ar' ? 'ar' : 'en'] : value;
}

function userName(user: AdminUser) {
  return user.fullName || user.email || user.phone || user.id.slice(0, 8);
}

function roleTone(role: Role): 'brand' | 'info' | 'warning' | 'danger' {
  if (role === 'ADMIN') return 'danger';
  if (role === 'PARKING_OPERATOR') return 'brand';
  if (role === 'ENFORCEMENT_OFFICER') return 'warning';
  return 'info';
}

export function AdminUsers() {
  const { colors } = useTheme();
  const { locale, dateLocale, row } = useLocale();
  const queryClient = useQueryClient();
  const currentUser = useAuthStore((state) => state.user);
  const currentUserId = currentUser?.id;
  const [search, setSearch] = useState('');
  const [submittedSearch, setSubmittedSearch] = useState('');
  const usersQueryKey = ['admin', 'users', currentUserId, submittedSearch] as const;
  const usersQuery = useQuery({
    queryKey: usersQueryKey,
    queryFn: () => services.admin.users(submittedSearch),
    enabled: currentUser?.role === 'ADMIN',
  });

  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [selected, setSelected] = useState<AdminUser | null>(null);
  const [draftRole, setDraftRole] = useState<Role>('USER');
  const [draftStatus, setDraftStatus] = useState<AdminStatus>('ACTIVE');
  const [step, setStep] = useState<EditStep>('edit');
  const [notice, setNotice] = useState<{ tone: 'success' | 'danger'; body: string } | null>(null);

  const updateUser = useMutation({
    mutationFn: async ({ id, role, status }: { id: string; role: Role; status: AdminStatus }) => {
      if (id === currentUserId) throw new Error(locale === 'ar' ? 'لا يمكنك تعديل حسابك.' : 'You cannot change your own account.');
      return services.admin.updateUser(id, { role, status });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      void queryClient.invalidateQueries({ queryKey: ['admin', 'summary'] });
      void queryClient.invalidateQueries({ queryKey: ['admin', 'audit'] });
      setNotice({ tone: 'success', body: locale === 'ar' ? 'تم تحديث المستخدم.' : 'User updated successfully.' });
      setSelected(null);
      setStep('edit');
    },
    onError: (error) => setNotice({ tone: 'danger', body: errorMessage(error) }),
  });

  const users = usersQuery.data ?? [];
  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    if (!query) return users;
    return users.filter((item) =>
      [item.fullName, item.email, item.phone, item.id].some((value) => value?.toLocaleLowerCase().includes(query)),
    );
  }, [search, users]);
  const visibleUsers = filtered.slice(0, visibleCount);
  const hasMore = visibleCount < filtered.length;
  const activeCount = users.filter((item) => item.status === 'ACTIVE').length;
  const suspendedCount = users.filter((item) => item.status === 'SUSPENDED').length;

  const submitSearch = () => {
    const next = search.trim();
    setSubmittedSearch(next);
    setVisibleCount(PAGE_SIZE);
    if (next === submittedSearch) void usersQuery.refetch();
  };

  const openEditor = (user: AdminUser) => {
    setSelected(user);
    setDraftRole(user.role);
    setDraftStatus(user.status);
    setStep('edit');
    updateUser.reset();
  };

  if (currentUser?.role !== 'ADMIN') return <ErrorState title={locale === 'ar' ? 'يتطلب صلاحية المسؤول' : 'Admin access required'} />;
  if (usersQuery.isPending) return <ActivityIndicator color={colors.brand} style={styles.loader} />;
  if (usersQuery.error && !users.length) return <ErrorState error={usersQuery.error} onRetry={() => void usersQuery.refetch()} />;

  const renderChoice = (value: string, active: boolean, onPress: () => void) => (
    <PressableScale
      key={value}
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected: active }}
      style={[styles.choice, { borderColor: active ? colors.brand : colors.border, backgroundColor: active ? colors.brandSoft : colors.surface }]}
    >
      <AppText variant="bodySm" style={{ color: active ? colors.successText : colors.text }}>{label(value, locale)}</AppText>
    </PressableScale>
  );

  return (
    <View style={styles.root}>
      {notice ? <InlineNotice tone={notice.tone} title={notice.tone === 'success' ? (locale === 'ar' ? 'تم الحفظ' : 'Saved') : (locale === 'ar' ? 'تعذر الحفظ' : 'Unable to save')} body={notice.body} /> : null}
      {usersQuery.error && users.length ? <InlineNotice tone="danger" title={locale === 'ar' ? 'تعذر تحديث القائمة' : 'Could not refresh users'} body={errorMessage(usersQuery.error)} /> : null}
      <View style={[styles.stats, { flexDirection: row }]}>
        <Card padding="lg" style={styles.stat}><UserRoundCheck size={18} color={colors.success} /><AppText variant="h2" numeric>{activeCount}</AppText><AppText variant="caption" color="textSecondary">{locale === 'ar' ? 'نشط' : 'Active'}</AppText></Card>
        <Card padding="lg" style={styles.stat}><UserRoundX size={18} color={colors.danger} /><AppText variant="h2" numeric>{suspendedCount}</AppText><AppText variant="caption" color="textSecondary">{locale === 'ar' ? 'موقوف' : 'Suspended'}</AppText></Card>
      </View>

      <TextField
        label={locale === 'ar' ? 'البحث عن مستخدم' : 'Search users'}
        value={search} maxLength={200} returnKeyType="search" onSubmitEditing={submitSearch}
        onChangeText={(value) => { setSearch(value); setVisibleCount(PAGE_SIZE); }}
        placeholder={locale === 'ar' ? 'الاسم أو البريد أو الهاتف' : 'Name, email, phone or ID'}
        leading={<Search size={20} color={colors.textTertiary} />}
      />
      <AppButton label={locale === 'ar' ? 'بحث' : 'Search'} variant="secondary" size="sm" onPress={submitSearch} disabled={usersQuery.isFetching || updateUser.isPending} />
      <AppText variant="caption" color="textSecondary">{locale === 'ar' ? 'تظهر أحدث ٢٠٠ حساب مطابق كحد أقصى. استخدم البحث للعثور على الحسابات الأقدم.' : 'Up to the latest 200 matching accounts are shown. Search to find older accounts.'}</AppText>
      <AppText variant="caption" color="textSecondary">{filtered.length} {locale === 'ar' ? 'نتيجة' : 'results'}</AppText>

      {visibleUsers.length === 0 ? <Card padding="lg"><AppText color="textSecondary">{locale === 'ar' ? 'لم يتم العثور على مستخدمين.' : 'No users found.'}</AppText></Card> : null}
      {visibleUsers.map((item) => {
        const own = item.id === currentUserId;
        return (
          <Card key={item.id} padding="lg" style={styles.userCard}>
            <View style={[styles.userHeading, { flexDirection: row }]}>
              <View style={[styles.avatar, { backgroundColor: colors.brandSoft }]}><UserRound size={20} color={colors.brand} /></View>
              <View style={styles.userCopy}>
                <AppText variant="title">{userName(item)}</AppText>
                <AppText variant="caption" color="textSecondary">{item.email ?? item.phone ?? item.id}</AppText>
                <AppText variant="caption" color="textTertiary">{locale === 'ar' ? 'انضم' : 'Joined'} {formatDate(item.createdAt, dateLocale)}</AppText>
              </View>
              <View style={styles.badges}>
                <StatusBadge label={label(item.role, locale)} tone={roleTone(item.role)} size="sm" />
                <StatusBadge label={label(item.status, locale)} tone={item.status === 'ACTIVE' ? 'success' : 'danger'} size="sm" />
              </View>
            </View>
            <AppButton label={own ? (locale === 'ar' ? 'حسابك' : 'Your account') : (locale === 'ar' ? 'إدارة المستخدم' : 'Manage user')} variant="secondary" size="sm" fullWidth={false} disabled={own} onPress={() => openEditor(item)} />
          </Card>
        );
      })}
      {hasMore ? <AppButton label={locale === 'ar' ? 'عرض المزيد' : 'Show more'} variant="ghost" size="sm" onPress={() => setVisibleCount((count) => count + PAGE_SIZE)} /> : null}

      <BottomSheet visible={selected !== null} onClose={() => { if (!updateUser.isPending) setSelected(null); }} title={selected ? userName(selected) : undefined} subtitle={step === 'edit' ? (locale === 'ar' ? 'اختر التغييرات ثم راجعها قبل الحفظ.' : 'Choose changes, then review before saving.') : (locale === 'ar' ? 'راجع التغييرات قبل التأكيد.' : 'Review these changes before confirming.')} scrollable>
        {selected ? step === 'edit' ? (
          <View style={styles.sheetContent}>
            <AppText variant="label" color="textSecondary">{locale === 'ar' ? 'الدور' : 'Role'}</AppText>
            <View style={styles.choiceWrap}>{roles.map((value) => renderChoice(value, draftRole === value, () => setDraftRole(value)))}</View>
            <AppText variant="label" color="textSecondary" style={styles.sectionLabel}>{locale === 'ar' ? 'الحالة' : 'Status'}</AppText>
            <View style={styles.choiceWrap}>{statuses.map((value) => renderChoice(value, draftStatus === value, () => setDraftStatus(value)))}</View>
            {selected.id === currentUserId ? <InlineNotice tone="warning" title={locale === 'ar' ? 'لا يمكن تعديل حسابك' : 'Your account cannot be changed'} /> : null}
            {updateUser.error ? <InlineNotice tone="danger" title={locale === 'ar' ? 'تعذر الحفظ' : 'Unable to save'} body={errorMessage(updateUser.error)} /> : null}
            <AppButton label={locale === 'ar' ? 'مراجعة التغييرات' : 'Review changes'} onPress={() => setStep('review')} disabled={selected.id === currentUserId || (draftRole === selected.role && draftStatus === selected.status)} />
          </View>
        ) : (
          <View style={styles.sheetContent}>
            <AppText variant="body" color="textSecondary">{locale === 'ar' ? 'سيتم تطبيق التغييرات التالية:' : 'The following changes will be applied:'}</AppText>
            <Card tone="outline" padding="lg" style={styles.reviewCard}>
              <View style={[styles.reviewRow, { flexDirection: row }]}><AppText variant="bodySm" color="textSecondary">{locale === 'ar' ? 'الدور' : 'Role'}</AppText><AppText variant="title">{label(selected.role, locale)} → {label(draftRole, locale)}</AppText></View>
              <View style={[styles.reviewRow, { flexDirection: row }]}><AppText variant="bodySm" color="textSecondary">{locale === 'ar' ? 'الحالة' : 'Status'}</AppText><AppText variant="title">{label(selected.status, locale)} → {label(draftStatus, locale)}</AppText></View>
            </Card>
            <View style={[styles.actions, { flexDirection: row }]}>
              <AppButton label={locale === 'ar' ? 'رجوع' : 'Back'} variant="ghost" size="md" fullWidth={false} onPress={() => setStep('edit')} disabled={updateUser.isPending} />
              <AppButton label={locale === 'ar' ? 'تأكيد الحفظ' : 'Confirm save'} size="md" onPress={() => selected && updateUser.mutate({ id: selected.id, role: draftRole, status: draftStatus })} loading={updateUser.isPending} disabled={selected.id === currentUserId} />
            </View>
          </View>
        ) : null}
      </BottomSheet>
    </View>
  );
}

export default AdminUsers;

const styles = StyleSheet.create({
  root: { gap: spacing.lg },
  loader: { marginTop: spacing.huge },
  stats: { gap: spacing.md },
  stat: { flex: 1, minWidth: 120, gap: spacing.xs, alignItems: 'flex-start' },
  userCard: { gap: spacing.md },
  userHeading: { alignItems: 'flex-start', gap: spacing.md },
  avatar: { width: 40, height: 40, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  userCopy: { flex: 1, gap: spacing.xs, minWidth: 0 },
  badges: { gap: spacing.xs, alignItems: 'flex-end' },
  sheetContent: { gap: spacing.md, paddingBottom: spacing.sm },
  choiceWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  choice: { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.md },
  sectionLabel: { marginTop: spacing.sm },
  reviewCard: { gap: spacing.md },
  reviewRow: { justifyContent: 'space-between', alignItems: 'center', gap: spacing.md },
  actions: { gap: spacing.sm, alignItems: 'center' },
});
