import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useMutation } from '@tanstack/react-query';
import { MapPin, Wallet, BellRing } from 'lucide-react-native';

import { AppButton, AppText, Reveal } from '@/components/ui';
import { LogoMark } from '@/components/brand/Logo';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing, screenPadding } from '@/theme/spacing';
import { radius } from '@/theme/radius';
import { shadow } from '@/theme/shadows';
import { useLocale } from '@/hooks/useLocale';
import { services } from '@/services';
import { useAuthStore } from '@/store/authStore';
import { usePreferencesStore } from '@/store/preferencesStore';
import { errorMessage } from '@/utils/errors';
import { haptics } from '@/utils/haptics';

// Development-only shortcut: signs in as a fixed demo account, skipping email + OTP.
const devQuickLogin = __DEV__ && process.env.EXPO_PUBLIC_DEV_SKIP_EMAIL_OTP === 'true';
const DEMO_EMAIL = 'demo@parkflow.ps';
const DEMO_NAME = 'Demo Driver';

export default function WelcomeScreen() {
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const { t, row } = useLocale();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();

  const features = [
    { Icon: MapPin, label: t('onboarding.feature1') },
    { Icon: Wallet, label: t('onboarding.feature2') },
    { Icon: BellRing, label: t('onboarding.feature3') },
  ];

  const goToEmail = () => router.push('/(onboarding)/email');

  const completeOnboarding = usePreferencesStore((state) => state.completeOnboarding);
  const setUser = useAuthStore((state) => state.setUser);
  const quickLogin = useMutation({
    mutationFn: async () => {
      const result = await services.auth.devLogin({ email: DEMO_EMAIL });
      if (!result.user.fullName) {
        setUser(await services.auth.completeProfile({ userId: result.user.id, fullName: DEMO_NAME }));
      }
    },
    onSuccess: () => {
      haptics.success();
      completeOnboarding();
      router.replace('/(tabs)/map');
    },
    onError: () => haptics.error(),
  });

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <StatusBar style={isDark ? "light" : "dark"} />

      <LinearGradient
        colors={[colors.brandSoft, colors.background, colors.background]}
        locations={[0, 0.55, 1]}
        style={{ flex: 1 }}
      >
        {/* Soft light bloom behind the mark — one gradient, used once. */}
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: height * 0.08,
            alignSelf: 'center',
            width: 300,
            height: 300,
            borderRadius: 150,
            backgroundColor: colors.brand,
            opacity: 0.025,
          }}
        />

        <View
          style={{
            flex: 1,
            paddingTop: insets.top + spacing.xxxl,
            paddingBottom: insets.bottom + spacing.xl,
            paddingHorizontal: screenPadding,
          }}
        >
          <Reveal delay={80} style={{ alignItems: 'center' }}>
            <LogoMark size={92} tone="dark" />
          </Reveal>

          <Reveal delay={180} style={{ marginTop: spacing.xxxl, gap: spacing.md }}>
            <AppText variant="display" align="center" color="text">
              {t('brand.name')}
            </AppText>
            <AppText
              variant="h2"
              align="center"
              style={{ color: colors.brand, letterSpacing: -0.2 }}
            >
              {t('brand.tagline')}
            </AppText>
            <AppText
              variant="bodyLg"
              align="center"
              color="textSecondary"
              style={{ maxWidth: 320, alignSelf: 'center' }}
            >
              {t('brand.subtitle')}
            </AppText>
          </Reveal>

          <View style={{ flex: 1 }} />

          <Reveal delay={300} style={{ gap: spacing.sm, marginBottom: spacing.xxl }}>
            {features.map(({ Icon, label }, index) => (
              <View
                key={label}
                style={{
                  flexDirection: row,
                  alignItems: 'center',
                  gap: spacing.md,
                  paddingVertical: spacing.sm,
                  paddingHorizontal: spacing.md,
                  borderRadius: radius.lg,
                  backgroundColor: colors.surface,
                  borderWidth: StyleSheet.hairlineWidth * 2,
                  borderColor: colors.border,
                  ...shadow.xs,
                }}
              >
                <View
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: radius.sm,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: colors.brandSoft,
                  }}
                >
                  <Icon size={16} color={colors.brand} strokeWidth={2.2} />
                </View>
                <AppText variant="title" color="text" style={{ flex: 1 }}>
                  {label}
                </AppText>
                <AppText variant="caption" color="textTertiary" numeric>
                  {String(index + 1).padStart(2, '0')}
                </AppText>
              </View>
            ))}
          </Reveal>

          <Reveal delay={420} style={{ gap: spacing.sm }}>
            <AppButton
              label={t('onboarding.getStarted')}
              onPress={goToEmail}
              variant="primary"
              testID="welcome-get-started"
            />
            <AppButton
              label={t('onboarding.login')}
              onPress={goToEmail}
              variant="ghost"
              style={{ height: 44 }}
            />
            {devQuickLogin ? (
              <AppButton
                label={t('onboarding.quickLogin')}
                onPress={() => quickLogin.mutate()}
                loading={quickLogin.isPending}
                variant="ghost"
                style={{ height: 44 }}
                testID="welcome-quick-login"
              />
            ) : null}
            {quickLogin.isError ? (
              <AppText variant="caption" color="danger" align="center">
                {errorMessage(quickLogin.error)}
              </AppText>
            ) : null}
          </Reveal>
        </View>
      </LinearGradient>
    </View>
  );
}
