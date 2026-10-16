import { z } from 'zod';
import { db } from '../../database/client';
import { datasetInput, listInput, type TourismPlaceCategoryValue } from './schema';

type TourismPlaceDbClient = {
  tourismPlace: {
    findMany(args: unknown): Promise<TourismPlaceRow[]>;
    findUnique(args: unknown): Promise<TourismPlaceRow | null>;
    upsert(args: unknown): Promise<TourismPlaceRow>;
  };
};

const dbClient = db as unknown as TourismPlaceDbClient & {
  $transaction<T>(fn: (tx: TourismPlaceDbClient) => Promise<T>, options?: { timeout?: number }): Promise<T>;
};

type CategoryLinkRow = { category: TourismPlaceCategoryValue };
type TourismPlaceRow = {
  id: string;
  nameAr: string;
  nameEn: string;
  primaryCategory: TourismPlaceCategoryValue;
  descriptionAr: string | null;
  cityAr: string | null;
  regionAr: string | null;
  addressAr: string | null;
  latitude: number | null;
  longitude: number | null;
  mapReady: boolean;
  coordinateReferenceSystem: string | null;
  coordinateSourceUrl: string | null;
  locationStatus: string;
  coordinateMeaning: string | null;
  locationNoteAr: string | null;
  navigationEntrance: unknown;
  fieldVerified: boolean;
  openingHours: unknown;
  entryFee: unknown;
  isFreeEntry: boolean | null;
  publicAccessConfirmed: boolean | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  imageUrl: string | null;
  sourceImageUrl: string | null;
  imageLicense: string | null;
  imageUsageRightsVerified: boolean;
  accessibility: unknown;
  toiletsAvailable: boolean | null;
  parkingAvailable: boolean | null;
  nearbyParkingIds: string[];
  officialSourceId: number | null;
  sources: unknown;
  sourcesCheckedOn: Date;
  createdAt: Date;
  updatedAt: Date;
  categories: CategoryLinkRow[];
};

const CATEGORY_COUNTS: Record<TourismPlaceCategoryValue, number> = {
  historic_landmark: 0,
  museum: 0,
  park_garden: 0,
  visitor_attraction: 0,
  family_rest: 0,
  prayer_place: 0,
};

const normalizeDatasetInput = (raw: unknown) => {
  if (!raw || typeof raw !== 'object' || !Array.isArray((raw as { places?: unknown }).places)) return raw;
  return {
    ...(raw as Record<string, unknown>),
    places: ((raw as { places: Array<Record<string, unknown>> }).places).map((place) => ({
      locationNoteAr: null,
      email: null,
      sourceImageUrl: null,
      imageUsageRightsVerified: false,
      officialSourceId: null,
      ...place,
      sources: Array.isArray(place.sources)
        ? place.sources.map((source) => ({ supports: [], ...(source as Record<string, unknown>) }))
        : place.sources,
    })),
  };
};

const validCoordinatePair = (row: Pick<TourismPlaceRow, 'latitude' | 'longitude'>) =>
  typeof row.latitude === 'number' &&
  Number.isFinite(row.latitude) &&
  row.latitude >= -90 &&
  row.latitude <= 90 &&
  typeof row.longitude === 'number' &&
  Number.isFinite(row.longitude) &&
  row.longitude >= -180 &&
  row.longitude <= 180;

