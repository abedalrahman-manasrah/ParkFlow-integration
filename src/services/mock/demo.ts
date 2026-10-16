import type {
  AppNotification,
  ParkingSession,
  Permit,
  Transaction,
  Vehicle,
  Violation,
  ViolationEvidence,
} from '@/types';
import { createId } from '@/utils/id';
import { snapshotTariff } from '@/utils/pricing';
import { ZONES } from './catalog';
import type { MockDatabase } from './db';

/**
 * Demo seeding, in two stages:
 *
 *  1. `seedAccount` — wallet and saved card, created with the account. Running
 *     this at sign-up means the Wallet tab works even for a user who skipped
 *     adding a vehicle.
 *  2. `seedVehicleHistory` — parking history, violations and notices, attached
 *     to the user's real first plate. That is what makes the violations demo
 *     work for whatever plate they typed during onboarding.
 *
 * Both are idempotent.
 */

const DAYS = 24 * 3_600_000;

const iso = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString();

/** Sets a wall-clock time on a day N days ago — keeps demo timestamps tidy. */
function dayAt(daysAgo: number, hour: number, minute: number): string {
  const d = new Date(Date.now() - daysAgo * DAYS);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

function zone(id: string) {
  const found = ZONES.find((z) => z.id === id);
  if (!found) throw new Error(`Unknown demo zone ${id}`);
  return found;
}

/**
 * Pretend permits for one vehicle — a live resident permit and a lapsed staff
 * one, so the vehicle screen shows both states. Runs for every linked vehicle,
 * not just the first. Idempotent per vehicle.
 */
export function seedVehiclePermits(db: MockDatabase, vehicleId: string): void {
  if (db.permits.some((p) => p.vehicleId === vehicleId)) return;
  const vehicle = db.vehicles.find((v) => v.id === vehicleId);
  const link = db.userVehicles.find((l) => l.vehicleId === vehicleId && !l.unlinkedAt);
  if (!vehicle || !link) return;

  // Plate digits make each reference look issued to this car specifically.
  const serial = vehicle.plateNumber.replace(/\D/g, '').slice(-4).padStart(4, '0');

  const permits: Permit[] = [
    {
      id: createId('pmt'),
      vehicleId,
      userId: link.userId,
      type: 'resident',
      reference: `RES-2026-${serial}`,
      zoneIds: [zone('zone_masyoun').id, zone('zone_tireh').id],
      validFrom: dayAt(64, 8, 0),
      validTo: dayAt(-301, 23, 59),
      status: 'active',
    },
    {
      id: createId('pmt'),
      vehicleId,
      userId: link.userId,
      type: 'staff',
      reference: `STF-2025-${serial}`,
      zoneIds: [zone('zone_hospital').id],
      validFrom: dayAt(420, 8, 0),
      validTo: dayAt(55, 23, 59),
      status: 'expired',
    },
  ];
  db.permits.push(...permits);
}

/**
 * Appends a ledger row and moves the balance, mirroring what `postTransaction`
 * does at runtime so seeded and live history stay consistent.
 */
function post(
  db: MockDatabase,
  userId: string,
  entry: Omit<Transaction, 'id' | 'userId' | 'walletId' | 'balanceAfter' | 'currency'>,
): Transaction {
  const wallet = db.wallets.find((w) => w.userId === userId);
  if (!wallet) throw new Error('seedAccount must run before any ledger entry');

  wallet.balance += entry.amount;
  const transaction: Transaction = {
    ...entry,
    id: createId('txn'),
    userId,
    walletId: wallet.id,
    currency: 'ILS',
    balanceAfter: wallet.balance,
  };
  db.transactions.push(transaction);
  return transaction;
}

export function seedAccount(db: MockDatabase, userId: string): void {
  if (db.wallets.some((w) => w.userId === userId)) return;

  const cardId = createId('pm');
  db.paymentMethods.push({
    id: cardId,
    userId,
    brand: 'visa',
    last4: '4212',
    expiryMonth: 11,
    expiryYear: 2029,
    isDefault: true,
    createdAt: iso(-60 * DAYS),
  });

  db.wallets.push({
    id: createId('wal'),
    userId,
    balance: 0,
    currency: 'ILS',
    autoTopUpEnabled: false,
    autoTopUpThreshold: 500,
    autoTopUpAmount: 5000,
    defaultPaymentMethodId: cardId,
    updatedAt: iso(0),
  });

  post(db, userId, {
    type: 'topup',
    status: 'completed',
    amount: 5000,
    title: 'Wallet Top-up',
    titleAr: 'شحن المحفظة',
    subtitle: 'Visa •••• 4212',
    subtitleAr: 'فيزا •••• ٤٢١٢',
    paymentMethodId: cardId,
    reference: 'TOP-2026-118834',
    createdAt: dayAt(6, 9, 12),
  });
}

function buildSession(params: {
  userId: string;
  vehicleId: string;
  zoneId: string;
  startedAt: string;
  stoppedAt: string;
  finalCost: number;
  transactionId: string;
}): ParkingSession {
  const z = zone(params.zoneId);
  return {
    id: createId('ses'),
    userId: params.userId,
    vehicleId: params.vehicleId,
    parkingZoneId: z.id,
    parkingFacilityId: z.facilityId,
    parkingMode: z.defaultMode,
    startedAt: params.startedAt,
    endsAt: params.stoppedAt,
    stoppedAt: params.stoppedAt,
    rateSnapshot: snapshotTariff(z.tariff, params.startedAt),
    pricingRulesSnapshot: {
      mode: z.defaultMode,
      operatingHours: z.operatingHours,
      entryMethod: 'gps',
      zoneCode: z.code,
      zoneName: z.name,
      zoneNameAr: z.nameAr,
      city: z.city,
    },
    currentCost: params.finalCost,
    finalCost: params.finalCost,
    paymentStatus: 'paid',
    paymentTransactionId: params.transactionId,
    status: 'COMPLETED',
    createdAt: params.startedAt,
    updatedAt: params.stoppedAt,
  };
}

export function seedVehicleHistory(db: MockDatabase, userId: string, vehicle: Vehicle): void {
  if (db.sessions.some((s) => s.vehicleId === vehicle.id)) return;

  const card = db.paymentMethods.find((m) => m.userId === userId && m.isDefault);

  // ---- Ledger, oldest first so `balanceAfter` stays truthful ---------------
  const rukabTx = post(db, userId, {
    type: 'parking_payment',
    status: 'completed',
    amount: -520,
    title: 'Parking',
    titleAr: 'وقوف',
    subtitle: 'Rukab Street',
    subtitleAr: 'شارع ركب',
    vehicleId: vehicle.id,
    reference: 'PRK-2026-771204',
    createdAt: dayAt(5, 16, 42),
  });

  const violationTx = post(db, userId, {
    type: 'violation_payment',
    status: 'completed',
    amount: -2000,
    title: 'Violation Payment',
    titleAr: 'دفع مخالفة',
    subtitle: 'Al-Manara Square',
    subtitleAr: 'دوار المنارة',
    vehicleId: vehicle.id,
    reference: 'VIO-2026-004512',
    createdAt: dayAt(4, 11, 5),
  });

  const manaraTx = post(db, userId, {
    type: 'parking_payment',
    status: 'completed',
    amount: -700,
    title: 'Parking',
    titleAr: 'وقوف',
    subtitle: 'Al-Manara Square',
    subtitleAr: 'دوار المنارة',
    vehicleId: vehicle.id,
    reference: 'PRK-2026-772980',
    createdAt: dayAt(1, 12, 20),
  });

  post(db, userId, {
    type: 'topup',
    status: 'completed',
    amount: 2000,
    title: 'Wallet Top-up',
    titleAr: 'شحن المحفظة',
    subtitle: 'Visa •••• 4212',
    subtitleAr: 'فيزا •••• ٤٢١٢',
    paymentMethodId: card?.id,
    reference: 'TOP-2026-119002',
    createdAt: dayAt(1, 18, 30),
  });

  const irsalTx = post(db, userId, {
    type: 'parking_payment',
    status: 'completed',
    amount: -235,
    title: 'Parking',
    titleAr: 'وقوف',
    subtitle: 'Al-Irsal Street',
    subtitleAr: 'شارع الإرسال',
    vehicleId: vehicle.id,
    reference: 'PRK-2026-773341',
    createdAt: dayAt(0, 14, 1),
  });

  // ---- Parking history ----------------------------------------------------
  db.sessions.push(
    buildSession({
      userId,
      vehicleId: vehicle.id,
      zoneId: 'zone_rukab',
      startedAt: dayAt(5, 15, 5),
      stoppedAt: dayAt(5, 16, 42),
      finalCost: 520,
      transactionId: rukabTx.id,
    }),
    buildSession({
      userId,
      vehicleId: vehicle.id,
      zoneId: 'zone_manara',
      startedAt: dayAt(1, 10, 10),
      stoppedAt: dayAt(1, 12, 20),
      finalCost: 700,
      transactionId: manaraTx.id,
    }),
    buildSession({
      userId,
      vehicleId: vehicle.id,
      zoneId: 'zone_irsal',
      startedAt: dayAt(0, 13, 14),
      stoppedAt: dayAt(0, 14, 1),
      finalCost: 235,
      transactionId: irsalTx.id,
    }),
  );

  // ---- Violations + evidence ---------------------------------------------
  // Keyed on the plate: a violation belongs to the vehicle and is merely
  // surfaced to this user because they have it linked.
  const mkEvidence = (
    violationId: string,
    at: string,
    location: { latitude: number; longitude: number },
    source: ViolationEvidence['detectionSource'],
  ): ViolationEvidence => ({
    id: createId('evd'),
    violationId,
    vehiclePhotoUrl: `mock://evidence/${violationId}/wide`,
    plateCropUrl: `mock://evidence/${violationId}/plate`,
    additionalPhotoUrls: [`mock://evidence/${violationId}/context`],
    detectedPlate: vehicle.plateNumber,
    detectionSource: source,
    firstDetectionAt: at,
    secondDetectionAt: new Date(new Date(at).getTime() + 11 * 60_000).toISOString(),
    location,
    deviceId: source === 'anpr_vehicle' ? 'ANPR-RML-04' : 'CAM-RML-12',
    officerId: source === 'inspector' ? 'INS-2291' : undefined,
  });

  const unpaidId = createId('vio');
  const paidId = createId('vio');
  const appealedId = createId('vio');

  const unpaidEvidence = mkEvidence(unpaidId, dayAt(0, 14, 14), zone('zone_irsal').location, 'anpr_vehicle');
  const paidEvidence = mkEvidence(paidId, dayAt(8, 13, 2), zone('zone_manara').location, 'fixed_camera');
  const appealedEvidence = mkEvidence(appealedId, dayAt(3, 9, 48), zone('zone_rukab').location, 'inspector');

  db.evidence.push(unpaidEvidence, paidEvidence, appealedEvidence);

  const appeal = {
    id: createId('apl'),
    reference: 'APL-2026-000318',
    violationId: appealedId,
    userId,
    reason: 'wrong_location' as const,
    notes: 'I was parked in RML-023 and my session was active for that zone at the time.',
    attachments: [],
    status: 'under_review' as const,
    submittedAt: dayAt(2, 10, 0),
    updatedAt: dayAt(2, 10, 0),
  };
  db.appeals.push(appeal);

  const violations: Violation[] = [
    {
      id: unpaidId,
      reference: 'RML-2026-004821',
      vehicleId: vehicle.id,
      plateNumber: vehicle.plateNumber,
      issuedToUserId: userId,
      type: 'no_active_parking',
      status: 'unpaid',
      amount: 2000,
      currency: 'ILS',
      parkingZoneId: 'zone_irsal',
      zoneCode: 'RML-023',
      locationName: 'Al-Irsal Street',
      locationNameAr: 'شارع الإرسال',
      location: zone('zone_irsal').location,
      issuedAt: dayAt(0, 14, 14),
      dueAt: iso(14 * DAYS),
      reason: 'Vehicle parked in a paid zone with no active parking session.',
      reasonAr: 'المركبة واقفة في منطقة مدفوعة بدون جلسة وقوف نشطة.',
      issuingAuthority: 'Ramallah Municipality',
      issuingAuthorityAr: 'بلدية رام الله',
      evidenceId: unpaidEvidence.id,
      createdAt: dayAt(0, 14, 14),
      updatedAt: dayAt(0, 14, 14),
    },
    {
      id: paidId,
      reference: 'RML-2026-004512',
      vehicleId: vehicle.id,
      plateNumber: vehicle.plateNumber,
      issuedToUserId: userId,
      type: 'expired_parking',
      status: 'paid',
      amount: 2000,
      currency: 'ILS',
      parkingZoneId: 'zone_manara',
      zoneCode: 'RML-001',
      locationName: 'Al-Manara Square',
      locationNameAr: 'دوار المنارة',
      location: zone('zone_manara').location,
      issuedAt: dayAt(8, 13, 2),
      dueAt: dayAt(-6, 13, 2),
      reason: 'Parking session expired 34 minutes before the vehicle was moved.',
      reasonAr: 'انتهت مدة الوقوف قبل ٣٤ دقيقة من تحريك المركبة.',
      issuingAuthority: 'Ramallah Municipality',
      issuingAuthorityAr: 'بلدية رام الله',
      evidenceId: paidEvidence.id,
      paidAt: dayAt(4, 11, 5),
      paymentTransactionId: violationTx.id,
      createdAt: dayAt(8, 13, 2),
      updatedAt: dayAt(4, 11, 5),
    },
    {
      id: appealedId,
      reference: 'RML-2026-004703',
      vehicleId: vehicle.id,
      plateNumber: vehicle.plateNumber,
      issuedToUserId: userId,
      type: 'wrong_zone',
      status: 'appealed',
      amount: 1500,
      currency: 'ILS',
      parkingZoneId: 'zone_rukab',
      zoneCode: 'RML-007',
      locationName: 'Rukab Street',
      locationNameAr: 'شارع ركب',
      location: zone('zone_rukab').location,
      issuedAt: dayAt(3, 9, 48),
      dueAt: iso(11 * DAYS),
      reason: 'Active session was registered for a different zone than the one occupied.',
      reasonAr: 'الجلسة النشطة كانت مسجلة لمنطقة مختلفة عن المنطقة المشغولة.',
      issuingAuthority: 'Ramallah Municipality',
      issuingAuthorityAr: 'بلدية رام الله',
      evidenceId: appealedEvidence.id,
      appealId: appeal.id,
      createdAt: dayAt(3, 9, 48),
      updatedAt: dayAt(2, 10, 0),
    },
  ];

  db.violations.push(...violations);

  // ---- Notifications ------------------------------------------------------
  const notifications: AppNotification[] = [
    {
      id: createId('ntf'),
      userId,
      type: 'violation_issued',
      title: 'Violation issued',
      titleAr: 'صدرت مخالفة',
      body: `A parking violation was issued for ${vehicle.plateNumber} at Al-Irsal Street.`,
      bodyAr: `صدرت مخالفة وقوف للمركبة ${vehicle.plateNumber} في شارع الإرسال.`,
      href: `/violations/${unpaidId}`,
      violationId: unpaidId,
      vehicleId: vehicle.id,
      createdAt: dayAt(0, 14, 15),
    },
    {
      id: createId('ntf'),
      userId,
      type: 'parking_completed',
      title: 'Parking completed',
      titleAr: 'اكتمل الوقوف',
      body: 'Your parking at Al-Irsal Street ended. 2.35 ₪ was charged to your wallet.',
      bodyAr: 'انتهى وقوفك في شارع الإرسال. تم خصم ٢.٣٥ ₪ من محفظتك.',
      href: '/(tabs)/activity',
      createdAt: dayAt(0, 14, 1),
    },
    {
      id: createId('ntf'),
      userId,
      type: 'appeal_updated',
      title: 'Appeal under review',
      titleAr: 'الاعتراض قيد المراجعة',
      body: 'Your appeal APL-2026-000318 is being reviewed by Ramallah Municipality.',
      bodyAr: 'يجري مراجعة اعتراضك APL-2026-000318 من قبل بلدية رام الله.',
      href: `/violations/${appealedId}`,
      violationId: appealedId,
      readAt: dayAt(2, 11, 0),
      createdAt: dayAt(2, 10, 5),
    },
    {
      id: createId('ntf'),
      userId,
      type: 'topup_success',
      title: 'Top-up successful',
      titleAr: 'تم الشحن بنجاح',
      body: '20.00 ₪ was added to your wallet.',
      bodyAr: 'تمت إضافة ٢٠.٠٠ ₪ إلى محفظتك.',
      href: '/(tabs)/wallet',
      readAt: dayAt(1, 19, 0),
      createdAt: dayAt(1, 18, 30),
    },
    {
      id: createId('ntf'),
      userId,
      type: 'parking_expiring',
      title: 'Parking expires in 10 minutes',
      titleAr: 'ينتهي وقوفك خلال ١٠ دقائق',
      body: 'Your parking at Al-Manara Square expires soon. Extend it to avoid a fine.',
      bodyAr: 'ينتهي وقوفك في دوار المنارة قريباً. مدّد الوقت لتجنب المخالفة.',
      readAt: dayAt(1, 12, 15),
      createdAt: dayAt(1, 12, 10),
    },
  ];

  db.notifications.push(...notifications);
}
