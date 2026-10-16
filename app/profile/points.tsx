import { View } from 'react-native';
import { Gift } from 'lucide-react-native';

import {
  AppHeader,
  AppText,
  Card,
  Divider,
  ErrorState,
  ListItem,
  Screen,
  SectionHeader,
  Skeleton,
  StatusBadge,
} from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/spacing';
import { radius } from '@/theme/radius';
import { useLocale } from '@/hooks/useLocale';
import { useTrust } from '@/hooks/useCommunity';
import type { TrustTier } from '@/types';
import { formatDateTime } from '@/utils/time';
import { formatMoney } from '@/utils/money';

const TIER_TONE = { bronze: 'warning', silver: 'neutral', gold: 'success', platinum: 'brand' } as const;
const STATE_TONE = { pending: 'info', verified: 'success', revoked: 'neutral' } as const;
const EARN_KEYS = ['points.earn.pay', 'points.earn.report', 'points.earn.fines'] as const;

const signed = (n: number) => (n > 0 ? `+${n}` : String(n));

/** ParkFlow Points — the driver trust score, and the discount it buys. */
export default function PointsScreen() {
  const { colors } = useTheme();
  const { t, row, alignEnd, dateLocale } = useLocale();
  const { data: trust, isPending, isError, error, refetch } = useTrust();

  const tierName = (tier: TrustTier) => t(`points.tier.${tier}` as const);

  if (isError) {
    return (
      <Screen>
        <AppHeader title={t('points.title')} />
        <ErrorState error={error} onRetry={() => void refetch()} />
      </Screen>
    );
  }

  if (isPending || !trust) {
    return (
      <Screen>
        <AppHeader title={t('points.title')} />
        <View style={{ gap: spacing.lg }}>
          <Skeleton height={200} radiusToken="xl" />
          <Skeleton height={260} radiusToken="xl" />
        </View>
      </Screen>
    );
  }

  const progress = trust.next ? Math.min(1, trust.score / trust.next.at) : 1;

  return (
    <Screen bottomInset={spacing.lg}>
      <AppHeader title={t('points.title')} />

      <View style={{ gap: spacing.xl }}>
        <Card padding="xl" style={{ gap: spacing.md }}>
          <View style={{ flexDirection: row, alignItems: 'center', justifyContent: 'space-between' }}>
            <AppText variant="overline" color="textTertiary">
              {t('points.score')}
            </AppText>
            <StatusBadge label={tierName(trust.tier)} tone={TIER_TONE[trust.tier]} />
          </View>

          <AppText variant="display" numeric>
            {trust.score}
          </AppText>
          <AppText variant="bodyLg" color={trust.discountPercent ? 'successText' : 'textSecondary'}>
            {trust.discountPercent
              ? t('points.discount', { percent: trust.discountPercent })
              : t('points.noDiscount')}
          </AppText>

          <View
            style={{ height: 8, borderRadius: 4, backgroundColor: colors.surfaceAlt, overflow: 'hidden' }}
          >
            <View
              style={{
                width: `${Math.round(progress * 100)}%`,
                height: '100%',
                borderRadius: 4,
                backgroundColor: colors.brand,
              }}
            />
          </View>
          <AppText variant="caption" color="textTertiary">
            {trust.next
              ? t('points.toNext', {
                  points: trust.next.at - trust.score,
                  tier: tierName(trust.next.tier),
                  percent: trust.next.discountPercent,
                })
              : t('points.topTier')}
          </AppText>
          {trust.pendingPoints ? (
            <AppText variant="caption" color="infoText">
              {t('points.pending', { points: trust.pendingPoints })}
            </AppText>
          ) : null}
        </Card>

        {trust.rewards ? (
          <Card tone="brand" padding="lg" style={{ flexDirection: row, alignItems: 'center', gap: spacing.md }}>
            <View
              style={{
                width: 44,
                height: 44,
                borderRadius: radius.md,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: colors.surface,
              }}
            >
              <Gift size={22} color={colors.brand} strokeWidth={2.2} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <AppText variant="title">{t('points.rewards')}</AppText>
              <AppText variant="bodySm" color="textSecondary">
                {t('points.rewardsRate', { amount: formatMoney(trust.rewards.perPointMinor) })}
              </AppText>
            </View>
            <View style={{ alignItems: alignEnd, gap: 2 }}>
              <AppText variant="caption" color="textTertiary">
                {t('points.rewardsEarned')}
              </AppText>
              <AppText variant="titleLg" color="successText" numeric>
                {formatMoney(trust.rewards.earnedMinor)}
              </AppText>
            </View>
          </Card>
        ) : null}

        <View>
          <SectionHeader title={t('points.factors')} />
          <Card padding="lg" style={{ paddingVertical: spacing.xs }}>
            {trust.factors.map((factor, index) => (
              <View key={factor.key}>
                {index > 0 ? <Divider /> : null}
                <ListItem
                  title={t(`points.factor.${factor.key}` as const)}
                  subtitle={t('points.count', { count: factor.count })}
                  trailing={
                    <AppText
                      variant="title"
                      numeric
                      color={
                        factor.points < 0 ? 'danger' : factor.points > 0 ? 'successText' : 'textTertiary'
                      }
                    >
                      {signed(factor.points)}
                    </AppText>
                  }
                />
              </View>
            ))}
          </Card>
        </View>

        <View>
          <SectionHeader title={t('points.earn')} />
          <Card padding="lg" style={{ gap: spacing.sm }}>
            {EARN_KEYS.map((key) => (
              <AppText key={key} variant="bodySm" color="textSecondary">
                • {t(key)}
              </AppText>
            ))}
            {trust.rewards ? (
              <AppText variant="bodySm" color="textSecondary">
                • {t('points.earn.incident', { points: trust.rewards.incidentReportPoints })}
              </AppText>
            ) : null}
          </Card>
        </View>

        {trust.recent.length ? (
          <View>
            <SectionHeader title={t('points.recent')} />
            <Card padding="lg" style={{ paddingVertical: spacing.xs }}>
              {trust.recent.map((entry, index) => (
                <View key={entry.id}>
                  {index > 0 ? <Divider /> : null}
                  <ListItem
                    title={t(`points.reason.${entry.reason}` as const)}
                    subtitle={formatDateTime(entry.createdAt, dateLocale)}
                    trailing={
                      <View style={{ alignItems: alignEnd, gap: 4 }}>
                        <AppText variant="title" numeric>
                          +{entry.points}
                        </AppText>
                        <StatusBadge
                          label={t(`points.state.${entry.state}` as const)}
                          tone={STATE_TONE[entry.state]}
                          size="sm"
                        />
                      </View>
                    }
                  />
                </View>
              ))}
            </Card>
          </View>
        ) : null}
      </View>
    </Screen>
  );
}
