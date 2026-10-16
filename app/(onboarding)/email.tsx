import { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation } from '@tanstack/react-query';

import {
  AppButton,
  AppHeader,
  AppText,
  InlineNotice,
  OnboardingStepper,
  Reveal,
  Screen,
  TextField,
} from '@/components/ui';
import { z } from 'zod';
import { spacing } from '@/theme/spacing';
import { useLocale } from '@/hooks/useLocale';
import { services } from '@/services';
import type { AuthResult } from '@/services/types';
import type { OtpChallenge } from '@/types';
import { errorMessage } from '@/utils/errors';
import { haptics } from '@/utils/haptics';
import { usePreferencesStore } from '@/store/preferencesStore';

export default function EmailScreen() {
  const router = useRouter();
  const { t } = useLocale();
  const completeOnboarding = usePreferencesStore((state) => state.completeOnboarding);
  const [email, setEmail] = useState('');
  const [touched, setTouched] = useState(false);
  const normalized = email.trim().toLowerCase();
  const isValid = z.email().max(254).safeParse(normalized).success;
  const showError = touched && normalized.length > 0 && !isValid;
  const devSkipEmailOtp = __DEV__ && process.env.EXPO_PUBLIC_DEV_SKIP_EMAIL_OTP === 'true';

  const continueWithEmail = useMutation<AuthResult | OtpChallenge>({
    mutationFn: () => devSkipEmailOtp
      ? services.auth.devLogin({ email: normalized })
      : services.auth.requestOtp({ email: normalized }),
    onSuccess: (result) => {
      haptics.success();
      if ('session' in result) {
        if (result.user.fullName) {
          completeOnboarding();
          router.replace('/(tabs)/map');
        } else {
          router.replace('/(onboarding)/name');
        }
        return;
      }
      router.push({
        pathname: '/(onboarding)/otp',
        params: {
          challengeId: result.challengeId,
          email: result.email,
          resendAfter: String(result.resendAfterSeconds),
        },
      });
    },
    onError: () => haptics.error(),
  });

  return (
    <Screen keyboardAvoiding safeBottom>
      <AppHeader />
      <OnboardingStepper current={0} />

      <Reveal style={{ gap: spacing.sm }}>
        <AppText variant="h1">{t('onboarding.emailTitle')}</AppText>
        <AppText variant="bodyLg" color="textSecondary">
          {t('onboarding.emailSubtitle')}
        </AppText>
      </Reveal>

      <View style={{ marginTop: spacing.xxxl, gap: spacing.lg }}>
        <TextField
          label={t('onboarding.emailLabel')}
          emphasis="strong"
          value={email}
          onChangeText={setEmail}
          onBlur={() => setTouched(true)}
          placeholder="you@example.com"
          keyboardType="email-address"
          textContentType="emailAddress"
          autoComplete="email"
          autoCapitalize="none"
          autoCorrect={false}
          autoFocus
          maxLength={254}
          error={showError ? t('onboarding.emailInvalid') : undefined}
          testID="email-input"
        />

        {continueWithEmail.isError ? (
          <InlineNotice
            tone="danger"
            title={t('common.somethingWrong')}
            body={errorMessage(continueWithEmail.error)}
          />
        ) : null}
      </View>

      <View style={{ flex: 1, minHeight: spacing.xl }} />

      <View style={{ gap: spacing.lg }}>
        <AppText
          variant="caption"
          color="textTertiary"
          align="center"
          style={{ maxWidth: 340, alignSelf: 'center' }}
        >
          {t('onboarding.terms')}
        </AppText>
        <AppButton
          label={t('common.continue')}
          disabled={!isValid}
          loading={continueWithEmail.isPending}
          onPress={() => continueWithEmail.mutate()}
          testID="email-continue"
        />
      </View>

    </Screen>
  );
}
