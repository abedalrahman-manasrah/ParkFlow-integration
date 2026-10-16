import { z } from 'zod';

const text = (max: number) => z.string().trim().min(1).max(max);
const nullableText = (max: number) => z.string().trim().min(1).max(max).nullable().default(null);
const coordinate = (max: number) => z.number().finite().min(-max).max(max);

export const tourismPlaceCategory = z.enum(['historic_landmark', 'museum', 'park_garden', 'visitor_attraction', 'family_rest', 'prayer_place']);
export type TourismPlaceCategoryValue = z.infer<typeof tourismPlaceCategory>;

const sourceUrl = z.string().trim().max(2048).url().refine((value) => {
  const url = new URL(value);
  return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password;
}, 'Use an HTTP(S) URL without credentials');

const optionalSourceUrl = sourceUrl.nullable().default(null);
const source = z.object({
  url: sourceUrl,
  publisher: text(200),
  type: text(80),
  supports: z.array(text(80)).max(40).default([]),
  accessedOn: z.iso.date(),
}).passthrough();

export const tourismPlaceRecord = z.object({
  id: text(120).regex(/^[a-z0-9_:-]+$/),
  nameAr: text(200),
  nameEn: text(200),
  primaryCategory: tourismPlaceCategory,
  categories: z.array(tourismPlaceCategory).min(1).max(4),
  descriptionAr: nullableText(1000),
  cityAr: nullableText(100),
  regionAr: nullableText(120),
  addressAr: nullableText(300),
  latitude: coordinate(90).nullable(),
  longitude: coordinate(180).nullable(),
  mapReady: z.boolean(),
  coordinateReferenceSystem: nullableText(40),
  coordinateSourceUrl: optionalSourceUrl,
  locationStatus: text(80),
  coordinateMeaning: nullableText(120),
  locationNoteAr: nullableText(700),
  navigationEntrance: z.unknown().nullable().default(null),
  fieldVerified: z.boolean(),
  openingHours: z.unknown().nullable().default(null),
  entryFee: z.unknown().nullable().default(null),
  isFreeEntry: z.boolean().nullable().default(null),
  publicAccessConfirmed: z.boolean().nullable().default(null),
  phone: nullableText(32).refine((value) => {
    if (!value) return true;
    const digits = value.replace(/\D/g, '').length;
    return /^\+?[0-9][0-9 ()-]{4,30}[0-9]$/.test(value) && digits >= 7 && digits <= 15;
  }, 'Use 7-15 phone digits'),
  email: z.email().max(254).nullable().default(null),
  website: optionalSourceUrl,
  imageUrl: optionalSourceUrl,
  sourceImageUrl: optionalSourceUrl,
  imageLicense: nullableText(300),
  imageUsageRightsVerified: z.boolean(),
  accessibility: z.unknown().nullable().default(null),
  toiletsAvailable: z.boolean().nullable().default(null),
  parkingAvailable: z.boolean().nullable().default(null),
  nearbyParkingIds: z.array(text(120)).max(50),
  officialSourceId: z.number().int().positive().nullable().default(null),
  sources: z.array(source).min(1).max(10),
  sourcesCheckedOn: z.iso.date(),
}).passthrough().superRefine((record, ctx) => {
  const categorySet = new Set(record.categories);
  if (!categorySet.has(record.primaryCategory)) {
    ctx.addIssue({ code: 'custom', path: ['primaryCategory'], message: 'Primary category must be included in categories' });
  }
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
  categories: z.array(z.object({ id: tourismPlaceCategory }).passthrough()).optional(),
  places: z.array(tourismPlaceRecord).min(1).max(1000),
}).passthrough();

const boundsCoordinate = (max: number) => z.coerce.number().finite().min(-max).max(max);
export const listInput = z.object({
  north: boundsCoordinate(90),
  south: boundsCoordinate(90),
  east: boundsCoordinate(180),
  west: boundsCoordinate(180),
  category: tourismPlaceCategory.optional(),
}).strict().refine(
  (bounds) => bounds.north > bounds.south && bounds.east > bounds.west && bounds.north - bounds.south <= 2 && bounds.east - bounds.west <= 2,
  'Use ordered bounds spanning at most 2 degrees per axis',
);
