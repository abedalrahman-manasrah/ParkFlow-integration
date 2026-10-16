import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { ScrollText, ShieldCheck } from 'lucide-react-native';

import {
  AppHeader,
  AppText,
  Card,
  Divider,
  EmptyState,
  ErrorState,
  ListItem,
  MoneyText,
  Screen,
  Segmented,
  SkeletonGroup,
  StatusBadge,
} from '@/components/ui';
import { PlateBadge } from '@/components/domain/PlateBadge';

import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/spacing';
import { radius } from '@/theme/radius';
import { useLocale } from '@/hooks/useLocale';
import { useViolations } from '@/hooks/useViolations';
import type { Violation, ViolationStatus } from '@/types';
import { formatDate, formatTime } from '@/utils/time';

type Tab = 'unpaid' | 'paid' | 'appealed';

const TAB_STATUSES: Record<Tab, ViolationStatus[]> = {
  unpaid: ['unpaid', 'overdue'],
  paid: ['paid'],
  appealed: ['appealed'],
};

export default function ViolationsScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { t, row, isRTL, alignEnd, dateLocale, locale } = useLocale();
  const [tab, setTab] = useState<Tab>('unpaid');

  const { data: violations = [], isPending, isError, error, refetch } = useViolations();

  const counts = useMemo(
    () => ({
      unpaid: violations.filter((v) => TAB_STATUSES.unpaid.includes(v.status)).length,
      paid: violations.filter((v) => TAB_STATUSES.paid.includes(v.status)).length,
      appealed: violations.filter((v) => TAB_STATUSES.appealed.includes(v.status)).length,
    }),
    [violations],
  );

  const visible = violations.filter((v) => TAB_STATUSES[tab].includes(v.status));

  const totalOutstanding = violations
    .filter((v) => TAB_STATUSES.unpaid.includes(v.status))
    .reduce((sum, v) => sum + v.amount, 0);

  const toneFor = (violation: Violation) => {
    if (violation.status === 'paid') return 'success' as const;
    if (violation.status === 'appealed') return 'info' as const;
    if (violation.status === 'overdue') return 'danger' as const;
    return 'warning' as const;
  };

  /** Overdue is still an unpaid notice — it just gets the louder tone. */
  const statusLabel = (violation: Violation) => {
    if (violation.status === 'paid') return t('violation.paid');
    if (violation.status === 'appealed') return t('violation.appealed');
    if (violation.status === 'overdue') return t('violation.overdue');
    return t('violation.unpaid');
  };

  return (
    <Screen>
      <AppHeader title={t('violation.title')} />

      <View style={{ gap: spacing.lg }}>
        {totalOutstanding > 0 ? (
          <Card
            padding="lg"
            style={{ flexDirection: row, alignItems: 'center', gap: spacing.md }}
            tone="outline"
          >
            <View
              style={{
                width: 44,
                height: 44,
                borderRadius: radius.md,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: colors.dangerSoft,
              }}
            >
              <ScrollText size={20} color={colors.danger} strokeWidth={2.2} />
            </View>
            <View style={{ flex: 1, gap: 3 }}>
              <AppText variant="label" color="textSecondary">
                {t('violation.unpaid')}
              </AppText>
              <MoneyText value={totalOutstanding} variant="h2" color="danger" />
            </View>
            <AppText variant="caption" color="textTertiary" numeric>
              {counts.unpaid}
            </AppText>
          </Card>
        ) : null}

        <Segmented
          variant="inset"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'unpaid', label: t('violation.unpaid'), badge: counts.unpaid },
            { value: 'paid', label: t('violation.paid'), badge: counts.paid },
            { value: 'appealed', label: t('violation.appealed'), badge: counts.appealed },
          ]}
        />

        {isPending ? (
          <SkeletonGroup count={3} height={96} />
        ) : isError ? (
          <ErrorState error={error} onRetry={() => void refetch()} />
        ) : visible.length === 0 ? (
          <EmptyState
            icon={<ShieldCheck size={28} color={colors.brand} strokeWidth={2} />}
            title={t('violation.empty')}
            body={t('violation.emptyBody')}
          />
        ) : (
          <Card padding="lg" style={{ paddingVertical: spacing.xs }}>
            {visible.map((violation, index) => (
              <View key={violation.id}>
                {index > 0 ? <Divider /> : null}
                <ListItem
                  title={t(`violation.type.${violation.type}` as const)}
                  subtitle={`${
                    locale === 'ar' ? violation.locationNameAr : violation.locationName
                  } · ${formatDate(violation.issuedAt, dateLocale)} · ${formatTime(
                    violation.issuedAt,
                    dateLocale,
                  )}`}
                  leading={
                    <View
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: radius.md,
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor:
                          violation.status === 'paid' ? colors.surfaceAlt : colors.dangerSoft,
                      }}
                    >
                      <ScrollText
                        size={19}
                        color={violation.status === 'paid' ? colors.textSecondary : colors.danger}
                        strokeWidth={2.1}
                      />
                    </View>
                  }
                  trailing={
                    <View style={{ alignItems: alignEnd, gap: 6 }}>
                      <MoneyText value={violation.amount} variant="titleLg" />
                      <StatusBadge label={statusLabel(violation)} tone={toneFor(violation)} size="sm" />
                    </View>
                  }
                  onPress={() => router.push(`/violations/${violation.id}`)}
                />
                {/* The plate is the subject of the notice, so it stays visible
                    in the list rather than only on the detail screen. */}
                <View style={{ paddingBottom: spacing.md, [isRTL ? 'marginRight' : 'marginLeft']: 44 + spacing.md }}>
                  <PlateBadge plateNumber={violation.plateNumber} size="sm" />
                </View>
              </View>
            ))}
          </Card>
        )}
      </View>
    </Screen>
  );
}
