import { View } from 'react-native';
import { useRouter } from 'expo-router';

import { AppButton, AppText, InlineNotice, OnboardingStepper, Reveal, Screen } from '@/components/ui';
import { VehicleForm } from '@/components/domain/VehicleForm';
import { spacing } from '@/theme/spacing';
import { useLocale } from '@/hooks/useLocale';
import { useBlockHardwareBack } from '@/hooks/useBlockHardwareBack';
import { useAddVehicle } from '@/hooks/useVehicles';
import { usePreferencesStore } from '@/store/preferencesStore';
import { errorMessage } from '@/utils/errors';
import { haptics } from '@/utils/haptics';

export default function AddFirstVehicleScreen() {
  // The account already exists by this point — see useBlockHardwareBack.
  useBlockHardwareBack();
  const router = useRouter();
  const { t } = useLocale();
  const addVehicle = useAddVehicle();
  const completeOnboarding = usePreferencesStore((s) => s.completeOnboarding);

  const finish = () => {
    completeOnboarding();
    router.replace('/(tabs)/map');
  };

  return (
    <Screen keyboardAvoiding>
      <View style={{ height: spacing.giant }} />
      <OnboardingStepper current={3} />

      <Reveal style={{ gap: spacing.sm }}>
        <AppText variant="h1">{t('onboarding.vehicleTitle')}</AppText>
        <AppText variant="bodyLg" color="textSecondary">
          {t('onboarding.vehicleSubtitle')}
        </AppText>
      </Reveal>

      <View style={{ marginTop: spacing.xxl, gap: spacing.lg }}>
        {addVehicle.isError ? (
          <InlineNotice
            tone="danger"
            title={t('common.somethingWrong')}
            body={errorMessage(addVehicle.error)}
          />
        ) : null}

        <VehicleForm
          submitLabel={t('vehicle.add')}
          isSubmitting={addVehicle.isPending}
          onSubmit={(input) =>
            addVehicle.mutate(input, {
              onSuccess: () => {
                haptics.success();
                finish();
              },
              onError: () => haptics.error(),
            })
          }
        />

        <AppButton
          label={t('common.skip')}
          variant="ghost"
          size="md"
          onPress={finish}
          disabled={addVehicle.isPending}
        />
      </View>
    </Screen>
  );
}
