import { useEffect, useRef, useState } from 'react';
import { RefreshControl, View } from 'react-native';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { Camera, ScanLine } from 'lucide-react-native';

import {
  AppButton,
  AppHeader,
  AppText,
  Card,
  Divider,
  InlineNotice,
  Screen,
  Segmented,
  SkeletonGroup,
  StatusBadge,
  TextField,
} from '@/components/ui';
import { GateZonePicker } from '@/components/domain/GateZonePicker';
import { useGateScan, useGateZones, useSaveRules, useVisits } from '@/hooks/useGates';
import { useLocale } from '@/hooks/useLocale';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/spacing';
import { radius } from '@/theme/radius';
import { formatMoney } from '@/utils/money';
import { formatTime } from '@/utils/time';
import { errorMessage } from '@/utils/errors';
import { haptics } from '@/utils/haptics';
import { shekelsToMinor } from '@/utils/sharing';
import type { BadgeTone } from '@/components/ui/StatusBadge';
import type { GateZone, ParkingVisit, VisitStatus } from '@/types';

type Direction = 'entry' | 'exit';
const STATUS_TONE: Record<VisitStatus, BadgeTone> = { covered: 'success', grace: 'warning', overstaying: 'danger', unregistered: 'neutral', left: 'neutral' };

/**
 * Runs on a phone or tablet at the lot gate. It scans each driver's gate pass,
 * or takes a typed plate — the same event a plate camera sends.
 */
export default function GateModeScreen() {
  const { t } = useLocale();
  const zones = useGateZones();
  const [zoneId, setZoneId] = useState<string>();
  const zone = zones.data?.find((z) => z.id === zoneId);
  const visits = useVisits(zoneId);
  const { colors } = useTheme();

  return (
    <Screen bottomInset={spacing.giant} scrollProps={{ refreshControl: <RefreshControl refreshing={visits.isRefetching} onRefresh={() => void visits.refetch()} tintColor={colors.brand} /> }}>
      <AppHeader title={t('gate.modeTitle')} subtitle={t('gate.modeSubtitle')} />
      <View style={{ gap: spacing.lg }}>
        <GateZonePicker zones={zones.data ?? []} loading={zones.isPending} value={zone} onChange={(z) => setZoneId(z?.id)} />
        {zone ? (
          <>
            <Scanner zone={zone} />
            <RulesCard zone={zone} />
            <VisitList visits={visits.data} loading={visits.isPending} />
          </>
        ) : null}
      </View>
    </Screen>
  );
}

function Scanner({ zone }: { zone: GateZone }) {
  const { t, row } = useLocale();
  const { colors } = useTheme();
  const [direction, setDirection] = useState<Direction>('entry');
  const [plate, setPlate] = useState('');
  const [camera, setCamera] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const scan = useGateScan();
  const lastScan = useRef({ value: '', at: 0 });

  const submit = (input: { plate?: string; pass?: string }) => scan.mutate(
    { direction, scan: { zoneId: zone.id, ...input } },
    { onSuccess: () => { haptics.success(); setPlate(''); }, onError: () => haptics.error() },
  );
  // The camera reports the same code many times a second; one scan per code every few seconds.
  const onScanned = ({ data }: BarcodeScanningResult) => {
    const now = Date.now();
    if (scan.isPending || (data === lastScan.current.value && now - lastScan.current.at < 4000)) return;
    lastScan.current = { value: data, at: now };
    submit({ pass: data });
  };
  useEffect(() => { if (camera && permission && !permission.granted && permission.canAskAgain) void requestPermission(); }, [camera, permission, requestPermission]);

  const result = scan.data;
  return (
    <Card padding="lg" style={{ gap: spacing.lg }}>
      <Segmented variant="inset" value={direction} onChange={setDirection} options={[
        { value: 'entry', label: t('gate.entry') }, { value: 'exit', label: t('gate.exit') },
      ]} />
      {camera ? (
        <View style={{ width: '100%', aspectRatio: 1, borderRadius: radius.xl, overflow: 'hidden', backgroundColor: colors.deep, alignItems: 'center', justifyContent: 'center' }}>
          {permission?.granted ? (
            <CameraView style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }} facing="back"
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }} onBarcodeScanned={onScanned} />
          ) : (
            <AppText variant="bodySm" color="onDeepMuted" align="center" style={{ padding: spacing.xl }}>{t('scan.permissionBody')}</AppText>
          )}
        </View>
      ) : null}
      <AppButton label={camera ? t('gate.stopCamera') : t('gate.scanPass')} variant="secondary"
        icon={<ScanLine size={18} color={colors.text} />} onPress={() => setCamera((on) => !on)} />
      <View style={{ flexDirection: row, gap: spacing.sm, alignItems: 'flex-end' }}>
        <TextField label={t('gate.plate')} hint={t('gate.plateHint')} value={plate} onChangeText={setPlate} keyboardType="number-pad" maxLength={12}
          containerStyle={{ flex: 1 }} onSubmitEditing={() => plate.trim() && submit({ plate })} />
      </View>
      <AppButton label={direction === 'entry' ? t('gate.recordEntry') : t('gate.recordExit')} icon={<Camera size={18} color={colors.onBrand} />}
        loading={scan.isPending} disabled={plate.replace(/\D/g, '').length < 4} onPress={() => submit({ plate })} />
      {scan.isError ? <InlineNotice tone="danger" title={t('common.somethingWrong')} body={errorMessage(scan.error)} /> : null}
      {result && !scan.isError ? (
        <InlineNotice tone={result.status === 'overstaying' ? 'warning' : 'success'}
          title={`${result.plateNumber} · ${t(`gate.status.${result.status}`)}`}
          body={result.status === 'left' && result.violationCount ? t('gate.leftWithViolations', { count: result.violationCount, total: formatMoney(result.violationTotal) }) : undefined} />
      ) : null}
    </Card>
  );
}

