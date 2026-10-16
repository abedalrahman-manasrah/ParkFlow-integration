import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { AppButton } from '@/components/ui/AppButton';
import { AppText } from '@/components/ui/AppText';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { ReportIcon, roadReportColor } from './RoadReportMarker';
import { useConfirmRoadReport, useRejectRoadReport } from '@/hooks/useRoadReports';
import { useLocale } from '@/hooks/useLocale';
import { useTheme } from '@/theme/ThemeProvider';
import { radius } from '@/theme/radius';
import { spacing } from '@/theme/spacing';
import type { RoadReport } from '@/types';
import type { TranslationKey } from '@/i18n';
import { isAppError } from '@/utils/errors';

function minutesUntil(iso: string) { return Math.max(0, Math.ceil((Date.parse(iso) - Date.now()) / 60_000)); }
function minutesSince(iso: string) { return Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 60_000)); }

export function RoadReportDetailsSheet({ report, visible, onClose, onUpdated }: { report?: RoadReport; visible: boolean; onClose: () => void; onUpdated: (report: RoadReport) => void }) {
  const { colors } = useTheme();
  const { t } = useLocale();
  const confirm = useConfirmRoadReport(report?.id);
  const reject = useRejectRoadReport(report?.id);
  const [attemptedReportId, setAttemptedReportId] = useState<string>();
  useEffect(() => {
    confirm.reset();
    reject.reset();
    setAttemptedReportId(undefined);
  }, [report?.id, visible]);
  if (!report) return null;
  const remaining = minutesUntil(report.expiresAt);
  const confidence = remaining <= 10 ? 'expiring' : report.status === 'disputed' ? 'disputed' : report.confirmationCount > 0 ? 'confirmed' : 'new';
  const pending = confirm.isPending || reject.isPending;
  const error = attemptedReportId === report.id ? confirm.error ?? reject.error : undefined;
  const serverCode = isAppError(error) ? String(error.details?.serverCode ?? '') : '';
  const errorKey: TranslationKey = serverCode === 'SELF_VOTE_NOT_ALLOWED'
    ? 'roadReports.error.selfVote'
    : serverCode === 'ALREADY_VOTED'
      ? 'roadReports.error.alreadyVoted'
      : serverCode === 'REPORT_EXPIRED'
        ? 'roadReports.error.expired'
        : serverCode === 'REPORT_INACTIVE'
          ? 'roadReports.error.inactive'
          : 'roadReports.error.generic';
  const vote = (kind: 'confirm' | 'reject') => {
    const mutation = kind === 'confirm' ? confirm : reject;
    setAttemptedReportId(report.id);
    mutation.mutate(undefined, { onSuccess: onUpdated });
  };
  const close = () => {
    confirm.reset();
    reject.reset();
    setAttemptedReportId(undefined);
    onClose();
  };
  return (
    <BottomSheet visible={visible} onClose={close} title={t(`roadReports.type.${report.type}`)}>
      <View style={{ gap: spacing.lg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <View style={{ width: 42, height: 42, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: roadReportColor(report.type, colors) }}><ReportIcon type={report.type} color={colors.textOnColor} size={21} /></View>
          <View style={{ flex: 1, gap: spacing.xs }}>
            <AppText color="textSecondary">{t('roadReports.age', { minutes: minutesSince(report.createdAt) })}</AppText>
            <AppText variant="caption" color={confidence === 'disputed' ? 'danger' : 'success'}>{t(`roadReports.confidence.${confidence}`)}</AppText>
          </View>
          {report.isDemo ? <View style={{ paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: radius.pill, backgroundColor: colors.warningSoft }}><AppText variant="caption" color="warningText">{t('roadReports.demo')}</AppText></View> : null}
        </View>
        <View style={{ gap: spacing.sm }}>
          {report.severity ? <AppText>{t('roadReports.severity')}: {t(`roadReports.severity.${report.severity}`)}</AppText> : null}
          {report.direction ? <AppText>{t('roadReports.direction')}: {t(`roadReports.direction.${report.direction}`)}</AppText> : null}
          {report.description ? <AppText color="textSecondary">{report.description}</AppText> : null}
          <AppText variant="caption" color="textTertiary">{t('roadReports.expiresIn', { minutes: remaining })}</AppText>
        </View>
        {error && report.canVote ? <AppText color="danger" accessibilityLiveRegion="polite">{t(errorKey)}</AppText> : null}
        {report.viewerVote ? <AppText color="textSecondary" align="center">{t('roadReports.responseRecorded')}</AppText> : report.isOwnReport ? <AppText color="textSecondary" align="center">{t('roadReports.ownReport')}</AppText> : !report.canVote ? <AppText color="textSecondary" align="center">{t('roadReports.unavailable')}</AppText> : (
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <AppButton label={t('roadReports.notThere')} onPress={() => vote('reject')} loading={reject.isPending} disabled={pending} variant="danger" style={{ flex: 1 }} />
            <AppButton label={t('roadReports.stillThere')} onPress={() => vote('confirm')} loading={confirm.isPending} disabled={pending} style={{ flex: 1 }} />
          </View>
        )}
      </View>
    </BottomSheet>
  );
}
