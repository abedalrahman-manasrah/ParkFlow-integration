import type { TrustService } from './types';
import { networkDelay } from '@/utils/async';
import { getDb, mutate } from './mock/db';
import { promotePendingPoints } from './mock/points';
import { computeTrust } from './mock/trust';

export const mockTrustService: TrustService = {
  async get(userId) {
    await networkDelay(120, 260);
    const db = await getDb();
    // Settle any report points old enough to judge before scoring.
    if (db.pointsLedger.some((entry) => entry.userId === userId && entry.state === 'pending')) {
      await mutate(promotePendingPoints);
    }
    return computeTrust(await getDb(), userId);
  },
};
