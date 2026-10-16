import {
  Bell,
  BellRing,
  CircleParking,
  CircleCheck,
  CircleAlert,
  Gift,
  ScrollText,
  Wallet as WalletIcon,
  Gavel,
  Timer,
} from 'lucide-react-native';
import type { NotificationType } from '@/types';

/** One icon per notification kind, shared by the inbox and the on-screen banner. */
export const NOTIFICATION_ICONS: Record<NotificationType, typeof Bell> = {
  parking_started: CircleParking,
  parking_reminder: BellRing,
  parking_expiring: Timer,
  parking_completed: CircleCheck,
  low_balance: WalletIcon,
  topup_success: WalletIcon,
  payment_success: CircleCheck,
  payment_failed: CircleAlert,
  violation_issued: ScrollText,
  appeal_updated: Gavel,
  points_awarded: Gift,
  reward_paid: WalletIcon,
  system: Bell,
};

/** Notices that need action get the alert tone; the rest stay neutral. */
export const ALERT_NOTIFICATION_TYPES: NotificationType[] = [
  'violation_issued',
  'payment_failed',
  'low_balance',
  'parking_expiring',
];
