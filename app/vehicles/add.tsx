import { View } from 'react-native';
import { useRouter } from 'expo-router';

import { AppHeader, AppText, InlineNotice, Screen } from '@/components/ui';
import { VehicleForm } from '@/components/domain/VehicleForm';
import { spacing } from '@/theme/spacing';
import { useLocale } from '@/hooks/useLocale';
import { useAddVehicle } from '@/hooks/useVehicles';
import { errorMessage } from '@/utils/errors';
import { haptics } from '@/utils/haptics';

export default function AddVehicleScreen() {
  const router = useRouter();
  const { t } = useLocale();
  const addVehicle = useAddVehicle();

  return (
    <Screen keyboardAvoiding>
      <AppHeader title={t('vehicle.addNew')} leading="close" />

      <View style={{ gap: spacing.lg, marginTop: spacing.sm }}>
        <AppText variant="body" color="textSecondary">
          {t('onboarding.vehicleSubtitle')}
        </AppText>

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
          startExpanded
          onSubmit={(input) =>
            addVehicle.mutate(input, {
              onSuccess: () => {
                haptics.success();
                router.back();
              },
              onError: () => haptics.error(),
            })
          }
        />
      </View>
    </Screen>
  );
}
