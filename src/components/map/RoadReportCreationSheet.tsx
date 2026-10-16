import { Pressable, ScrollView, View } from 'react-native';
import { Check, Gift } from 'lucide-react-native';
import { AppButton } from '@/components/ui/AppButton';
import { AppText } from '@/components/ui/AppText';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { InlineNotice } from '@/components/ui/InlineNotice';
import { TextField } from '@/components/ui/TextField';
import { ReportIcon, roadReportColor } from './RoadReportMarker';
import { useLocale } from '@/hooks/useLocale';
import { useTheme } from '@/theme/ThemeProvider';
import { radius } from '@/theme/radius';
import { spacing } from '@/theme/spacing';
import type { CreateRoadReportInput, RoadReportDirection, RoadReportSeverity, RoadReportType } from '@/types';
import { ROAD_REPORT_TYPES } from '@/types';

export type ReportCreationStep = 'type' | 'details' | 'confirm';

const directions: RoadReportDirection[] = ['northbound', 'southbound', 'eastbound', 'westbound', 'both'];
const severities: RoadReportSeverity[] = ['low', 'moderate', 'high', 'critical'];

interface Props {
  visible: boolean;
  step: ReportCreationStep;
  draft: Partial<CreateRoadReportInput>;
  onChange: (next: Partial<CreateRoadReportInput>) => void;
  onChooseType: (type: RoadReportType) => void;
  onStepChange: (step: ReportCreationStep) => void;
  onClose: () => void;
  onSubmit: () => void;
  loading: boolean;
  error?: string;
}

function Choice<T extends string>({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable onPress={onPress} style={{ paddingHorizontal: spacing.md, minHeight: 38, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: selected ? colors.brandSoft : colors.surfaceAlt, borderWidth: 1, borderColor: selected ? colors.brand : colors.border }}>
      <AppText variant="caption" weight={selected ? 'bold' : 'medium'} color={selected ? 'successText' : 'textSecondary'}>{label}</AppText>
    </Pressable>
  );
}

export function RoadReportCreationSheet(props: Props) {
  const { colors } = useTheme();
  const { t, row } = useLocale();
  const { visible, step, draft } = props;
  const title = step === 'type' ? t('roadReports.createTitle') : step === 'details' ? t('roadReports.detailsTitle') : t('roadReports.confirmTitle');
  return (
    <BottomSheet visible={visible} onClose={props.onClose} title={title} subtitle={step === 'type' ? t('roadReports.createHelp') : undefined}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: spacing.lg }}>
        {step === 'type' ? (
          <View style={{ flexDirection: row, flexWrap: 'wrap', gap: spacing.sm }}>
            {ROAD_REPORT_TYPES.map((type) => {
              const color = roadReportColor(type, colors);
              return (
                <Pressable key={type} onPress={() => props.onChooseType(type)} style={{ width: '48%', minHeight: 58, padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.surfaceAlt, flexDirection: row, alignItems: 'center', gap: spacing.sm }}>
                  <View style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: color }}><ReportIcon type={type} color={colors.textOnColor} /></View>
                  <AppText variant="label" style={{ flex: 1 }}>{t(`roadReports.type.${type}`)}</AppText>
                </Pressable>
              );
            })}
          </View>
        ) : null}

        {step === 'details' ? (
          <>
            <View style={{ gap: spacing.sm }}>
              <AppText variant="label" color="textSecondary">{t('roadReports.severity')}</AppText>
              <View style={{ flexDirection: row, flexWrap: 'wrap', gap: spacing.sm }}>{severities.map((value) => <Choice key={value} label={t(`roadReports.severity.${value}`)} selected={draft.severity === value} onPress={() => props.onChange({ severity: draft.severity === value ? undefined : value })} />)}</View>
            </View>
            <View style={{ gap: spacing.sm }}>
              <AppText variant="label" color="textSecondary">{t('roadReports.direction')}</AppText>
              <View style={{ flexDirection: row, flexWrap: 'wrap', gap: spacing.sm }}>{directions.map((value) => <Choice key={value} label={t(`roadReports.direction.${value}`)} selected={draft.direction === value} onPress={() => props.onChange({ direction: draft.direction === value ? undefined : value })} />)}</View>
            </View>
            <TextField label={t('roadReports.description')} placeholder={t('roadReports.descriptionPlaceholder')} value={draft.description ?? ''} onChangeText={(description) => props.onChange({ description })} maxLength={280} multiline inputStyle={{ minHeight: 76, alignItems: 'flex-start', paddingVertical: spacing.md }} />
            <AppButton label={t('common.continue')} onPress={() => props.onStepChange('confirm')} />
          </>
        ) : null}

        {step === 'confirm' && draft.type ? (
          <>
            <View style={{ backgroundColor: colors.surfaceAlt, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.sm }}>
              <View style={{ flexDirection: row, alignItems: 'center', gap: spacing.sm }}><Check color={colors.success} size={20} /><AppText variant="h3">{t(`roadReports.type.${draft.type}`)}</AppText></View>
              {draft.severity ? <AppText color="textSecondary">{t('roadReports.severity')}: {t(`roadReports.severity.${draft.severity}`)}</AppText> : null}
              {draft.direction ? <AppText color="textSecondary">{t('roadReports.direction')}: {t(`roadReports.direction.${draft.direction}`)}</AppText> : null}
              {draft.description ? <AppText color="textSecondary">{draft.description}</AppText> : null}
              <AppText variant="caption" color="textTertiary">{Number(draft.latitude).toFixed(5)}, {Number(draft.longitude).toFixed(5)}</AppText>
            </View>
            <InlineNotice
              tone="success"
              icon={<Gift size={18} color={colors.successText} strokeWidth={2.2} />}
              title={t('roadReports.pointsHintTitle')}
              body={t('roadReports.pointsHintBody')}
            />
            {props.error ? <AppText color="danger" accessibilityLiveRegion="polite">{props.error}</AppText> : null}
            <View style={{ flexDirection: row, gap: spacing.sm }}>
              <AppButton label={t('common.back')} onPress={() => props.onStepChange('details')} variant="secondary" style={{ flex: 1 }} />
              <AppButton label={t('roadReports.submit')} onPress={props.onSubmit} loading={props.loading} style={{ flex: 1.5 }} />
            </View>
          </>
        ) : null}
      </ScrollView>
    </BottomSheet>
  );
}
