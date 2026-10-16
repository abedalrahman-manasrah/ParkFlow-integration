import { z } from 'zod';
import { db } from '../../database/client';
import { listInput, stationInput } from './schema';

export async function list(input: z.infer<typeof listInput>) {
  const { north, south, east, west, connectorType, minPowerKw, status } = input;
  const rows = await db.evChargingStation.findMany({
    where: {
      latitude: { gte: south, lte: north }, longitude: { gte: west, lte: east }, status,
      sourceName: { not: null }, lastVerifiedAt: { not: null, lte: new Date() },
      ...(connectorType || minPowerKw ? { connectors: { some: { type: connectorType, powerKw: minPowerKw ? { gte: minPowerKw } : undefined } } } : {}),
    },
    include: { connectors: { orderBy: [{ type: 'asc' }, { powerKw: 'asc' }] } },
    orderBy: { id: 'asc' }, take: 201,
  });
  return { truncated: rows.length > 200, stations: rows.slice(0, 200).map((row) => ({
    ...row,
    operatorName: row.operatorName ?? undefined, address: row.address ?? undefined, city: row.city ?? undefined,
    pricingText: row.pricingText ?? undefined, openingHoursText: row.openingHoursText ?? undefined,
    phone: row.phone ?? undefined, sourceName: row.sourceName ?? undefined, sourceUrl: row.sourceUrl ?? undefined,
    lastVerifiedAt: row.lastVerifiedAt?.toISOString(), createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
    connectors: row.connectors.map(({ type, powerKw, quantity }) => ({ type, powerKw, quantity })),
  })) };
}

/** Trusted offline ingestion only. No public write endpoint and no seed data. */
export async function importVerifiedStations(raw: unknown) {
  const records = z.array(stationInput).min(1).max(1000).parse(raw);
  if (new Set(records.map((r) => r.id)).size !== records.length) throw new Error('Duplicate station IDs in import');
  await db.$transaction(async (tx) => {
    for (const record of records) {
      const { connectors, lastVerifiedAt, ...fields } = record;
      const data = { ...fields, lastVerifiedAt: new Date(lastVerifiedAt) };
      await tx.evChargingStation.upsert({ where: { id: record.id },
        create: { ...data, connectors: { create: connectors } },
        update: { ...data, connectors: { deleteMany: {}, create: connectors } },
      });
    }
  }, { timeout: 30000 });
  return records.length;
}
