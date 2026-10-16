import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';

import {
  AppButton,
  AppHeader,
  AppText,
  Avatar,
  Card,
  DetailRow,
  Divider,
  InlineNotice,
  Screen,
  TextField,
} from '@parkflow/client/components/ui';

import { spacing } from '@parkflow/design/spacing';
import { useLocale } from '@parkflow/client/hooks/useLocale';
import { useCurrentUser } from '@parkflow/client/hooks/useSession';
import { queryKeys } from '@parkflow/client/hooks/queryKeys';
import { useAuthStore } from '@parkflow/client/store/authStore';
import { services } from '@parkflow/client/services';
import { formatDate } from '@parkflow/client/utils/time';
import { errorMessage } from '@parkflow/client/utils/errors';
import { haptics } from '@parkflow/client/utils/haptics';
import { asciiDigits } from '@parkflow/client/utils/authFlow';
import { captureLoginGuard } from '@parkflow/client/services/http/apiClient';

export default function PersonalInfoScreen() {
  const router = useRouter();
  const { t, dateLocale } = useLocale();
  const { user } = useCurrentUser();
  const setUser = useAuthStore((s) => s.setUser);
  const queryClient = useQueryClient();
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const [fullName, setFullName] = useState(user?.fullName ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [nationalId, setNationalId] = useState('');
  const phoneVerified = Boolean(user?.phoneVerifiedAt);
  const emailVerified = Boolean(user?.emailVerifiedAt);
  const profileVerified = phoneVerified || emailVerified;
  const contactEmailEditable = phoneVerified && !emailVerified;
  const normalizedEmail = email.trim().toLowerCase();
  const emailValid = !contactEmailEditable || !normalizedEmail || z.email().max(254).safeParse(normalizedEmail).success;
  const idValid = !nationalId || /^\d{9}$/.test(nationalId);

  const save = useMutation({
    mutationFn: async () => {
      const requireCurrent = captureLoginGuard();
      const updated = await services.profile.update(user!.id, {
        fullName: fullName.trim(),
        ...(contactEmailEditable && normalizedEmail !== (user?.email ?? '') ? { email: normalizedEmail || null } : {}),
        ...(profileVerified && nationalId ? { nationalId } : {}),
      });
      return { updated, requireCurrent };
    },
    onSuccess: async ({ updated, requireCurrent }) => {
      const canApply = () => {
        if (!mounted.current || useAuthStore.getState().user?.id !== updated.id) return false;
        try { requireCurrent(); return true; } catch { return false; }
      };
      if (!canApply()) return;
      // A read started before the save must not replace the returned profile.
      const queryKey = queryKeys.profile(updated.id);
      await queryClient.cancelQueries({ queryKey, exact: true });
      if (!canApply()) return;
      queryClient.setQueryData(queryKey, updated);
      haptics.success();
      setUser(updated);
      setNationalId('');
      router.back();
    },
    onError: () => haptics.error(),
  });

  const nameValid = fullName.trim().length >= 2 && fullName.trim().length <= 60;
  const dirty = fullName !== (user?.fullName ?? '') || (contactEmailEditable && normalizedEmail !== (user?.email ?? '')) || Boolean(nationalId);

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
            maxLength={60}
            error={fullName.length > 0 && !nameValid ? t('onboarding.nameInvalid') : undefined}
          />

          <DetailRow label={t('profile.phone')} value={user?.phone ?? undefined} />
          {profileVerified ? (
            <>
              {phoneVerified ? <AppText variant="bodySm" color="textSecondary">{t('profile.phoneReadOnly')}</AppText> : null}
              <TextField label={t('profile.email')} value={emailVerified ? user?.email ?? '' : email}
                onChangeText={contactEmailEditable ? setEmail : undefined} editable={contactEmailEditable}
                autoComplete="email" keyboardType="email-address" autoCapitalize="none" autoCorrect={false} maxLength={254}
                error={!emailValid ? t('onboarding.emailInvalid') : undefined} />
              <AppText variant="bodySm" color="textSecondary">{t(emailVerified ? 'profile.emailReadOnly' : 'profile.contactUnverified')}</AppText>
              <DetailRow label={t('profile.nationalId')} value={user?.nationalIdMasked ?? '—'} />
              <TextField label={t('profile.nationalIdReplace')} value={nationalId}
                onChangeText={(value) => setNationalId(asciiDigits(value).replace(/\D/g, ''))}
                keyboardType="number-pad" autoComplete="off" maxLength={9}
                error={!idValid ? t('profile.nationalIdInvalid') : undefined} />
              <AppText variant="bodySm" color="textSecondary">{t('profile.nationalIdHint')}</AppText>
            </>
          ) : <DetailRow label={t('profile.email')} value={user?.email ?? undefined} />}
        </Card>

        <Card padding="lg" style={{ gap: spacing.md }}>
          <Divider />
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
          disabled={!dirty || !nameValid || !emailValid || !idValid}
          loading={save.isPending}
          onPress={() => save.mutate()}
        />
      </View>
    </Screen>
  );
}
