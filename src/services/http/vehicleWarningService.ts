import { Platform } from 'react-native';
import type { ImagePickerAsset } from 'expo-image-picker';
import { z } from 'zod';
import { api, query } from './apiClient';
import type { CarServiceResult, GeoPoint } from '@/types';

const copy = z.object({ name: z.string().max(200), explanation: z.string().max(1000), causes: z.string().max(1000), action: z.string().max(1000) });
const resultSchema = z.object({
  status: z.enum(['identified', 'unknown', 'needs_clearer_photo', 'no_warnings']),
  warnings: z.array(z.object({
    symbol: z.string().max(80), color: z.enum(['red', 'amber', 'yellow', 'green', 'blue', 'white', 'unknown']), text: z.string().max(300),
    guidance: z.object({ ar: copy, en: copy, urgency: z.enum(['stop', 'urgent', 'soon']), categories: z.array(z.enum(['maintenance', 'tire_service'])), sources: z.array(z.string().url()) }).nullable(),
  })).max(16),
});
export type WarningResult = z.infer<typeof resultSchema>;
export type WarningObservation = WarningResult['warnings'][number];
export const MAX_WARNING_IMAGE_BYTES = 5 * 1024 * 1024;
export const WARNING_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export async function checkVehicleWarnings(asset: ImagePickerAsset, vehicleId: string) {
  if (!asset.mimeType || !WARNING_IMAGE_TYPES.includes(asset.mimeType) || !asset.fileSize || asset.fileSize > MAX_WARNING_IMAGE_BYTES) throw new Error('WARNING_INVALID_UPLOAD');
  const form = new FormData();
  form.append('vehicleId', vehicleId);
  if (Platform.OS === 'web') {
    const file = asset.file ?? await (await fetch(asset.uri)).blob();
    if (!WARNING_IMAGE_TYPES.includes(file.type) || file.size > MAX_WARNING_IMAGE_BYTES || !file.size) throw new Error('WARNING_INVALID_UPLOAD');
    form.append('image', file, 'dashboard');
  } else {
    form.append('image', { uri: asset.uri, name: 'dashboard', type: asset.mimeType } as unknown as Blob);
  }
  const raw = await api<unknown>('/vehicle-warnings/check', { method: 'POST', form });
  const result = resultSchema.safeParse(raw);
  if (!result.success) throw new Error('WARNING_MALFORMED');
  return result.data;
}

export function warningServices(symbol: string, center: GeoPoint) {
  return api<CarServiceResult>('/vehicle-warnings/services' + query({ symbol, ...center }));
}
