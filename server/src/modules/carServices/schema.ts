import { z } from 'zod';

const text = (max: number) => z.string().trim().min(1).max(max);
const nullableText = (max: number) => z.string().trim().min(1).max(max).nullable().default(null);
const coordinate = (max: number) => z.number().finite().min(-max).max(max);

export const carServiceCategory = z.enum(['car_wash', 'oil_change', 'maintenance', 'tire_service']);
export type CarServiceCategoryValue = z.infer<typeof carServiceCategory>;

const sourceUrl = z.string().trim().max(2048).url().refine((value) => {
  const url = new URL(value);
  return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password;
}, 'Use an HTTP(S) URL without credentials');

export const carServiceRecord = z.object({
  id: text(120).regex(/^[a-z0-9_:-]+$/),
  nameAr: text(200),
  nameEn: text(200),
  categories: z.array(carServiceCategory).min(1).max(4),
  latitude: coordinate(90).nullable(),
  longitude: coordinate(180).nullable(),
  mapReady: z.boolean(),
  coordinateAccuracy: text(80),
  coordinateNoteAr: nullableText(500),
  coordinateNoteEn: nullableText(500),
  addressAr: nullableText(300),
  addressEn: nullableText(300),
  phone: nullableText(32).refine((value) => {
    if (!value) return true;
    const digits = value.replace(/\D/g, '').length;
    return /^\+?[0-9][0-9 ()-]{4,30}[0-9]$/.test(value) && digits >= 7 && digits <= 15;
  }, 'Use 7-15 phone digits'),
  website: sourceUrl.nullable().default(null),
  openingHoursText: nullableText(300),
  servicesAr: z.array(text(120)).max(40),
  servicesEn: z.array(text(120)).max(40),
  pricing: z.unknown().nullable().default(null),
  operatingStatus: text(80),
  verificationStatus: text(80),
  sourceName: text(200),
  sourceUrl,
  secondarySourceUrl: sourceUrl.nullable().default(null),
  lastCheckedAt: z.iso.datetime({ offset: true }).refine((value) => Date.parse(value) <= Date.now(), 'Last checked date cannot be in the future'),
}).strict().superRefine((record, ctx) => {
  const hasLatitude = record.latitude !== null;
  const hasLongitude = record.longitude !== null;
  if (hasLatitude !== hasLongitude) {
    ctx.addIssue({ code: 'custom', path: ['latitude'], message: 'Latitude and longitude must be provided together' });
  }
  if (record.mapReady && (!hasLatitude || !hasLongitude)) {
    ctx.addIssue({ code: 'custom', path: ['mapReady'], message: 'Map-ready records require valid coordinates' });
  }
});

export const datasetInput = z.object({
  allowedCategories: z.array(carServiceCategory).length(4).refine((value) => {
    const set = new Set(value);
    return set.size === 4 && ['car_wash', 'oil_change', 'maintenance', 'tire_service'].every((category) => set.has(category as CarServiceCategoryValue));
  }, 'Allowed categories must match the supported car service categories').optional(),
  services: z.array(carServiceRecord).min(1).max(1000),
}).passthrough();

const boundsCoordinate = (max: number) => z.coerce.number().finite().min(-max).max(max);
export const listInput = z.object({
  north: boundsCoordinate(90),
  south: boundsCoordinate(90),
  east: boundsCoordinate(180),
  west: boundsCoordinate(180),
  category: carServiceCategory.optional(),
}).strict().refine(
  (bounds) => bounds.north > bounds.south && bounds.east > bounds.west && bounds.north - bounds.south <= 2 && bounds.east - bounds.west <= 2,
  'Use ordered bounds spanning at most 2 degrees per axis',
);
