import type { NotificationService } from './types';
import type { AppNotification } from '@/types';
import { createId } from '@/utils/id';
import { networkDelay } from '@/utils/async';
import { nowIso } from '@/utils/time';
import { getDb, mutate } from './mock/db';

export const mockNotificationService: NotificationService = {
  async list(userId) {
    await networkDelay(160, 380);
    const db = await getDb();
    return db.notifications
      .filter((n) => n.userId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((n) => ({ ...n }));
  },

  async unreadCount(userId) {
    // Drives the header badge — kept instant so it never lags behind the list.
    const db = await getDb();
    return db.notifications.filter((n) => n.userId === userId && !n.readAt).length;
  },

  async markRead(notificationId) {
    await mutate((db) => {
      const notification = db.notifications.find((n) => n.id === notificationId);
      if (notification && !notification.readAt) notification.readAt = nowIso();
    });
  },

  async markAllRead(userId) {
    await mutate((db) => {
      db.notifications.forEach((n) => {
        if (n.userId === userId && !n.readAt) n.readAt = nowIso();
      });
    });
  },

  async emit(input) {
    return mutate((db) => {
      const notification: AppNotification = {
        ...input,
        id: createId('ntf'),
        createdAt: nowIso(),
      };
      db.notifications.push(notification);
      return notification;
    });
  },
};
