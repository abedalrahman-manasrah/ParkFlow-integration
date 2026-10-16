import { useMemo, useState } from 'react';
import { SectionList, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Receipt } from 'lucide-react-native';

import {
  AppText,
  Divider,
  EmptyState,
  ErrorState,
  Screen,
  Segmented,
  SkeletonGroup,
  TabHeader,
} from '@/components/ui';
import { TransactionRow } from '@/components/domain/TransactionRow';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing, screenPadding } from '@/theme/spacing';
import { useLocale } from '@/hooks/useLocale';
import { useTransactions } from '@/hooks/useWallet';
import type { TranslationKey } from '@/i18n';
import type { Transaction, TransactionType } from '@/types';
import { formatDayHeading } from '@/utils/time';

type Filter = 'all' | 'parking' | 'payments' | 'violations';

const FILTER_TYPES: Record<Filter, TransactionType[] | undefined> = {
  all: undefined,
  parking: ['parking_payment'],
  payments: ['topup', 'refund', 'adjustment', 'reward', 'ride_payment', 'spot_payment', 'earning'],
  violations: ['violation_payment'],
};

const TAB_BAR_CLEARANCE = 96;

export default function ActivityScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { t, dateLocale } = useLocale();
  const insets = useSafeAreaInsets();
  const [filter, setFilter] = useState<Filter>('all');

  const { data: transactions = [], isPending, isError, error, refetch, isRefetching } =
    useTransactions(FILTER_TYPES[filter]);

  /** Grouped by calendar day so the ledger reads chronologically. */
  const sections = useMemo(() => {
    const groups = new Map<string, Transaction[]>();
    transactions.forEach((transaction) => {
      const key = transaction.createdAt.slice(0, 10);
      const bucket = groups.get(key);
      if (bucket) bucket.push(transaction);
      else groups.set(key, [transaction]);
    });

    return Array.from(groups.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([day, data]) => ({
        title: formatDayHeading(
          data[0]!.createdAt,
          { today: t('common.today'), yesterday: t('common.yesterday') },
          dateLocale,
        ),
        key: day,
        data,
      }));
  }, [transactions, t, dateLocale]);

  const emptyBodyKeys: Record<Filter, TranslationKey> = {
    all: 'activity.emptyBody',
    parking: 'activity.emptyBodyParking',
    payments: 'activity.emptyBodyPayments',
    violations: 'activity.emptyBodyViolations',
  };

  const options = [
    { value: 'all' as const, label: t('activity.all') },
    { value: 'parking' as const, label: t('activity.parking') },
    { value: 'payments' as const, label: t('activity.payments') },
    { value: 'violations' as const, label: t('activity.violations') },
  ];

  return (
    <Screen layout="fixed" edgeToEdge safeBottom={false}>
      <View style={{ paddingHorizontal: screenPadding, paddingTop: spacing.md, gap: spacing.lg, paddingBottom: spacing.sm }}>
        <TabHeader title={t('activity.title')} />
        <Segmented variant="inset" options={options} value={filter} onChange={setFilter} />
      </View>

      {isPending ? (
        <View style={{ paddingHorizontal: screenPadding, paddingTop: spacing.md }}>
          <SkeletonGroup count={6} height={64} />
        </View>
      ) : isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          onRefresh={() => void refetch()}
          refreshing={isRefetching}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            paddingHorizontal: screenPadding,
            paddingBottom: TAB_BAR_CLEARANCE + insets.bottom,
            flexGrow: 1,
          }}
          ItemSeparatorComponent={() => <Divider />}
          stickySectionHeadersEnabled={false}
          renderSectionHeader={({ section }) => (
            <View
              style={{
                paddingTop: spacing.xl,
                paddingBottom: spacing.xs,
                backgroundColor: colors.background,
              }}
            >
              <AppText variant="overline" color="textTertiary">
                {section.title}
              </AppText>
            </View>
          )}
          renderItem={({ item }) => (
            <TransactionRow
              transaction={item}
              onPress={() => router.push(`/activity/${item.id}`)}
            />
          )}
          ListEmptyComponent={
            <EmptyState
              icon={<Receipt size={28} color={colors.brand} strokeWidth={2} />}
              title={t('activity.empty')}
              body={t(emptyBodyKeys[filter])}
            />
          }
        />
      )}
    </Screen>
  );
}
