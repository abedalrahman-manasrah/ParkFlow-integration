import { useEffect, useRef, useState } from 'react';
import { Modal, Vibration, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Phone, TriangleAlert } from 'lucide-react-native';

import { AppButton } from '@/components/ui/AppButton';
import { AppText } from '@/components/ui/AppText';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing, screenPadding } from '@/theme/spacing';
import { useLocale } from '@/hooks/useLocale';
import { useEmergencyConfig } from '@/hooks/useCrashDetection';
import { useCrashAlertStore, type CrashAlert } from '@/store/crashAlertStore';
import { services } from '@/services';
import { placeEmergencyCall } from '@/utils/emergencyCall';
import type { CrashEventOutcome } from '@/types';

const VIBRATION_PATTERN = [0, 600, 400];

function report(alert: CrashAlert, outcome: CrashEventOutcome) {
  const { detection, location } = alert;
  void services.emergency
    .recordCrash({
      detectedAt: alert.detectedAt,
      latitude: location?.latitude,
      longitude: location?.longitude,
      speedKmh: Math.round(detection.speedKmh),
      peakG: Number(detection.peakG.toFixed(2)),
      rotationDeg: Math.round(detection.rotationDeg),
      outcome,
    })
    .catch(() => undefined);
}

/**
 * The only crash-detection UI the driver ever sees: after a detected crash it
 * counts down with vibration, and calls for help unless the driver says they
 * are fine. Calling the instant a crash is detected would dial on every
 * false alarm, so the driver always gets this one chance to cancel.
 */
export function CrashCountdown() {
  const { colors } = useTheme();
  const { t } = useLocale();
  const insets = useSafeAreaInsets();
  const alert = useCrashAlertStore((s) => s.alert);
  const clear = useCrashAlertStore((s) => s.clear);
  const { data: config } = useEmergencyConfig();
  const total = config?.countdownSeconds ?? 15;
  const [remaining, setRemaining] = useState(total);
  const [calling, setCalling] = useState(false);
  const settled = useRef(false);

  useEffect(() => {
    if (!alert) return;
    settled.current = false;
    setCalling(false);
    setRemaining(total);
    Vibration.vibrate(VIBRATION_PATTERN, true);
    const timer = setInterval(() => setRemaining((value) => Math.max(0, value - 1)), 1000);
    return () => {
      clearInterval(timer);
      Vibration.cancel();
    };
  }, [alert, total]);

  const callNow = async () => {
    if (!alert || settled.current) return;
    settled.current = true;
    setCalling(true);
    Vibration.cancel();
    const number = config?.callNumber;
    const outcome = number ? await placeEmergencyCall(number) : 'no_number';
    report(alert, outcome);
    clear();
  };

  const cancel = () => {
    if (!alert || settled.current) return;
    settled.current = true;
    report(alert, 'cancelled');
    clear();
  };

  useEffect(() => {
    if (alert && remaining === 0) void callNow();
    // callNow reads the latest alert and config; only the countdown should trigger it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remaining, alert]);

  if (!alert) return null;

  return (
    <Modal visible animationType="fade" statusBarTranslucent onRequestClose={cancel}>
      <View
        style={{
          flex: 1,
          backgroundColor: colors.danger,
          paddingTop: insets.top + spacing.xxxl,
          paddingBottom: insets.bottom + spacing.xl,
          paddingHorizontal: screenPadding,
          justifyContent: 'space-between',
        }}
      >
        <View style={{ alignItems: 'center', gap: spacing.lg }}>
          <TriangleAlert size={56} color={colors.onDeep} strokeWidth={2} />
          <AppText variant="h1" align="center" style={{ color: colors.onDeep }}>
            {t('crash.title')}
          </AppText>
          <AppText variant="bodyLg" align="center" style={{ color: colors.onDeep, opacity: 0.9 }}>
            {t('crash.body')}
          </AppText>
        </View>

        <View style={{ alignItems: 'center', gap: spacing.sm }}>
          <AppText
            variant="displayXl"
            numeric
            align="center"
            accessibilityLiveRegion="assertive"
            style={{ color: colors.onDeep, fontSize: 96, lineHeight: 110 }}
          >
            {remaining}
          </AppText>
          <AppText variant="title" align="center" style={{ color: colors.onDeep }}>
            {calling ? t('crash.calling') : t('crash.callingIn', { seconds: remaining })}
          </AppText>
        </View>

        <View style={{ gap: spacing.md }}>
          <AppButton label={t('crash.imOk')} variant="inverse" onPress={cancel} disabled={calling} />
          <AppButton
            label={t('crash.callNow')}
            variant="ghostInverse"
            onPress={() => void callNow()}
            loading={calling}
            icon={<Phone size={18} color={colors.onDeep} strokeWidth={2.2} />}
          />
        </View>
      </View>
    </Modal>
  );
}
