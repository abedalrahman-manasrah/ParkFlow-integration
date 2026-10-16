import type { PaymentService } from './types';
import { networkDelay } from '@/utils/async';
import { createId } from '@/utils/id';

/**
 * Stand-in for the real payment provider. It never sees card data — only a
 * stored payment-method id — which is exactly the boundary the production
 * integration keeps.
 *
 * Failures are deterministic, not random: a card added with last four `0000`
 * gets a payment-method id tagged `decline`, so the failure path can be shown
 * on demand instead of sabotaging a live demo.
 */

type AuthorizeResult = Awaited<ReturnType<PaymentService['authorize']>>;

/** Replaying the same idempotency key must never charge twice. */
const processed = new Map<string, AuthorizeResult>();

export const mockPaymentService: PaymentService = {
  async authorize({ paymentMethodId, idempotencyKey }) {
    const seen = processed.get(idempotencyKey);
    if (seen) return seen;

    await networkDelay(600, 1200);

    const result: AuthorizeResult = paymentMethodId.includes('decline')
      ? { intentId: createId('pi'), status: 'failed', failureReason: 'Card declined by issuer' }
      : { intentId: createId('pi'), status: 'succeeded' };

    processed.set(idempotencyKey, result);
    return result;
  },
};
