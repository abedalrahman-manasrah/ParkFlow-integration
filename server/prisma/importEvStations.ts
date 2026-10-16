import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { db } from '../src/database/client';
import { importVerifiedStations } from '../src/modules/evStations/service';

async function main() {
  const path = process.argv[2];
  if (!path) throw new Error('Usage: npx tsx prisma/importEvStations.ts <verified-stations.json>');
  const raw: unknown = JSON.parse(await readFile(path, 'utf8'));
  console.log(`Imported ${await importVerifiedStations(raw)} verified stations.`);
}
void main().catch((error: unknown) => { console.error(error); process.exitCode = 1; }).finally(() => db.$disconnect());
