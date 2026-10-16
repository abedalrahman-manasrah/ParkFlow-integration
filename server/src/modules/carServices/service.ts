import { z } from 'zod';
import { db } from '../../database/client';
import { datasetInput, listInput, type CarServiceCategoryValue } from './schema';

type CarServiceDbClient = {
  carServiceBusiness: {
    findMany(args: unknown): Promise<CarServiceBusinessRow[]>;
    findUnique(args: unknown): Promise<CarServiceBusinessRow | null>;
    upsert(args: unknown): Promise<CarServiceBusinessRow>;
  };
};

const dbClient = db as unknown as CarServiceDbClient & {
  $transaction<T>(fn: (tx: CarServiceDbClient) => Promise<T>, options?: { timeout?: number }): Promise<T>;
};

type CategoryLinkRow = { category: CarServiceCategoryValue };
type CarServiceBusinessRow = {
  id: string;
  nameAr: string;
  nameEn: string;
  latitude: number | null;
  longitude: number | null;
  mapReady: boolean;
  coordinateAccuracy: string;
  coordinateNoteAr: string | null;
  coordinateNoteEn: string | null;
  addressAr: string | null;
  addressEn: string | null;
  phone: string | null;
  website: string | null;
  openingHoursText: string | null;
  servicesAr: string[];
  servicesEn: string[];
  pricing: unknown;
  operatingStatus: string;
  verificationStatus: string;
  sourceName: string;
  sourceUrl: string;
  secondarySourceUrl: string | null;
  lastCheckedAt: Date;
  createdAt: Date;
  updatedAt: Date;
  categories: CategoryLinkRow[];
};

const validCoordinatePair = (row: Pick<CarServiceBusinessRow, 'latitude' | 'longitude'>) =>
  typeof row.latitude === 'number' &&
  Number.isFinite(row.latitude) &&
  row.latitude >= -90 &&
  row.latitude <= 90 &&
  typeof row.longitude === 'number' &&
  Number.isFinite(row.longitude) &&
  row.longitude >= -180 &&
  row.longitude <= 180;

const toDto = (row: CarServiceBusinessRow) => ({
  id: row.id,
  nameAr: row.nameAr,
  nameEn: row.nameEn,
  categories: row.categories.map((item) => item.category).sort(),
  latitude: row.latitude,
  longitude: row.longitude,
  mapReady: row.mapReady,
  coordinateAccuracy: row.coordinateAccuracy,
  coordinateNoteAr: row.coordinateNoteAr ?? undefined,
  coordinateNoteEn: row.coordinateNoteEn ?? undefined,
  addressAr: row.addressAr ?? undefined,
  addressEn: row.addressEn ?? undefined,
  phone: row.phone ?? undefined,
  website: row.website ?? undefined,
  openingHoursText: row.openingHoursText ?? undefined,
  servicesAr: row.servicesAr,
  servicesEn: row.servicesEn,
  pricing: row.pricing ?? null,
  operatingStatus: row.operatingStatus,
  verificationStatus: row.verificationStatus,
  sourceName: row.sourceName,
  sourceUrl: row.sourceUrl,
  secondarySourceUrl: row.secondarySourceUrl ?? undefined,
  lastCheckedAt: row.lastCheckedAt.toISOString(),
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

export async function list(input: z.infer<typeof listInput>) {
  const { north, south, east, west, category } = input;
  const rows = await dbClient.carServiceBusiness.findMany({
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
  const services = rows.filter(validCoordinatePair).slice(0, 200).map(toDto);
  return { truncated: rows.length > 200, services };
}

export async function importCarServicesDataset(raw: unknown) {
  const parsed = datasetInput.parse(raw);
  const seenIds = new Set<string>();
  let mapReady = 0;
  const skipped: Array<{ id: string; reason: string }> = [];

  const records = parsed.services.map((record) => {
    if (seenIds.has(record.id)) throw new Error(`Duplicate car service ID in import: ${record.id}`);
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
      const existing = await tx.carServiceBusiness.findUnique({ where: { id: record.id } });
      if (existing) updated++;
      else created++;
      const { categories, lastCheckedAt, active: _active, ...fields } = record;
      await tx.carServiceBusiness.upsert({
        where: { id: record.id },
        create: {
          ...fields,
          lastCheckedAt: new Date(lastCheckedAt),
          categories: { create: categories.map((category) => ({ category })) },
        },
        update: {
          ...fields,
          lastCheckedAt: new Date(lastCheckedAt),
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
    perCategory: records.reduce<Record<CarServiceCategoryValue, number>>((counts, record) => {
      for (const category of record.categories) counts[category] += 1;
      return counts;
    }, { car_wash: 0, oil_change: 0, maintenance: 0, tire_service: 0 }),
  };
}
