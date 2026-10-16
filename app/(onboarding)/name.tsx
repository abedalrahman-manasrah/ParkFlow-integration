import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { z } from 'zod';

import {
  AppButton,
  AppText,
  InlineNotice,
  OnboardingStepper,
  Reveal,
  Screen,
  TextField,
} from '@/components/ui';
import { spacing } from '@/theme/spacing';
import { useLocale } from '@/hooks/useLocale';
import { useBlockHardwareBack } from '@/hooks/useBlockHardwareBack';
import { services } from '@/services';
import { useAuthStore } from '@/store/authStore';
import { errorMessage } from '@/utils/errors';
import { haptics } from '@/utils/haptics';

const schema = z.object({
  // Two characters is enough to be a real name without excluding short ones.
  fullName: z.string().trim().min(2).max(60),
});

type FormValues = z.infer<typeof schema>;

export default function NameScreen() {
  // The account already exists by this point — see useBlockHardwareBack.
  useBlockHardwareBack();
  const router = useRouter();
  const { t } = useLocale();
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);

  const { control, handleSubmit, formState } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { fullName: user?.fullName ?? '' },
    mode: 'onChange',
  });

  const save = useMutation({
    mutationFn: (values: FormValues) =>
      services.auth.completeProfile({ userId: user!.id, fullName: values.fullName }),
    onSuccess: (updated) => {
      haptics.success();
      setUser(updated);
      router.replace('/(onboarding)/vehicle');
    },
    onError: () => haptics.error(),
  });

  return (
    <Screen keyboardAvoiding>
      <View style={{ height: spacing.giant }} />
      <OnboardingStepper current={2} />

      <Reveal style={{ gap: spacing.sm }}>
        <AppText variant="h1">{t('onboarding.nameTitle')}</AppText>
        <AppText variant="bodyLg" color="textSecondary">
          {t('onboarding.nameSubtitle')}
        </AppText>
      </Reveal>

      <View style={{ marginTop: spacing.xxxl, gap: spacing.lg }}>
        <Controller
          control={control}
          name="fullName"
          render={({ field, fieldState }) => (
            <TextField
              label={t('onboarding.nameLabel')}
              emphasis="strong"
              value={field.value}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              placeholder="Yousef Khalil"
              autoCapitalize="words"
              autoComplete="name"
              textContentType="name"
              autoFocus
              returnKeyType="done"
              onSubmitEditing={handleSubmit((values) => save.mutate(values))}
              error={fieldState.error ? t('onboarding.nameInvalid') : undefined}
            />
          )}
        />

        {save.isError ? (
          <InlineNotice tone="danger" title={t('common.somethingWrong')} body={errorMessage(save.error)} />
        ) : null}
      </View>

      <View style={{ flex: 1 }} />

      <AppButton
        label={t('common.continue')}
        disabled={!formState.isValid}
        loading={save.isPending}
        onPress={handleSubmit((values) => save.mutate(values))}
        testID="name-continue"
      />
    </Screen>
  );
}
