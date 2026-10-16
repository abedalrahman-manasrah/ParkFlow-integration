import { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation } from '@tanstack/react-query';

import {
  AppButton,
  AppHeader,
  Avatar,
  Card,
  DetailRow,
  InlineNotice,
  Screen,
  TextField,
} from '@/components/ui';

import { spacing } from '@/theme/spacing';
import { useLocale } from '@/hooks/useLocale';
import { useCurrentUser } from '@/hooks/useSession';
import { useAuthStore } from '@/store/authStore';
import { services } from '@/services';
import { formatDate } from '@/utils/time';
import { errorMessage } from '@/utils/errors';
import { haptics } from '@/utils/haptics';

export default function PersonalInfoScreen() {
  const router = useRouter();
  const { t, dateLocale } = useLocale();
  const { user } = useCurrentUser();
  const setUser = useAuthStore((s) => s.setUser);

  const [fullName, setFullName] = useState(user?.fullName ?? '');

  const save = useMutation({
    mutationFn: () => services.profile.update(user!.id, { fullName }),
    onSuccess: (updated) => {
      haptics.success();
      setUser(updated);
      router.back();
    },
    onError: () => haptics.error(),
  });

  const nameValid = fullName.trim().length >= 2;
  const dirty = fullName !== (user?.fullName ?? '');

  return (
    <Screen keyboardAvoiding>
      <AppHeader title={t('profile.personalInfo')} />

      <View style={{ gap: spacing.xl }}>
        <View style={{ alignItems: 'center', gap: spacing.md }}>
          <Avatar name={fullName || user?.fullName} size={84} />
        </View>

        <Card padding="lg" style={{ gap: spacing.lg }}>
          <TextField
            label={t('profile.fullName')}
            value={fullName}
            onChangeText={setFullName}
            autoCapitalize="words"
            autoComplete="name"
            error={fullName.length > 0 && !nameValid ? t('onboarding.nameInvalid') : undefined}
          />

          <DetailRow label={t('profile.email')} value={user?.email ?? undefined} />
          <DetailRow
            label={t('profile.memberSince')}
            value={user ? formatDate(user.createdAt, dateLocale) : '—'}
          />
        </Card>

        {save.isError ? (
          <InlineNotice
            tone="danger"
            title={t('common.somethingWrong')}
            body={errorMessage(save.error)}
          />
        ) : null}

        <AppButton
          label={t('common.save')}
          disabled={!dirty || !nameValid}
          loading={save.isPending}
          onPress={() => save.mutate()}
        />
      </View>
    </Screen>
  );
}
