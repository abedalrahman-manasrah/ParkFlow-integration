import { useRef } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { Camera, QrCode, ScanLine } from 'lucide-react-native';

import { AppButton, AppHeader, AppText, InlineNotice, Screen } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/spacing';
import { radius } from '@/theme/radius';
import { useLocale } from '@/hooks/useLocale';
import { services } from '@/services';
import { errorMessage } from '@/utils/errors';
import { haptics } from '@/utils/haptics';

/** Codes printed on the demo zone signs — used by the "simulate a scan" button. */
const DEMO_CODES = ['RML-023', 'RML-001', 'RML-007', 'RML-041', 'RML-G12', 'BRH-014'];

/**
 * A sign's QR may hold a bare zone code ("RML-023") or a link that contains one
 * ("https://parkflow.ps/z/RML-023"); either resolves to the same lookup.
 */
function parseZoneCode(data: string): string {
  const match = data.toUpperCase().match(/[A-Z]{3}-[A-Z0-9]{2,4}/);
  return match ? match[0] : data.trim().toUpperCase();
}

export default function ScanScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { t } = useLocale();
  const [permission, requestPermission] = useCameraPermissions();

  // The camera reports the same code many times a second; handle it once.
  const handled = useRef(false);

  const lookup = useMutation({
    mutationFn: (code: string) => services.parking.getZoneByCode(code),
    onSuccess: (zone) => {
      haptics.success();
      router.replace({ pathname: '/parking/start', params: { zoneId: zone.id } });
    },
    onError: () => {
      haptics.error();
      // Give the driver a moment to move off the bad code before retrying.
      setTimeout(() => {
        handled.current = false;
      }, 1500);
    },
  });

  const handleScan = ({ data }: BarcodeScanningResult) => {
    if (handled.current) return;
    handled.current = true;
    lookup.mutate(parseZoneCode(data));
  };

  const simulateScan = () => {
    if (lookup.isPending) return;
    handled.current = true;
    lookup.mutate(DEMO_CODES[Math.floor(Math.random() * DEMO_CODES.length)]!);
  };

  const granted = Boolean(permission?.granted);

  return (
    <Screen bottomInset={spacing.lg}>
      <AppHeader title={t('map.scanQr')} leading="close" />

      <View style={{ gap: spacing.xl }}>
        <View
          style={{
            width: '100%',
            aspectRatio: 1,
            borderRadius: radius.xl,
            overflow: 'hidden',
            backgroundColor: colors.deep,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {granted ? (
            <CameraView
              style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={lookup.isPending ? undefined : handleScan}
            />
          ) : (
            <View style={{ alignItems: 'center', gap: spacing.md, padding: spacing.xl }}>
              <Camera size={36} color={colors.accent} strokeWidth={2} />
              <AppText variant="titleLg" color="onDeep" align="center">
                {t('scan.permissionTitle')}
              </AppText>
              <AppText variant="bodySm" color="onDeepMuted" align="center">
                {t('scan.permissionBody')}
              </AppText>
              {permission && (permission.canAskAgain || !permission.status) ? (
                <AppButton
                  label={t('scan.allowCamera')}
                  variant="inverse"
                  size="sm"
                  onPress={() => void requestPermission()}
                />
              ) : null}
            </View>
          )}

          {/* Viewfinder frame — drawn over the feed, never intercepts touches. */}
          {granted ? (
            <View
              pointerEvents="none"
              style={{
                position: 'absolute',
                top: '18%',
                right: '18%',
                bottom: '18%',
                left: '18%',
                borderRadius: radius.lg,
                borderWidth: 3,
                borderColor: colors.accent,
              }}
            />
          ) : null}
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <QrCode size={22} color={colors.textSecondary} strokeWidth={2.1} />
          <AppText variant="bodySm" color="textSecondary" style={{ flex: 1 }}>
            {t('scan.hint')}
          </AppText>
        </View>

        {lookup.isError ? (
          <InlineNotice
            tone="danger"
            title={t('scan.notRecognized')}
            body={errorMessage(lookup.error)}
          />
        ) : null}

        <AppButton
          label={t('scan.simulate')}
          variant="secondary"
          loading={lookup.isPending}
          onPress={simulateScan}
          icon={<ScanLine size={18} color={colors.text} strokeWidth={2.2} />}
          testID="scan-simulate"
        />
      </View>
    </Screen>
  );
}
