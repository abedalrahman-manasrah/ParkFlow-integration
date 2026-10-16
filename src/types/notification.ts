import type { ID, ISODateString } from './common';

export type NotificationType =
  | 'parking_started'
  | 'parking_reminder'
  | 'parking_expiring'
  | 'parking_completed'
  | 'low_balance'
  | 'topup_success'
  | 'payment_success'
  | 'payment_failed'
  | 'violation_issued'
  | 'appeal_updated'
  | 'points_awarded'
  | 'reward_paid'
  | 'system';

export interface AppNotification {
  id: ID;
  userId: ID;
  type: NotificationType;
  title: string;
  titleAr: string;
  body: string;
  bodyAr: string;
  readAt?: ISODateString;
  createdAt: ISODateString;
  /** Deep link target, e.g. /parking/active/ses_1. */
  href?: string;
  parkingSessionId?: ID;
  violationId?: ID;
  vehicleId?: ID;
}

export interface NotificationPreferences {
  parkingReminders: boolean;
  expiryWarnings: boolean;
  lowBalance: boolean;
  violations: boolean;
  promotions: boolean;
}
