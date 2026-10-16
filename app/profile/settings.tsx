import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/services/http/apiClient';
import { useUserId } from '@/hooks/useSession';
import { Platform, View } from 'react-native';
import { Check, Languages, Moon, Sun, SunMoon } from 'lucide-react-native';

import {
  AppButton,
  AppHeader,
  AppText,
  Card,
  Divider,
  InlineNotice,
  PressableScale,
  Screen,
  SectionHeader,
  Segmented,
  SwitchRow,
} from '@/components/ui';

import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/spacing';
import { radius } from '@/theme/radius';
import { useLocale } from '@/hooks/useLocale';
import { usePreferencesStore, type ThemeMode } from '@/store/preferencesStore';
import { LOCALES, localeNames, type Locale } from '@/i18n';
import type { NotificationPreferences } from '@/types';
import { errorMessage } from '@/utils/errors';
import { haptics } from '@/utils/haptics';
import { ensureCallPermission } from '@/utils/emergencyCall';
import { useEmergencyConfig } from '@/hooks/useCrashDetection';
import { useCrashAlertStore } from '@/store/crashAlertStore';
import { nativeCrashDetection } from '@/utils/crashDetectionNative';

const THEME_ICONS: Record<ThemeMode, typeof Sun> = {
  light: Sun,
  dark: Moon,
  system: SunMoon,
};

const PREF_KEYS: (keyof NotificationPreferences)[] = [
  'parkingReminders',
  'expiryWarnings',
  'lowBalance',
  'violations',
  'promotions',
];

