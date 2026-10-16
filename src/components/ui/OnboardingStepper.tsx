import { Fragment } from 'react';
import { StyleSheet, View } from 'react-native';
import { Check } from 'lucide-react-native';
import { AppText } from './AppText';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/spacing';
import { useLocale } from '@/hooks/useLocale';

export interface OnboardingStepperProps {
  /** Zero-based index of the step the user is on. */
  current: number;
}

const STEP_COUNT = 4;

/**
 * Shows the first-run path (email → verify → name → vehicle). Completed steps
 * get a check, the current step is filled, and upcoming steps stay outlined.
 * Purely visual: it never decides where the user can go.
 */
export function OnboardingStepper({ current }: OnboardingStepperProps) {
  const { colors } = useTheme();
  const { t, row } = useLocale();

  const labels = [
    t('onboarding.stepEmail'),
    t('onboarding.stepVerify'),
    t('onboarding.stepName'),
    t('onboarding.stepVehicle'),
  ];

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={t('onboarding.stepOf', { current: current + 1, total: STEP_COUNT })}
      accessibilityValue={{ min: 1, max: STEP_COUNT, now: current + 1 }}
      style={{ gap: spacing.md, marginBottom: spacing.xxl }}
    >
      <View style={{ flexDirection: row, alignItems: 'center' }}>
        {labels.map((label, index) => {
          const done = index < current;
          const active = index === current;
          const filled = done || active;

          return (
            <Fragment key={label}>
              <View
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: 13,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: filled ? colors.brand : colors.surface,
                  borderWidth: filled ? 0 : StyleSheet.hairlineWidth * 2,
                  borderColor: colors.borderStrong,
                }}
              >
                {done ? (
                  <Check size={14} color={colors.onBrand} strokeWidth={3} />
                ) : (
                  <AppText variant="caption" color={active ? 'textOnColor' : 'textTertiary'} numeric>
                    {index + 1}
                  </AppText>
                )}
              </View>
              {index < STEP_COUNT - 1 ? (
                <View
                  style={{
                    flex: 1,
                    height: 2,
                    marginHorizontal: spacing.xs,
                    borderRadius: 1,
                    backgroundColor: done ? colors.brand : colors.border,
                  }}
                />
              ) : null}
            </Fragment>
          );
        })}
      </View>

      <View style={{ flexDirection: row, alignItems: 'baseline', gap: spacing.sm }}>
        <AppText variant="label" color="text">
          {labels[current]}
        </AppText>
        <AppText variant="caption" color="textTertiary" numeric>
          {t('onboarding.stepOf', { current: current + 1, total: STEP_COUNT })}
        </AppText>
      </View>
    </View>
  );
}
