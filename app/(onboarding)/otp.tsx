import { useCallback, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation } from '@tanstack/react-query';

import {
  AppButton,
  AppHeader,
  AppText,
  InlineNotice,
  OtpInput,
  PressableScale,
  Reveal,
  OnboardingStepper,
  Screen,
} from '@/components/ui';
import { spacing } from '@/theme/spacing';
import { useLocale } from '@/hooks/useLocale';
import { services } from '@/services';
import { useAuthStore } from '@/store/authStore';
import { usePreferencesStore } from '@/store/preferencesStore';
import { errorMessage } from '@/utils/errors';
import { haptics } from '@/utils/haptics';

const CODE_LENGTH = 6;

export default function OtpScreen() {
  const router = useRouter();
  const { t } = useLocale();
  const params = useLocalSearchParams<{
    challengeId: string;
    email: string;
    resendAfter?: string;
  }>();

  const signIn = useAuthStore((s) => s.signIn);
  const completeOnboarding = usePreferencesStore((s) => s.completeOnboarding);

  const [challengeId, setChallengeId] = useState(params.challengeId);
  const [code, setCode] = useState('');
  const [secondsLeft, setSecondsLeft] = useState(Number(params.resendAfter ?? 30));
  const submittedFor = useRef<string | null>(null);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const timer = setInterval(() => setSecondsLeft((n) => Math.max(0, n - 1)), 1000);
    return () => clearInterval(timer);
  }, [secondsLeft]);

  const verify = useMutation({
    mutationFn: (value: string) => services.auth.verifyOtp({ challengeId, code: value }),
    onSuccess: async ({ session, user }) => {
      haptics.success();
      await signIn(session, user);
      // A returning account is already set up; only new ones continue the flow.
      if (user.fullName) {
        completeOnboarding();
        router.replace('/(tabs)/map');
      } else {
        router.replace('/(onboarding)/name');
      }
    },
    onError: () => {
      haptics.error();
      setCode('');
      submittedFor.current = null;
    },
  });

  const resend = useMutation({
    mutationFn: () =>
      services.auth.requestOtp({
        email: params.email,
      }),
    onSuccess: (challenge) => {
      haptics.light();
      setChallengeId(challenge.challengeId);
      setSecondsLeft(challenge.resendAfterSeconds);
      setCode('');
      submittedFor.current = null;
    },
  });

  // Auto-submit once the code is complete, but only once per distinct code.
  const handleComplete = useCallback(
    (value: string) => {
      if (submittedFor.current === value || verify.isPending) return;
      submittedFor.current = value;
      verify.mutate(value);
    },
    [verify],
  );

  const isComplete = code.length === CODE_LENGTH;

  return (
    <Screen keyboardAvoiding>
      <AppHeader />
      <OnboardingStepper current={1} />

      <Reveal style={{ gap: spacing.sm }}>
        <AppText variant="h1">{t('onboarding.otpTitle')}</AppText>
        <AppText variant="bodyLg" color="textSecondary">
          {t('onboarding.otpSubtitle', { email: params.email })}
        </AppText>
      </Reveal>

      <View style={{ marginTop: spacing.xxxl, gap: spacing.xl }}>
        <OtpInput
          value={code}
          onChangeText={setCode}
          length={CODE_LENGTH}
          hasError={verify.isError}
          disabled={verify.isPending || resend.isPending}
          onComplete={handleComplete}
          testID="otp-input"
        />

        {verify.isError ? (
          <InlineNotice tone="danger" title={t('onboarding.otpInvalid')} body={errorMessage(verify.error)} />
        ) : null}

        {resend.isError ? <InlineNotice tone="danger" title={t('common.somethingWrong')} body={errorMessage(resend.error)} /> : null}

        <View style={{ alignItems: 'center', gap: spacing.md }}>
          {secondsLeft > 0 ? (
            <AppText variant="bodySm" color="textTertiary" numeric>
              {t('onboarding.otpResendIn', { seconds: secondsLeft })}
            </AppText>
          ) : (
            <PressableScale disabled={resend.isPending || verify.isPending} onPress={() => resend.mutate()} haptic="light" hitSlop={10}>
              <AppText variant="label" color="brand">
                {resend.isPending ? t('common.loading') : t('onboarding.otpResend')}
              </AppText>
            </PressableScale>
          )}

          <PressableScale onPress={() => router.back()} haptic="light" hitSlop={10}>
            <AppText variant="bodySm" color="textSecondary">
              {t('onboarding.otpChangeEmail')}
            </AppText>
          </PressableScale>
        </View>
      </View>

      <View style={{ flex: 1 }} />

      <AppButton
        label={t('common.continue')}
        disabled={!isComplete}
        loading={verify.isPending}
        onPress={() => handleComplete(code)}
        testID="otp-continue"
      />
    </Screen>
  );
}