const toDto = (row: TourismPlaceRow) => ({
  id: row.id,
  nameAr: row.nameAr,
  nameEn: row.nameEn,
  primaryCategory: row.primaryCategory,
  categories: row.categories.map((item) => item.category).sort(),
  descriptionAr: row.descriptionAr ?? undefined,
  cityAr: row.cityAr ?? undefined,
  regionAr: row.regionAr ?? undefined,
  addressAr: row.addressAr ?? undefined,
  latitude: row.latitude,
  longitude: row.longitude,
  mapReady: row.mapReady,
  coordinateReferenceSystem: row.coordinateReferenceSystem ?? undefined,
  coordinateSourceUrl: row.coordinateSourceUrl ?? undefined,
  locationStatus: row.locationStatus,
  coordinateMeaning: row.coordinateMeaning ?? undefined,
  locationNoteAr: row.locationNoteAr ?? undefined,
  fieldVerified: row.fieldVerified,
  phone: row.phone ?? undefined,
  email: row.email ?? undefined,
  website: row.website ?? undefined,
  imageUrl: row.imageUrl ?? null,
  imageLicense: row.imageLicense ?? undefined,
  imageUsageRightsVerified: row.imageUsageRightsVerified,
  nearbyParkingIds: row.nearbyParkingIds,
  officialSourceId: row.officialSourceId ?? undefined,
  sources: row.sources,
  sourcesCheckedOn: row.sourcesCheckedOn.toISOString(),
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

export async function list(input: z.infer<typeof listInput>) {
  const { north, south, east, west, category } = input;
  const rows = await dbClient.tourismPlace.findMany({
    where: {
      mapReady: true,
      latitude: { not: null, gte: south, lte: north },
      longitude: { not: null, gte: west, lte: east },
      ...(category ? { categories: { some: { category } } } : {}),
    },
    include: { categories: true },
    orderBy: [{ nameEn: 'asc' }, { id: 'asc' }],
    take: 201,
  });
  const places = rows.filter(validCoordinatePair).slice(0, 200).map(toDto);
  return { truncated: rows.length > 200, places };
}

export async function importTourismPlacesDataset(raw: unknown) {
  const parsed = datasetInput.parse(normalizeDatasetInput(raw));
  const seenIds = new Set<string>();
  let mapReady = 0;
  const skipped: Array<{ id: string; reason: string }> = [];

  const records = parsed.places.map((record) => {
    if (seenIds.has(record.id)) throw new Error(`Duplicate tourism place ID in import: ${record.id}`);
    seenIds.add(record.id);
    const categories = Array.from(new Set(record.categories));
    const active = record.mapReady && record.latitude !== null && record.longitude !== null;
    if (active) mapReady++;
    else skipped.push({ id: record.id, reason: record.mapReady ? 'invalid_coordinates' : 'mapReady_false' });
    return { ...record, categories, active };
  });

  let created = 0;
  let updated = 0;
  await dbClient.$transaction(async (tx) => {
    for (const record of records) {
      const existing = await tx.tourismPlace.findUnique({ where: { id: record.id } });
      if (existing) updated++;
      else created++;
      const {
        categories,
        sourcesCheckedOn,
        active: _active,
        descriptionEn: _descriptionEn,
        seatingAvailable: _seatingAvailable,
        shadeAvailable: _shadeAvailable,
        childrenPlayArea: _childrenPlayArea,
        prayerAreaAvailable: _prayerAreaAvailable,
        womenPrayerAreaAvailable: _womenPrayerAreaAvailable,
        ablutionAvailable: _ablutionAvailable,
        geocodingReview: _geocodingReview,
        dataPolicyAr: _dataPolicyAr,
        integrationNotesAr: _integrationNotesAr,
        ...fields
      } = record as typeof record & Record<string, unknown>;
      await tx.tourismPlace.upsert({
        where: { id: record.id },
        create: {
          ...fields,
          sourcesCheckedOn: new Date(`${sourcesCheckedOn}T00:00:00.000Z`),
          categories: { create: categories.map((category) => ({ category })) },
        },
        update: {
          ...fields,
          sourcesCheckedOn: new Date(`${sourcesCheckedOn}T00:00:00.000Z`),
          categories: { deleteMany: {}, create: categories.map((category) => ({ category })) },
        },
      });
    }
  }, { timeout: 30000 });

  return {
    total: records.length,
    created,
    updated,
    mapReady,
    skipped,
    perCategory: records.reduce<Record<TourismPlaceCategoryValue, number>>((counts, record) => {
      for (const category of record.categories) counts[category] += 1;
      return counts;
    }, { ...CATEGORY_COUNTS }),
  };
}
