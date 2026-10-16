import { ScrollView, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { ShieldCheck } from 'lucide-react-native';

import {
  AppHeader,
  AppText,
  Card,
  DetailRow,
  Divider,
  EmptyState,
  ErrorState,
  Screen,
  SectionHeader,
  Skeleton,
} from '@/components/ui';
import { EvidenceFrame } from '@/components/domain/EvidenceFrame';
import { PlateBadge } from '@/components/domain/PlateBadge';

import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/spacing';
import { radius } from '@/theme/radius';
import { useLocale } from '@/hooks/useLocale';
import { useEvidence, useViolation } from '@/hooks/useViolations';
import { formatDateTime } from '@/utils/time';

export default function EvidenceScreen() {
  const { colors } = useTheme();
  const { t, row, dateLocale, locale } = useLocale();
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data: violation } = useViolation(id);
  const { data: evidence, isPending, isError, error, refetch } = useEvidence(id);

  if (isError) {
    return (
      <Screen>
        <AppHeader title={t('evidence.title')} />
        <ErrorState error={error} onRetry={() => void refetch()} />
      </Screen>
    );
  }

  if (isPending) {
    return (
      <Screen>
        <AppHeader title={t('evidence.title')} />
        <View style={{ gap: spacing.lg }}>
          <Skeleton height={240} radiusToken="xl" />
          <Skeleton height={120} radiusToken="xl" />
        </View>
      </Screen>
    );
  }

  if (!evidence) {
    return (
      <Screen>
        <AppHeader title={t('evidence.title')} />
        <EmptyState title={t('error.notFound')} body={t('error.notFoundBody')} />
      </Screen>
    );
  }

  return (
    <Screen>
      <AppHeader
        title={t('evidence.title')}
        subtitle={violation?.reference}
      />

      <View style={{ gap: spacing.xl }}>
        {/* ---- Primary capture ------------------------------------------ */}
        <EvidenceFrame
          view="wide"
          plateNumber={evidence.detectedPlate}
          capturedAt={evidence.firstDetectionAt}
          deviceId={evidence.deviceId}
          height={230}
        />

        {/* ---- Supporting frames ---------------------------------------- */}
        <View>
          <SectionHeader title={t('evidence.plateNumber')} />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: spacing.md, flexDirection: row }}
          >
            <EvidenceFrame
              view="plate"
              plateNumber={evidence.detectedPlate}
              capturedAt={evidence.firstDetectionAt}
              deviceId={evidence.deviceId}
              height={130}
              style={{ width: 220 }}
            />
            {evidence.additionalPhotoUrls.map((url) => (
              <EvidenceFrame
                key={url}
                view="context"
                plateNumber={evidence.detectedPlate}
                capturedAt={evidence.secondDetectionAt ?? evidence.firstDetectionAt}
                deviceId={evidence.deviceId}
                height={130}
                style={{ width: 220 }}
              />
            ))}
          </ScrollView>
        </View>

        {/* ---- Metadata -------------------------------------------------- */}
        <Card padding="lg" style={{ gap: spacing.md }}>
          <DetailRow label={t('evidence.plateNumber')}>
            <PlateBadge plateNumber={evidence.detectedPlate} size="sm" />
          </DetailRow>

          {violation ? (
            <DetailRow
              label={t('evidence.location')}
              value={locale === 'ar' ? violation.locationNameAr : violation.locationName}
            />
          ) : null}
          {violation?.zoneCode ? (
            <DetailRow label={t('violation.zone')} value={violation.zoneCode} />
          ) : null}

          <Divider />

          <DetailRow
            label={t('evidence.firstDetection')}
            value={formatDateTime(evidence.firstDetectionAt, dateLocale)}
          />
          {evidence.secondDetectionAt ? (
            <DetailRow
              label={t('evidence.secondDetection')}
              value={formatDateTime(evidence.secondDetectionAt, dateLocale)}
            />
          ) : null}
          <DetailRow
            label={t('evidence.source')}
            value={t(`evidence.source.${evidence.detectionSource}` as const)}
          />
          {evidence.deviceId ? (
            <DetailRow label="Device" value={evidence.deviceId} />
          ) : null}
          {evidence.officerId ? (
            <DetailRow label="Officer" value={evidence.officerId} />
          ) : null}
        </Card>

        <View
          style={{
            flexDirection: row,
            alignItems: 'flex-start',
            gap: spacing.md,
            padding: spacing.lg,
            borderRadius: radius.lg,
            backgroundColor: colors.surfaceAlt,
          }}
        >
          <ShieldCheck size={20} color={colors.textSecondary} strokeWidth={2.2} />
          <AppText variant="bodySm" color="textSecondary" style={{ flex: 1 }}>
            {t('evidence.disclaimer')}
          </AppText>
        </View>
      </View>
    </Screen>
  );
}