export default function SettingsScreen() {
  const { colors, mode, setMode } = useTheme();
  const { t, locale, setLocale, row } = useLocale();

  const userId = useUserId();
  const queryClient = useQueryClient();
  const preferenceQuery = useQuery({queryKey:['notification-preferences',userId],queryFn:()=>api<NotificationPreferences>('/users/me/notification-preferences'),enabled:!!userId});
  const notifications = preferenceQuery.data ?? {parkingReminders:true,expiryWarnings:true,lowBalance:true,violations:true,promotions:false};
  const updatePreferences = useMutation({mutationFn:(next:NotificationPreferences)=>api<NotificationPreferences>('/users/me/notification-preferences',{method:'PATCH',body:next}),onSuccess:data=>queryClient.setQueryData(['notification-preferences',userId],data)});
  const setNotificationPreference = (key:keyof NotificationPreferences,value:boolean) => updatePreferences.mutate({...notifications,[key]:value});
  const voiceAlerts = usePreferencesStore((s) => s.voiceAlerts);
  const setVoiceAlerts = usePreferencesStore((s) => s.setVoiceAlerts);
  const voiceLanguage = usePreferencesStore((s) => s.voiceLanguage);
  const setVoiceLanguage = usePreferencesStore((s) => s.setVoiceLanguage);
  const crashDetection = usePreferencesStore((s) => s.crashDetection);
  const setCrashDetection = usePreferencesStore((s) => s.setCrashDetection);
  const { data: emergencyConfig } = useEmergencyConfig();
  const raiseCrashAlert = useCrashAlertStore((s) => s.raise);

  // On Android builds the background service owns the alert; elsewhere the in-app countdown does.
  const simulateCrash = () => {
    if (nativeCrashDetection?.simulate()) return;
    raiseCrashAlert({
      detection: { impactAt: Date.now(), peakG: 0, rotationDeg: 0, speedKmh: 0, reason: 'rollover' },
      detectedAt: new Date().toISOString(),
    });
  };

  const toggleCrashDetection = (enabled: boolean) => {
    setCrashDetection(enabled);
    // Asking now means the call can go through on its own later, when the driver may not be able to tap.
    if (enabled) void ensureCallPermission();
  };

  const themeOptions: ThemeMode[] = ['light', 'dark', 'system'];

  return (
    <Screen>
      <AppHeader title={t('profile.settings')} />

      <View style={{ gap: spacing.xl }}>
        {/* ---- Language -------------------------------------------------- */}
        <View>
          <SectionHeader
            title={t('profile.language')}
            trailing={<Languages size={20} color={colors.textTertiary} strokeWidth={2.1} />}
          />
          <Card padding="lg" style={{ paddingVertical: spacing.xs }}>
            {LOCALES.map((option: Locale, index) => {
              const active = option === locale;
              return (
                <View key={option}>
                  {index > 0 ? <Divider /> : null}
                  <PressableScale
                    onPress={() => {
                      haptics.select();
                      setLocale(option);
                    }}
                    scaleTo={0.99}
                    dimTo={0.65}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={localeNames[option]}
                    style={{
                      flexDirection: row,
                      alignItems: 'center',
                      gap: spacing.md,
                      paddingVertical: spacing.md,
                    }}
                  >
                    <AppText variant="titleLg" style={{ flex: 1 }}>
                      {localeNames[option]}
                    </AppText>
                    {active ? <Check size={20} color={colors.brand} strokeWidth={2.8} /> : null}
                  </PressableScale>
                </View>
              );
            })}
          </Card>
        </View>

        {/* ---- Theme ------------------------------------------------------ */}
        <View>
          <SectionHeader title={t('profile.theme')} />
          <View style={{ flexDirection: row, gap: spacing.sm }}>
            {themeOptions.map((option) => {
              const active = option === mode;
              const Icon = THEME_ICONS[option];
              return (
                <PressableScale
                  key={option}
                  onPress={() => {
                    haptics.select();
                    setMode(option);
                  }}
                  scaleTo={0.95}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={t(`profile.theme.${option}` as const)}
                  style={{
                    flex: 1,
                    alignItems: 'center',
                    gap: spacing.sm,
                    paddingVertical: spacing.lg,
                    borderRadius: radius.lg,
                    backgroundColor: active ? colors.brandSoft : colors.surface,
                    borderWidth: active ? 2 : 1,
                    borderColor: active ? colors.brand : colors.border,
                  }}
                >
                  <Icon
                    size={22}
                    color={active ? colors.brand : colors.textSecondary}
                    strokeWidth={2.1}
                  />
                  <AppText
                    variant="label"
                    align="center"
                    style={{ color: active ? colors.successText : colors.textSecondary }}
                  >
                    {t(`profile.theme.${option}` as const)}
                  </AppText>
                </PressableScale>
              );
            })}
          </View>
        </View>

        {/* ---- Voice --------------------------------------------------------- */}
        <View>
          <SectionHeader title={t('profile.voiceAlerts')} />
          <Card padding="lg">
            <SwitchRow
              label={t('profile.voiceAlerts')}
              description={t('profile.voiceAlertsBody')}
              value={voiceAlerts}
              onValueChange={setVoiceAlerts}
            />
            <Divider style={{ marginVertical: spacing.md }} />
            <AppText variant="label" color="textSecondary" style={{ marginBottom: spacing.sm }}>
              {t('profile.voiceLanguage')}
            </AppText>
            <Segmented
              options={[
                { value: 'ar' as const, label: localeNames.ar },
                { value: 'en' as const, label: localeNames.en },
              ]}
              value={voiceLanguage}
              onChange={setVoiceLanguage}
            />
          </Card>
        </View>

        {/* ---- Safety ------------------------------------------------------ */}
        {Platform.OS !== 'web' ? (
          <View>
            <SectionHeader title={t('crash.section')} />
            <Card padding="lg" style={{ gap: spacing.md }}>
              <SwitchRow
                label={t('crash.setting')}
                description={t('crash.settingBody')}
                value={crashDetection}
                onValueChange={toggleCrashDetection}
              />
              {emergencyConfig && !emergencyConfig.enabled ? (
                <AppText variant="caption" color="textTertiary">
                  {t('crash.notConfigured')}
                </AppText>
              ) : null}
              {__DEV__ ? (
                <AppButton
                  label={t('crash.test')}
                  variant="secondary"
                  size="sm"
                  onPress={simulateCrash}
                />
              ) : null}
            </Card>
          </View>
        ) : null}

        {/* ---- Notifications ---------------------------------------------- */}
        <View style={{ gap: spacing.sm }}>
          <SectionHeader title={t('profile.notifications')} />
          {preferenceQuery.isError ? (
            <InlineNotice
              tone="danger"
              title={t('common.somethingWrong')}
              body={errorMessage(preferenceQuery.error)}
              action={{ label: t('common.retry'), onPress: () => void preferenceQuery.refetch() }}
            />
          ) : (
            <Card padding="lg" style={{ gap: spacing.xs }}>
              {PREF_KEYS.map((key, index) => (
                <View key={key}>
                  {index > 0 ? <Divider style={{ marginVertical: spacing.xs }} /> : null}
                  <SwitchRow
                    label={t(`profile.prefs.${key}` as const)}
                    value={notifications[key]}
                    disabled={preferenceQuery.isPending || updatePreferences.isPending}
                    onValueChange={(value) => setNotificationPreference(key, value)}
                  />
                </View>
              ))}
            </Card>
          )}
          {updatePreferences.isError ? (
            <InlineNotice
              tone="danger"
              title={t('common.somethingWrong')}
              body={errorMessage(updatePreferences.error)}
            />
          ) : null}
        </View>
      </View>
    </Screen>
  );
}
