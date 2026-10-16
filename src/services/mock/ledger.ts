import type { Transaction, TransactionType, Wallet } from '@/types';
import { AppError } from '@/utils/errors';
import { createId } from '@/utils/id';
import { nowIso } from '@/utils/time';
import type { MockDatabase } from './db';

/**
 * All wallet movements go through here so the balance and the ledger can never
 * disagree. `balanceAfter` is stamped on every row, which is what lets the
 * activity screen show a running balance without recomputing history.
 */

export function requireWallet(db: MockDatabase, userId: string): Wallet {
  const wallet = db.wallets.find((w) => w.userId === userId);
  if (!wallet) throw new AppError('not_found', 'Wallet not found');
  return wallet;
}

interface LedgerEntry {
  type: TransactionType;
  /** Signed minor units: negative debits the wallet. */
  amount: number;
  title: string;
  titleAr: string;
  subtitle?: string;
  subtitleAr?: string;
  paymentMethodId?: string;
  parkingSessionId?: string;
  violationId?: string;
  vehicleId?: string;
  reference: string;
  status?: Transaction['status'];
  failureReason?: string;
}

export function postTransaction(
  db: MockDatabase,
  userId: string,
  entry: LedgerEntry,
): Transaction {
  const wallet = requireWallet(db, userId);
  const status = entry.status ?? 'completed';

  if (status === 'completed') {
    wallet.balance += entry.amount;
    wallet.updatedAt = nowIso();
  }

  const transaction: Transaction = {
    id: createId('txn'),
    userId,
    walletId: wallet.id,
    type: entry.type,
    status,
    amount: entry.amount,
    currency: 'ILS',
    balanceAfter: wallet.balance,
    title: entry.title,
    titleAr: entry.titleAr,
    subtitle: entry.subtitle,
    subtitleAr: entry.subtitleAr,
    paymentMethodId: entry.paymentMethodId,
    parkingSessionId: entry.parkingSessionId,
    violationId: entry.violationId,
    vehicleId: entry.vehicleId,
    reference: entry.reference,
    failureReason: entry.failureReason,
    createdAt: nowIso(),
  };

  db.transactions.push(transaction);
  return transaction;
}

/** Throws `insufficient_funds` rather than letting the balance go negative. */
export function assertSufficientBalance(db: MockDatabase, userId: string, amount: number): void {
  const wallet = requireWallet(db, userId);
  if (wallet.balance < amount) {
    throw new AppError('insufficient_funds', 'Wallet balance is too low', {
      balance: wallet.balance,
      required: amount,
    });
  }
}

export function makeReference(prefix: string): string {
  const n = Math.floor(100_000 + Math.random() * 899_999);
  return `${prefix}-${new Date().getFullYear()}-${n}`;
}