function RulesCard({ zone }: { zone: GateZone }) {
  const { t } = useLocale();
  const save = useSaveRules();
  const [open, setOpen] = useState(false);
  const [grace, setGrace] = useState(String(zone.overstayGraceMinutes));
  const [fee, setFee] = useState(String(zone.overstayFee / 100));
  const [repeat, setRepeat] = useState(String(zone.overstayRepeatMinutes));
  const [max, setMax] = useState(String(zone.overstayMaxPerStay / 100));
  useEffect(() => {
    setGrace(String(zone.overstayGraceMinutes)); setFee(String(zone.overstayFee / 100));
    setRepeat(String(zone.overstayRepeatMinutes)); setMax(String(zone.overstayMaxPerStay / 100));
  }, [zone]);
  const rules = {
    overstayGraceMinutes: Number(grace), overstayFee: shekelsToMinor(fee),
    overstayRepeatMinutes: Number(repeat), overstayMaxPerStay: shekelsToMinor(max),
  };
  const valid = Number.isInteger(rules.overstayGraceMinutes) && rules.overstayGraceMinutes >= 0 && rules.overstayGraceMinutes <= 240
    && Number.isInteger(rules.overstayRepeatMinutes) && rules.overstayRepeatMinutes >= 15 && rules.overstayRepeatMinutes <= 1440
    && rules.overstayFee >= 0 && rules.overstayMaxPerStay >= 0;
  const municipal = zone.operator.type === 'municipality';

  return (
    <Card padding="lg" style={{ gap: spacing.md }}>
      <AppText variant="title">{t('gate.rulesTitle')}</AppText>
      <AppText variant="bodySm" color="textSecondary">
        {t('gate.rulesSummary', { grace: zone.overstayGraceMinutes, fee: formatMoney(zone.overstayFee), repeat: zone.overstayRepeatMinutes, max: formatMoney(zone.overstayMaxPerStay) })}
      </AppText>
      <AppText variant="caption" color="textTertiary">{municipal ? t('gate.municipalNote') : t('gate.privateNote')}</AppText>
      {open ? (
        <>
          <TextField label={t('gate.graceLabel')} value={grace} onChangeText={setGrace} keyboardType="number-pad" maxLength={3} />
          <TextField label={t('gate.feeLabel')} value={fee} onChangeText={setFee} keyboardType="decimal-pad" maxLength={6} />
          <TextField label={t('gate.repeatLabel')} value={repeat} onChangeText={setRepeat} keyboardType="number-pad" maxLength={4} />
          <TextField label={t('gate.maxLabel')} value={max} onChangeText={setMax} keyboardType="decimal-pad" maxLength={7} />
          {save.isError ? <AppText variant="caption" color="danger">{errorMessage(save.error)}</AppText> : null}
          <AppButton label={t('common.save')} disabled={!valid} loading={save.isPending}
            onPress={() => save.mutate({ zoneId: zone.id, rules }, { onSuccess: () => { haptics.success(); setOpen(false); } })} />
        </>
      ) : (
        <AppButton label={t('common.edit')} size="sm" variant="secondary" onPress={() => setOpen(true)} />
      )}
    </Card>
  );
}

function VisitList({ visits, loading }: { visits?: ParkingVisit[]; loading: boolean }) {
  const { t, row, dateLocale } = useLocale();
  if (loading) return <SkeletonGroup count={3} height={64} />;
  const inside = (visits ?? []).filter((v) => v.status !== 'left');
  const left = (visits ?? []).filter((v) => v.status === 'left');
  const line = (v: ParkingVisit) => [
    `${t('gate.entered')} ${formatTime(v.enteredAt, dateLocale)}`,
    v.exitedAt ? `${t('gate.left')} ${formatTime(v.exitedAt, dateLocale)}` : undefined,
    v.paidUntil && v.status !== 'left' ? `${t('gate.paidUntil')} ${formatTime(v.paidUntil, dateLocale)}` : undefined,
    v.violationCount ? t('gate.violationsLine', { count: v.violationCount, total: formatMoney(v.violationTotal) }) : undefined,
  ].filter(Boolean).join(' · ');
  const list = (items: ParkingVisit[]) => items.map((v, index) => (
    <View key={v.id} style={{ gap: spacing.xs }}>
      {index ? <Divider /> : null}
      <View style={{ flexDirection: row, alignItems: 'center', gap: spacing.sm, paddingTop: index ? spacing.sm : 0 }}>
        <AppText variant="titleLg" numeric style={{ flex: 1 }}>{v.plateNumber}</AppText>
        <StatusBadge label={t(`gate.status.${v.status}`)} tone={STATUS_TONE[v.status]} size="sm" />
      </View>
      <AppText variant="caption" color="textSecondary">{line(v)}</AppText>
    </View>
  ));
  return (
    <>
      <Card padding="lg" style={{ gap: spacing.sm }}>
        <AppText variant="title">{t('gate.inside', { count: inside.length })}</AppText>
        {inside.length ? list(inside) : <AppText variant="bodySm" color="textSecondary">{t('gate.nobodyInside')}</AppText>}
      </Card>
      {left.length ? (
        <Card padding="lg" tone="outline" style={{ gap: spacing.sm }}>
          <AppText variant="title">{t('gate.recentlyLeft')}</AppText>
          {list(left)}
        </Card>
      ) : null}
    </>
  );
}
