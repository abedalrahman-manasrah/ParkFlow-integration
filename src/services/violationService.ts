import type { ViolationService } from './types';
import type { Appeal } from '@/types';
import { AppError } from '@/utils/errors';
import { createId } from '@/utils/id';
import { networkDelay } from '@/utils/async';
import { nowIso } from '@/utils/time';
import { getDb, mutate } from './mock/db';
import { assertSufficientBalance, makeReference, postTransaction } from './mock/ledger';

/**
 * Violations belong to a vehicle/plate, not to an account. We surface them to a
 * user by resolving which vehicles they currently have linked — which is why a
 * newly linked plate immediately shows its outstanding notices.
 */

/** Idempotency keys already settled, so a double tap cannot pay twice. */
const paidKeys = new Map<string, string>();

export const mockViolationService: ViolationService = {
  async list({ userId, vehicleId }) {
    await networkDelay(220, 460);
    const db = await getDb();

    const linkedVehicleIds = new Set(
      db.userVehicles.filter((l) => l.userId === userId && !l.unlinkedAt).map((l) => l.vehicleId),
    );

    return db.violations
      .filter((v) => linkedVehicleIds.has(v.vehicleId))
      .filter((v) => (vehicleId ? v.vehicleId === vehicleId : true))
      .sort((a, b) => b.issuedAt.localeCompare(a.issuedAt))
      .map((v) => ({ ...v }));
  },

  async get(violationId) {
    await networkDelay(140, 300);
    const db = await getDb();
    const violation = db.violations.find((v) => v.id === violationId);
    if (!violation) throw new AppError('not_found', 'Violation not found');
    return { ...violation };
  },

  async getEvidence(violationId) {
    await networkDelay(200, 420);
    const db = await getDb();
    const evidence = db.evidence.find((e) => e.violationId === violationId);
    return evidence ? { ...evidence } : undefined;
  },

  async pay({ violationId, userId, idempotencyKey }) {
    const settled = paidKeys.get(idempotencyKey);
    if (settled) {
      const db = await getDb();
      const existing = db.violations.find((v) => v.id === settled);
      if (existing) return { ...existing };
    }

    await networkDelay(500, 900);

    return mutate((db) => {
      const violation = db.violations.find((v) => v.id === violationId);
      if (!violation) throw new AppError('not_found', 'Violation not found');
      // Double tap on Pay must not debit twice.
      if (violation.status === 'paid') return { ...violation };

      assertSufficientBalance(db, userId, violation.amount);

      const transaction = postTransaction(db, userId, {
        type: 'violation_payment',
        amount: -violation.amount,
        title: 'Violation Payment',
        titleAr: 'دفع مخالفة',
        subtitle: violation.locationName,
        subtitleAr: violation.locationNameAr,
        violationId: violation.id,
        vehicleId: violation.vehicleId,
        reference: makeReference('VIO'),
      });

      violation.status = 'paid';
      violation.paidAt = nowIso();
      violation.paymentTransactionId = transaction.id;
      violation.updatedAt = nowIso();
      paidKeys.set(idempotencyKey, violation.id);

      db.notifications.push({
        id: createId('ntf'),
        userId,
        type: 'payment_success',
        title: 'Violation paid',
        titleAr: 'تم دفع المخالفة',
        body: `Notice ${violation.reference} has been paid.`,
        bodyAr: `تم دفع الإشعار ${violation.reference}.`,
        href: `/violations/${violation.id}`,
        violationId: violation.id,
        createdAt: nowIso(),
      });

      return { ...violation };
    });
  },

  async submitAppeal({ violationId, userId, reason, notes, attachments }) {
    await networkDelay(600, 1100);

    return mutate((db) => {
      const violation = db.violations.find((v) => v.id === violationId);
      if (!violation) throw new AppError('not_found', 'Violation not found');
      if (violation.status === 'paid') {
        throw new AppError('conflict', 'This violation has already been paid');
      }
      if (violation.appealId) {
        throw new AppError('conflict', 'An appeal has already been submitted for this notice');
      }

      const appeal: Appeal = {
        id: createId('apl'),
        reference: makeReference('APL'),
        violationId,
        userId,
        reason,
        notes: notes.trim(),
        attachments,
        status: 'under_review',
        submittedAt: nowIso(),
        updatedAt: nowIso(),
      };

      db.appeals.push(appeal);
      violation.appealId = appeal.id;
      violation.status = 'appealed';
      violation.updatedAt = nowIso();

      db.notifications.push({
        id: createId('ntf'),
        userId,
        type: 'appeal_updated',
        title: 'Appeal submitted',
        titleAr: 'تم إرسال الاعتراض',
        body: `Your appeal ${appeal.reference} is under review.`,
        bodyAr: `اعتراضك ${appeal.reference} قيد المراجعة.`,
        href: `/violations/${violationId}`,
        violationId,
        createdAt: nowIso(),
      });

      return appeal;
    });
  },

  async getAppeal(appealId) {
    await networkDelay(140, 300);
    const db = await getDb();
    const appeal = db.appeals.find((a) => a.id === appealId);
    if (!appeal) throw new AppError('not_found', 'Appeal not found');
    return { ...appeal };
  },
};
