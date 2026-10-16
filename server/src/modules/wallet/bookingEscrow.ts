import type { Tx } from '../../database/client';

/** Caller holds the spot-booking or ride lock through refund/settlement. */
export async function findBookingRefund(tx: Tx, kind: 'spot' | 'ride', bookingId: string) {
  const refund = await tx.walletTransaction.findUnique({ where: { reference: `${kind}-refund:${bookingId}` } });
  if (refund) return refund;
  // Admin refunds created before escrow coordination used the debit's id.
  const payment = await tx.walletTransaction.findUnique({ where: { reference: `${kind}-payment:${bookingId}` }, select: { id: true } });
  return payment ? tx.walletTransaction.findUnique({ where: { reference: `refund-${payment.id}` } }) : null;
}
