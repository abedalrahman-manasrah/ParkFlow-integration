import { useCallback, useEffect, useRef, useState } from 'react';
import { Image, Linking, Platform, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Camera, ImageIcon } from 'lucide-react-native';
import { AppButton, AppHeader, AppText, Card, EmptyState, ErrorState, InlineNotice, Reveal, Screen } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';
import { VehicleSelectorSheet } from '@/components/domain/VehicleSelectorSheet';
import { useVehicles } from '@/hooks/useVehicles';
import { useLocale } from '@/hooks/useLocale';
import { useUserLocation } from '@/hooks/useUserLocation';
import { spacing } from '@/theme/spacing';
import { RAMALLAH_CENTER } from '@/data/mapDefaults';
import { distanceMeters, formatDistance } from '@/utils/geo';
import { AppError } from '@/utils/errors';
import { useMapLayersStore } from '@/store/mapLayersStore';
import { useCarServicesStore } from '@/store/carServicesStore';
import { useWarningServiceNavigationStore } from '@/store/warningServiceNavigationStore';
import { checkVehicleWarnings, warningServices, MAX_WARNING_IMAGE_BYTES, WARNING_IMAGE_TYPES, type WarningResult, type WarningObservation } from '@/services/http/vehicleWarningService';
import type { CarServiceBusiness, GeoPoint } from '@/types';
import type { TranslationKey } from '@/i18n';
import { isPlateOnlyName } from '@/utils/plate';

const errorKeys: Record<string, TranslationKey> = {
  WARNING_INVALID_UPLOAD: 'warning.invalidFile', WARNING_NOT_CONFIGURED: 'warning.unavailable',
  WARNING_RATE_LIMITED: 'warning.rateLimited', RATE_LIMITED: 'warning.rateLimited',
  WARNING_TIMEOUT: 'warning.timeout', WARNING_PROVIDER_UNAVAILABLE: 'warning.unavailable',
  WARNING_MALFORMED: 'warning.malformed', UNAUTHORIZED: 'warning.signIn',
  network: 'warning.network',
};
function warningError(error: unknown): TranslationKey {
  const code = error instanceof AppError ? String(error.details?.serverCode ?? error.code) : error instanceof Error ? error.message : '';
  return errorKeys[code] ?? 'warning.failed';
}

