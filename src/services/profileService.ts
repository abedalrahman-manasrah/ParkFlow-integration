import type { ProfileService } from './types';
import { AppError } from '@/utils/errors';
import { networkDelay } from '@/utils/async';
import { nowIso } from '@/utils/time';
import { getDb, mutate } from './mock/db';

export const mockProfileService: ProfileService = {
  async get(userId) {
    await networkDelay(140, 300);
    const db = await getDb();
    const user = db.users.find((u) => u.id === userId);
    if (!user) throw new AppError('not_found', 'User not found');
    return { ...user };
  },

  async update(userId, input) {
    await networkDelay();
    return mutate((db) => {
      const user = db.users.find((u) => u.id === userId);
      if (!user) throw new AppError('not_found', 'User not found');
      if (input.fullName !== undefined) user.fullName = input.fullName.trim();
      if (input.locale !== undefined) user.locale = input.locale;
      user.updatedAt = nowIso();
      return { ...user };
    });
  },

  async getNotificationPreferences() {
    await networkDelay(100, 220);
    // Preferences live on the device in this build; the server becomes the
    // source of truth once push notifications are wired up.
    return {
      parkingReminders: true,
      expiryWarnings: true,
      lowBalance: true,
      violations: true,
      promotions: false,
    };
  },
};
