import 'dotenv/config';
import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { db } from '../src/database/client';
import { importTourismPlacesDataset } from '../src/modules/tourismPlaces/service';

async function main() {
  const path = process.argv[2] ? resolve(process.argv[2]) : await defaultDatasetPath();
  const raw: unknown = JSON.parse(await readFile(path, 'utf8'));
  const summary = await importTourismPlacesDataset(raw);
  console.log([
    `Tourism places import: total=${summary.total}`,
    `created=${summary.created}`,
    `updated=${summary.updated}`,
    `mapReady=${summary.mapReady}`,
    `skipped=${summary.skipped.length}`,
    `perCategory=${JSON.stringify(summary.perCategory)}`,
  ].join(' '));
  for (const item of summary.skipped) console.log(`Skipped active marker: ${item.id} (${item.reason})`);
}

async function defaultDatasetPath() {
  for (const candidate of [resolve(process.cwd(), 'ramallah_tourism_places.json'), resolve(process.cwd(), '..', 'ramallah_tourism_places.json')]) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Try the next likely repository-root location.
    }
  }
  throw new Error('Missing required dataset: <repository-root>/ramallah_tourism_places.json');
}

void main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
