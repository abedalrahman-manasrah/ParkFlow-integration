import type { WalletService } from './types';
import type { PaymentMethod } from '@/types';
import { AppError } from '@/utils/errors';
import { createId } from '@/utils/id';
import { networkDelay } from '@/utils/async';
import { nowIso } from '@/utils/time';
import { formatMoney } from '@/utils/money';
import { getDb, mutate } from './mock/db';
import { makeReference, postTransaction, requireWallet } from './mock/ledger';
import { mockPaymentService } from './paymentService';

const brandLabel: Record<PaymentMethod['brand'], string> = {
  visa: 'Visa',
  mastercard: 'Mastercard',
  amex: 'Amex',
  wallet: 'Wallet',
  cash: 'Cash',
};

export const mockWalletService: WalletService = {
  async get(userId) {
    await networkDelay(140, 320);
    const db = await getDb();
    return { ...requireWallet(db, userId) };
  },

  async topUp({ userId, amount, paymentMethodId, idempotencyKey }) {
    if (amount <= 0) throw new AppError('validation', 'Enter an amount to top up');

    const db = await getDb();
    const method = db.paymentMethods.find((m) => m.id === paymentMethodId && m.userId === userId);
    if (!method) throw new AppError('not_found', 'Payment method not found');

    // The card is charged here — and only here. Parking itself is settled from
    // the wallet balance, so we never touch the card per minute of parking.
    const intent = await mockPaymentService.authorize({
      amount,
      paymentMethodId,
      description: `Wallet top-up ${formatMoney(amount)}`,
      idempotencyKey,
    });

    return mutate((database) => {
      if (intent.status === 'failed') {
        postTransaction(database, userId, {
          type: 'topup',
          amount,
          status: 'failed',
          failureReason: intent.failureReason,
          title: 'Wallet Top-up',
          titleAr: 'شحن المحفظة',
          subtitle: `${brandLabel[method.brand]} •••• ${method.last4}`,
          subtitleAr: `${brandLabel[method.brand]} •••• ${method.last4}`,
          paymentMethodId,
          reference: makeReference('TOP'),
        });
        throw new AppError('payment_failed', intent.failureReason ?? 'The payment was declined');
      }

      const transaction = postTransaction(database, userId, {
        type: 'topup',
        amount,
        title: 'Wallet Top-up',
        titleAr: 'شحن المحفظة',
        subtitle: `${brandLabel[method.brand]} •••• ${method.last4}`,
        subtitleAr: `${brandLabel[method.brand]} •••• ${method.last4}`,
        paymentMethodId,
        reference: makeReference('TOP'),
      });

      database.notifications.push({
        id: createId('ntf'),
        userId,
        type: 'topup_success',
        title: 'Top-up successful',
        titleAr: 'تم الشحن بنجاح',
        body: `${formatMoney(amount)} was added to your wallet.`,
        bodyAr: `تمت إضافة ${formatMoney(amount)} إلى محفظتك.`,
        href: '/wallet',
        createdAt: nowIso(),
      });

      return { wallet: { ...requireWallet(database, userId) }, transaction };
    });
  },

  async setAutoTopUp({ userId, enabled, threshold, amount }) {
    await networkDelay(160, 340);
    return mutate((db) => {
      const wallet = requireWallet(db, userId);
      wallet.autoTopUpEnabled = enabled;
      if (threshold != null) wallet.autoTopUpThreshold = threshold;
      if (amount != null) wallet.autoTopUpAmount = amount;
      wallet.updatedAt = nowIso();
      return { ...wallet };
    });
  },

  async listPaymentMethods(userId) {
    await networkDelay(140, 320);
    const db = await getDb();
    return db.paymentMethods
      .filter((m) => m.userId === userId)
      .sort((a, b) => Number(b.isDefault) - Number(a.isDefault))
      .map((m) => ({ ...m }));
  },

  async addPaymentMethod({ userId, last4, brand, expiryMonth, expiryYear, holderName, makeDefault }) {
    await networkDelay(500, 900);
    return mutate((db) => {
      const isFirst = db.paymentMethods.filter((m) => m.userId === userId).length === 0;
      const method: PaymentMethod = {
        // `decline` tag makes the failure path demonstrable — see paymentService.
        id: last4 === '0000' ? createId('pm_decline') : createId('pm'),
        userId,
        brand,
        last4,
        expiryMonth,
        expiryYear,
        holderName: holderName?.trim() || undefined,
        isDefault: Boolean(makeDefault) || isFirst,
        createdAt: nowIso(),
      };

      if (method.isDefault) {
        db.paymentMethods.forEach((m) => {
          if (m.userId === userId) m.isDefault = false;
        });
        const wallet = db.wallets.find((w) => w.userId === userId);
        if (wallet) wallet.defaultPaymentMethodId = method.id;
      }

      db.paymentMethods.push(method);
      return { ...method };
    });
  },

  async setDefaultPaymentMethod(userId, paymentMethodId) {
    await networkDelay(120, 280);
    await mutate((db) => {
      const target = db.paymentMethods.find((m) => m.id === paymentMethodId && m.userId === userId);
      if (!target) throw new AppError('not_found', 'Payment method not found');
      db.paymentMethods.forEach((m) => {
        if (m.userId === userId) m.isDefault = m.id === paymentMethodId;
      });
      const wallet = db.wallets.find((w) => w.userId === userId);
      if (wallet) wallet.defaultPaymentMethodId = paymentMethodId;
    });
  },

  async removePaymentMethod(userId, paymentMethodId) {
    await networkDelay(160, 340);
    await mutate((db) => {
      const target = db.paymentMethods.find((m) => m.id === paymentMethodId && m.userId === userId);
      if (!target) throw new AppError('not_found', 'Payment method not found');

      db.paymentMethods = db.paymentMethods.filter((m) => m.id !== paymentMethodId);

      const remaining = db.paymentMethods.filter((m) => m.userId === userId);
      const wallet = db.wallets.find((w) => w.userId === userId);

      if (target.isDefault && remaining[0]) {
        remaining[0].isDefault = true;
        if (wallet) wallet.defaultPaymentMethodId = remaining[0].id;
      } else if (remaining.length === 0 && wallet) {
        wallet.defaultPaymentMethodId = undefined;
        // Auto top-up cannot run without a card on file.
        wallet.autoTopUpEnabled = false;
      }
    });
  },

  async listTransactions({ userId, types, limit }) {
    await networkDelay(200, 440);
    const db = await getDb();
    const rows = db.transactions
      .filter((t) => t.userId === userId && (!types?.length || types.includes(t.type)))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((t) => ({ ...t }));
    return limit ? rows.slice(0, limit) : rows;
  },

  async getTransaction(transactionId) {
    await networkDelay(120, 260);
    const db = await getDb();
    const transaction = db.transactions.find((t) => t.id === transactionId);
    if (!transaction) throw new AppError('not_found', 'Transaction not found');
    return { ...transaction };
  },
};
