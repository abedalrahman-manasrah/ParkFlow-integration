import { View } from 'react-native';
import {
  ArrowDownLeft,
  CircleParking,
  Gift,
  CarFront,
  House,
  HandCoins,
  RotateCcw,
  ScrollText,
  SlidersHorizontal,
} from 'lucide-react-native';

import { AppText, MoneyText, PressableScale, StatusBadge } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/spacing';
import { radius } from '@/theme/radius';
import { useLocale } from '@/hooks/useLocale';
import type { Transaction, TransactionType } from '@/types';
import { formatTime } from '@/utils/time';

const ICONS: Record<TransactionType, typeof CircleParking> = {
  parking_payment: CircleParking,
  topup: ArrowDownLeft,
  violation_payment: ScrollText,
  refund: RotateCcw,
  adjustment: SlidersHorizontal,
  reward: Gift,
  ride_payment: CarFront,
  spot_payment: House,
  earning: HandCoins,
};

export interface TransactionRowProps {
  transaction: Transaction;
  onPress?: () => void;
}

export function TransactionRow({ transaction, onPress }: TransactionRowProps) {
  const { colors } = useTheme();
  const { t, row, alignEnd, dateLocale, locale } = useLocale();

  const Icon = ICONS[transaction.type];
  const isCredit = transaction.amount > 0;
  const failed = transaction.status === 'failed';

  const title = locale === 'ar' ? transaction.titleAr : transaction.title;
  const subtitle = locale === 'ar' ? transaction.subtitleAr : transaction.subtitle;

  return (
    <PressableScale
      onPress={onPress}
      disabled={!onPress}
      haptic="select"
      scaleTo={0.99}
      dimTo={0.6}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={`${title}, ${subtitle ?? ''}`}
      style={{
        flexDirection: row,
        alignItems: 'center',
        gap: spacing.md,
        paddingVertical: spacing.md,
      }}
    >
      <View
        style={{
          width: 44,
          height: 44,
          borderRadius: radius.md,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: failed
            ? colors.dangerSoft
            : isCredit
              ? colors.brandSoft
              : colors.surfaceAlt,
        }}
      >
        <Icon
          size={20}
          color={failed ? colors.danger : isCredit ? colors.brand : colors.textSecondary}
          strokeWidth={2.1}
        />
      </View>

      <View style={{ flex: 1, gap: 3 }}>
        <AppText variant="titleLg" numberOfLines={1}>
          {title}
        </AppText>
        <View style={{ flexDirection: row, alignItems: 'center', gap: spacing.sm }}>
          <AppText variant="bodySm" color="textSecondary" numberOfLines={1} style={{ flexShrink: 1 }}>
            {subtitle ? `${subtitle} · ` : ''}
            {formatTime(transaction.createdAt, dateLocale)}
          </AppText>
        </View>
      </View>

      <View style={{ alignItems: alignEnd, gap: 4 }}>
        <MoneyText
          value={transaction.amount}
          signed
          variant="titleLg"
          color={failed ? 'textTertiary' : isCredit ? 'successText' : 'text'}
          style={failed ? { textDecorationLine: 'line-through' } : undefined}
        />
        {failed ? (
          <StatusBadge label={t('activity.status.failed')} tone="danger" size="sm" />
        ) : transaction.status === 'pending' ? (
          <StatusBadge label={t('activity.status.pending')} tone="warning" size="sm" />
        ) : null}
      </View>
    </PressableScale>
  );
}