function WarningCard({ warning, location, requestLocation, locationStatus }: {
  warning: WarningObservation; location?: GeoPoint; requestLocation: () => Promise<GeoPoint | undefined>; locationStatus: string;
}) {
  const { t, locale } = useLocale();
  const router = useRouter();
  const [matches, setMatches] = useState<CarServiceBusiness[]>();
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [truncated, setTruncated] = useState(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const guidance = warning.guidance;
  const copy = guidance?.[locale];
  const showServices = async () => {
    if (loading) return;
    setLoading(true); setFailed(false); setMatches(undefined);
    try {
      const point = location ?? (locationStatus === 'idle' ? await requestLocation() : undefined);
      const result = await warningServices(warning.symbol, point ?? RAMALLAH_CENTER);
      if (alive.current) { setMatches(result.services); setTruncated(result.truncated); }
    } catch { if (alive.current) setFailed(true); }
    finally { if (alive.current) setLoading(false); }
  };
  const sorted = [...(matches ?? [])].sort((a, b) => location ? distanceMeters(location, a) - distanceMeters(location, b) : 0);
  return <Card padding="lg" style={{ gap: spacing.md }}>
    <AppText variant="h2">{copy?.name ?? t('warning.unknown')}</AppText>
    <AppText>{t('warning.color', { color: t(`warning.color.${warning.color}`) })}</AppText>
    {warning.text ? <AppText>{t('warning.visibleText', { text: warning.text })}</AppText> : null}
    {copy && guidance ? <>
      <AppText>{copy.explanation}</AppText>
      <AppText>{t('warning.causes', { causes: copy.causes })}</AppText>
      <InlineNotice tone={guidance.urgency === 'stop' ? 'danger' : 'warning'} title={t(`warning.urgency.${guidance.urgency}`)} body={copy.action} />
      <AppText variant="caption">{guidance.categories.map(category => t(`carServices.category.${category}`)).join(' · ')}</AppText>
      {guidance.sources.map(source => <AppButton key={source} size="sm" variant="ghost" label={t('warning.source')} onPress={() => { void Linking.openURL(source).catch(() => {}); }} />)}
    </> : <AppText>{t('warning.unknownBody')}</AppText>}
    <AppButton label={t('warning.showServices')} disabled={!guidance} loading={loading} onPress={() => void showServices()} />
    {matches !== undefined ? <>
      <AppText variant="caption">{t(location ? 'warning.byDistance' : 'warning.defaultArea')}</AppText>
      {truncated ? <AppText variant="caption">{t('carServices.truncated')}</AppText> : null}
      {sorted.length === 0 ? <EmptyState compact title={t('warning.noServices')} body={t('warning.noServicesBody')} /> : sorted.map(service => <AppButton
        key={service.id} variant="secondary" label={`${locale === 'ar' ? service.nameAr : service.nameEn}${location ? ` · ${formatDistance(distanceMeters(location, service))}` : ''}`}
        onPress={() => {
          const category = guidance?.categories.find(c => service.categories.includes(c));
          if (!category) return;
          useMapLayersStore.getState().setCarServiceCategory(category);
          useMapLayersStore.getState().setPrimaryCategory('car_services');
          useCarServicesStore.getState().setCategory(category);
          useWarningServiceNavigationStore.getState().open(service);
          router.push('/(tabs)/map');
        }} />)}
    </> : null}
    {failed ? <InlineNotice tone="danger" title={t('warning.servicesFailed')} action={{ label: t('carServices.retry'), onPress: () => void showServices() }} /> : null}
  </Card>;
}

export default function WarningCheckScreen() {
  const { t, row } = useLocale();
  const { colors } = useTheme();
  const router = useRouter();
  const { vehicleId } = useLocalSearchParams<{ vehicleId?: string }>();
  const { data: vehicles = [], isPending, isError, error: vehiclesError, refetch } = useVehicles();
  const [selectedId, setSelectedId] = useState(vehicleId);
  const selected = vehicles.find(v => v.id === selectedId) ?? vehicles.find(v => v.isDefault) ?? vehicles[0];
  const selectedName = selected && isPlateOnlyName(selected.displayName, selected.plateNumber) ? t(`vehicle.type.${selected.type}`) : selected?.displayName;
  const [selector, setSelector] = useState(false);
  const [image, setImage] = useState<ImagePicker.ImagePickerAsset>();
  const [result, setResult] = useState<WarningResult>();
  const [error, setError] = useState<TranslationKey>();
  const [busy, setBusy] = useState(false);
  const [webCamera, setWebCamera] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const cameraRef = useRef<CameraView>(null);
  const [, requestCameraPermission] = useCameraPermissions();
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useFocusEffect(useCallback(() => {
    return () => setWebCamera(false);
  }, []));
  const { location, status: locationStatus, request: requestLocation } = useUserLocation(false);

  // Picker calls run directly on the web button gesture (required by browsers).
  const pick = async (camera: boolean) => {
    if (busy) return;
    setBusy(true); setError(undefined);
    try {
      if (camera && Platform.OS === 'web') {
        const permission = await requestCameraPermission();
        if (!alive.current) return;
        if (!permission.granted) { setError('warning.cameraDenied'); return; }
        setCameraReady(false); setWebCamera(true);
        return;
      }
      if (Platform.OS !== 'web') {
        const permission = camera ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) { if (alive.current) setError(camera ? 'warning.cameraDenied' : 'warning.galleryDenied'); return; }
      }
      const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.85, allowsMultipleSelection: false };
      const picked = await (camera ? ImagePicker.launchCameraAsync(options) : ImagePicker.launchImageLibraryAsync(options));
      if (picked.canceled || !alive.current) return;
      const asset = picked.assets[0];
      const type = asset.file?.type ?? asset.mimeType;
      const size = asset.file?.size ?? asset.fileSize;
      if (!type || !WARNING_IMAGE_TYPES.includes(type) || size === undefined || size <= 0 || size > MAX_WARNING_IMAGE_BYTES) { setError('warning.invalidFile'); return; }
      setImage({ ...asset, mimeType: type, fileSize: size }); setResult(undefined);
    } catch { if (alive.current) setError(camera ? 'warning.cameraDenied' : 'warning.galleryDenied'); }
    finally { if (alive.current) setBusy(false); }
  };
  const captureWeb = async () => {
    if (!cameraReady || busy) return;
    setBusy(true); setError(undefined);
    try {
      const photo = await cameraRef.current?.takePictureAsync({ quality: 0.85, imageType: 'jpg' });
      if (!photo) throw new Error('No photo');
      const blob = await (await fetch(photo.uri)).blob();
      if (!alive.current) return;
      if (!WARNING_IMAGE_TYPES.includes(blob.type) || !blob.size || blob.size > MAX_WARNING_IMAGE_BYTES) { setError('warning.invalidFile'); return; }
      setImage({ uri: photo.uri, width: photo.width, height: photo.height, mimeType: blob.type, fileSize: blob.size });
      setResult(undefined); setWebCamera(false);
    } catch { if (alive.current) { setWebCamera(false); setError('warning.cameraDenied'); } }
    finally { if (alive.current) setBusy(false); }
  };
  const check = async () => {
    if (!image || !selected || busy) return;
    setBusy(true); setError(undefined); setResult(undefined);
    try { const next = await checkVehicleWarnings(image, selected.id); if (alive.current) setResult(next); }
    catch (e) { if (alive.current) setError(warningError(e)); }
    finally { if (alive.current) setBusy(false); }
  };
  return <Screen>
    <AppHeader title={t('warning.title')} />
    <Reveal style={{ gap: spacing.lg }}>
      <InlineNotice tone="warning" title={t('warning.limitTitle')} body={t('warning.limitBody')} />
      <AppText>{t('warning.photoHelp')}</AppText>
      <AppText variant="caption">{t('warning.privacy')}</AppText>
    </Reveal>
    <View style={{ gap: spacing.lg, marginTop: spacing.lg }}>
      {isError ? <ErrorState error={vehiclesError} onRetry={() => void refetch()} /> : !isPending && !selected ? <EmptyState title={t('vehicle.empty')} action={{ label: t('vehicle.addNew'), onPress: () => router.push('/vehicles/add') }} /> : null}
      <AppButton variant="secondary" label={selected ? `${selectedName} · ${selected.plateNumber}` : t('vehicle.select')} disabled={busy || isPending || isError} onPress={() => setSelector(true)} />
      <View style={{ flexDirection: row, gap: spacing.sm }}>
        <AppButton label={t('warning.camera')} variant="secondary" style={{ flex: 1 }} icon={<Camera size={18} color={colors.text} strokeWidth={2.2} />} disabled={busy || webCamera} onPress={() => void pick(true)} />
        <AppButton label={t('warning.gallery')} variant="secondary" style={{ flex: 1 }} icon={<ImageIcon size={18} color={colors.text} strokeWidth={2.2} />} disabled={busy || webCamera} onPress={() => void pick(false)} />
      </View>
      {webCamera ? <>
        <CameraView ref={cameraRef} facing="back" mode="picture" style={{ width: '100%', height: 260 }}
          onCameraReady={() => setCameraReady(true)} onMountError={() => { setWebCamera(false); setError('warning.cameraDenied'); }} />
        <AppButton label={t('warning.camera')} loading={busy} disabled={!cameraReady} onPress={() => void captureWeb()} />
        <AppButton label={t('common.cancel')} variant="ghost" disabled={busy} onPress={() => setWebCamera(false)} />
      </> : null}
      {image ? <>
        <Image source={{ uri: image.uri }} accessibilityLabel={t('warning.preview')} style={{ width: '100%', height: 240, borderRadius: 16 }} resizeMode="contain" />
        <AppButton label={t('warning.retake')} variant="ghost" disabled={busy} onPress={() => { setImage(undefined); setResult(undefined); setError(undefined); }} />
        <AppButton label={t('warning.check')} loading={busy} disabled={!selected || isError || webCamera} onPress={() => void check()} />
      </> : null}
      {error ? <InlineNotice tone="danger" title={t(error)} /> : null}
      {locationStatus === 'denied' || locationStatus === 'unavailable' ? <InlineNotice tone="info" title={t('warning.locationDenied')} action={{ label: t('warning.retryLocation'), onPress: () => void requestLocation() }} /> : null}
      {result && result.status !== 'identified' ? <InlineNotice tone="info" title={t(`warning.status.${result.status}`)} /> : null}
      {result?.warnings.map((warning, index) => <WarningCard key={`${selected?.id}-${index}-${warning.symbol}`} warning={warning} location={location} requestLocation={requestLocation} locationStatus={locationStatus} />)}
    </View>
    <VehicleSelectorSheet visible={selector} onClose={() => setSelector(false)} vehicles={vehicles} selectedId={selected?.id}
      onSelect={vehicle => { setSelectedId(vehicle.id); setSelector(false); setResult(undefined); }}
      onAddVehicle={() => { setSelector(false); router.push('/vehicles/add'); }} />
  </Screen>;
}
