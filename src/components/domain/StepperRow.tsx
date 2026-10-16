import type { ReactNode } from 'react';
import { View } from 'react-native';
import { AppButton, AppText } from '@/components/ui';
import { useLocale } from '@/hooks/useLocale';
import { spacing } from '@/theme/spacing';

export interface StepperRowProps {
  icon?: ReactNode;
  label: string;
  value: string;
  onMinus: () => void;
  onPlus: () => void;
  minusDisabled?: boolean;
  plusDisabled?: boolean;
}

/** A labelled − value + control, used for dates, times, seats and durations. */
export function StepperRow({ icon, label, value, onMinus, onPlus, minusDisabled, plusDisabled }: StepperRowProps) {
  const { row } = useLocale();
  return (
    <View style={{ gap: spacing.sm }}>
      <View style={{ flexDirection: row, alignItems: 'center', gap: spacing.sm }}>
        {icon}
        <AppText variant="label" color="textSecondary">{label}</AppText>
      </View>
      <View style={{ flexDirection: row, alignItems: 'center', gap: spacing.sm }}>
        <AppButton label="−" size="sm" variant="secondary" fullWidth={false} onPress={onMinus} disabled={minusDisabled} style={{ width: 52 }} />
        <AppText variant="titleLg" numeric align="center" style={{ flex: 1 }}>{value}</AppText>
        <AppButton label="+" size="sm" variant="secondary" fullWidth={false} onPress={onPlus} disabled={plusDisabled} style={{ width: 52 }} />
      </View>
    </View>
  );
}
