import { useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Check, Paperclip, Plus, X } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';

import {
  AppButton,
  AppHeader,
  AppText,
  Card,
  DetailRow,
  Divider,
  ErrorState,
  InlineNotice,
  MoneyText,
  PressableScale,
  Screen,
  Skeleton,
  StatusBadge,
  SuccessCheck,
  TextField,
} from '@/components/ui';

import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/spacing';
import { radius } from '@/theme/radius';
import { useLocale } from '@/hooks/useLocale';
import { useSubmitAppeal, useViolation } from '@/hooks/useViolations';
import type { AppealAttachment, AppealReason } from '@/types';
import { createId } from '@/utils/id';
import { errorMessage } from '@/utils/errors';
import { haptics } from '@/utils/haptics';

const REASONS: AppealReason[] = [
  'paid_not_recognized',
  'wrong_vehicle',
  'wrong_location',
  'special_permit',
  'technical_issue',
  'other',
];

const MIN_NOTES = 10;
const MAX_ATTACHMENTS = 3;

export default function AppealScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { t, row } = useLocale();
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data: violation, isPending, isError, error, refetch } = useViolation(id);
  const submitAppeal = useSubmitAppeal();

  const [reason, setReason] = useState<AppealReason | undefined>();
  const [notes, setNotes] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [attachments, setAttachments] = useState<AppealAttachment[]>([]);

  const notesValid = notes.trim().length >= MIN_NOTES;
  const canSubmit = Boolean(reason) && notesValid;
  const canAttach = attachments.length < MAX_ATTACHMENTS;

  const pickPhotos = async () => {
    haptics.light();
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: MAX_ATTACHMENTS - attachments.length,
      // Kept small: attachments live in the on-device mock database.
      quality: 0.4,
    });
    if (result.canceled) return;

    const picked = result.assets.map<AppealAttachment>((asset, index) => ({
      id: createId('att'),
      name: asset.fileName ?? `photo-${attachments.length + index + 1}.jpg`,
      uri: asset.uri,
      mimeType: asset.mimeType ?? 'image/jpeg',
      sizeBytes: asset.fileSize ?? 0,
    }));
    setAttachments((current) => [...current, ...picked].slice(0, MAX_ATTACHMENTS));
  };

  if (isError) {
    return (
      <Screen>
        <AppHeader title={t('appeal.title')} />
        <ErrorState error={error} onRetry={() => void refetch()} />
      </Screen>
    );
  }

  if (isPending || !violation) {
    return (
      <Screen>
        <AppHeader title={t('appeal.title')} />
        <View style={{ gap: spacing.lg }}>
          <Skeleton height={120} radiusToken="xl" />
          <Skeleton height={280} radiusToken="xl" />
        </View>
      </Screen>
    );
  }

  // ---- Success state -------------------------------------------------------
  if (submitted) {
    return (
      <Screen>
        <AppHeader title={t('appeal.title')} leading="none" />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.lg }}>
          <SuccessCheck size={96} />
          <AppText variant="h1" align="center">
            {t('appeal.submitted')}
          </AppText>
          <AppText
            variant="body"
            color="textSecondary"
            align="center"
            style={{ maxWidth: 320 }}
          >
            {t('appeal.submittedBody')}
          </AppText>

          <Card padding="lg" style={{ alignSelf: 'stretch', gap: spacing.md }}>
            <DetailRow label={t('appeal.status')}>
              <StatusBadge label={t('appeal.status.under_review')} tone="info" />
            </DetailRow>
            <Divider />
            <DetailRow
              label={t('appeal.reference')}
              value={submitAppeal.data?.reference ?? violation.reference}
            />
            {attachments.length ? (
              <>
                <Divider />
                <DetailRow label={t('appeal.attachments')} value={String(attachments.length)} />
              </>
            ) : null}
          </Card>

          <AppButton
            label={t('common.done')}
            style={{ alignSelf: 'stretch' }}
            onPress={() => router.replace(`/violations/${violation.id}`)}
          />
        </View>
      </Screen>
    );
  }

  return (
    <Screen keyboardAvoiding bottomInset={spacing.lg}>
      <AppHeader title={t('appeal.title')} leading="close" />

      <View style={{ gap: spacing.xl }}>
        <Card padding="lg" style={{ flexDirection: row, alignItems: 'center', gap: spacing.md }}>
          <View style={{ flex: 1, gap: 4 }}>
            <AppText variant="titleLg">{t(`violation.type.${violation.type}` as const)}</AppText>
            <AppText variant="bodySm" color="textSecondary">
              {violation.reference}
            </AppText>
          </View>
          <MoneyText value={violation.amount} variant="h3" />
        </Card>

        {/* ---- Reason ---------------------------------------------------- */}
        <View style={{ gap: spacing.sm }}>
          <AppText variant="overline" color="textTertiary">
            {t('appeal.reason')}
          </AppText>

          <Card padding="lg" style={{ paddingVertical: spacing.xs }}>
            {REASONS.map((option, index) => {
              const active = option === reason;
              return (
                <View key={option}>
                  {index > 0 ? <Divider /> : null}
                  <PressableScale
                    onPress={() => {
                      haptics.select();
                      setReason(option);
                    }}
                    scaleTo={0.99}
                    dimTo={0.65}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={t(`appeal.reason.${option}` as const)}
                    style={{
                      flexDirection: row,
                      alignItems: 'center',
                      gap: spacing.md,
                      paddingVertical: spacing.md,
                    }}
                  >
                    <View
                      style={{
                        width: 24,
                        height: 24,
                        borderRadius: 12,
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: active ? colors.brand : 'transparent',
                        borderWidth: active ? 0 : 2,
                        borderColor: colors.border,
                      }}
                    >
                      {active ? <Check size={14} color={colors.onBrand} strokeWidth={3} /> : null}
                    </View>
                    <AppText variant="titleLg" style={{ flex: 1 }}>
                      {t(`appeal.reason.${option}` as const)}
                    </AppText>
                  </PressableScale>
                </View>
              );
            })}
          </Card>
        </View>

        {/* ---- Notes ------------------------------------------------------ */}
        <TextField
          label={t('appeal.notes')}
          value={notes}
          onChangeText={setNotes}
          placeholder={t('appeal.notesPlaceholder')}
          multiline
          numberOfLines={5}
          maxLength={600}
          inputStyle={{ minHeight: 132, alignItems: 'flex-start', paddingVertical: spacing.md }}
          hint={`${notes.trim().length}/600`}
          error={notes.length > 0 && !notesValid ? t('appeal.notesRequired') : undefined}
        />

        {/* ---- Attachments ------------------------------------------------ */}
        <View style={{ gap: spacing.sm }}>
          <AppText variant="overline" color="textTertiary">
            {t('appeal.attachments')} · {t('common.optional')}
          </AppText>

          {attachments.length ? (
            <View style={{ flexDirection: row, flexWrap: 'wrap', gap: spacing.sm }}>
              {attachments.map((file) => (
                <View
                  key={file.id}
                  style={{
                    width: 88,
                    height: 88,
                    borderRadius: radius.md,
                    overflow: 'hidden',
                    backgroundColor: colors.surfaceAlt,
                  }}
                >
                  <Image
                    source={{ uri: file.uri }}
                    style={{ width: '100%', height: '100%' }}
                    contentFit="cover"
                    accessibilityLabel={file.name}
                  />
                  <PressableScale
                    onPress={() =>
                      setAttachments((current) => current.filter((a) => a.id !== file.id))
                    }
                    haptic="light"
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={t('appeal.removeAttachment')}
                    style={{
                      position: 'absolute',
                      top: 4,
                      right: 4,
                      width: 24,
                      height: 24,
                      borderRadius: 12,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: 'rgba(0,0,0,0.55)',
                    }}
                  >
                    <X size={14} color={colors.onBrand} strokeWidth={2.6} />
                  </PressableScale>
                </View>
              ))}
            </View>
          ) : null}

          <PressableScale
            onPress={() => void pickPhotos()}
            disabled={!canAttach}
            accessibilityRole="button"
            accessibilityLabel={t('appeal.addAttachment')}
            style={{
              flexDirection: row,
              alignItems: 'center',
              gap: spacing.md,
              padding: spacing.lg,
              borderRadius: radius.lg,
              borderWidth: 2,
              borderStyle: 'dashed',
              borderColor: colors.border,
              opacity: canAttach ? 1 : 0.5,
            }}
          >
            <View
              style={{
                width: 40,
                height: 40,
                borderRadius: radius.md,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: colors.surfaceAlt,
              }}
            >
              <Paperclip size={18} color={colors.textSecondary} strokeWidth={2.1} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <AppText variant="titleLg">{t('appeal.addAttachment')}</AppText>
              <AppText variant="caption" color="textTertiary">
                {t('appeal.attachmentLimit', { max: MAX_ATTACHMENTS })}
              </AppText>
            </View>
            <Plus size={18} color={colors.textTertiary} strokeWidth={2.2} />
          </PressableScale>
        </View>

        {submitAppeal.isError ? (
          <InlineNotice
            tone="danger"
            title={t('common.somethingWrong')}
            body={errorMessage(submitAppeal.error)}
          />
        ) : null}

        <AppButton
          label={t('appeal.submit')}
          disabled={!canSubmit}
          loading={submitAppeal.isPending}
          onPress={() =>
            submitAppeal.mutate(
              {
                violationId: violation.id,
                reason: reason!,
                notes,
                attachments,
              },
              {
                onSuccess: () => {
                  haptics.success();
                  setSubmitted(true);
                },
                onError: () => haptics.error(),
              },
            )
          }
          testID="submit-appeal"
        />
      </View>
    </Screen>
  );
}
