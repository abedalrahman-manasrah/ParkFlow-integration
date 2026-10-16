import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { PaymentMethod, TransactionType } from '@/types';
import { services } from '@/services';
import { queryKeys } from './queryKeys';
import { useUserId } from './useSession';

export function useWallet() {
  const userId = useUserId();

  return useQuery({
    queryKey: queryKeys.wallet(userId ?? 'anonymous'),
    queryFn: () => services.wallet.get(userId!),
    enabled: Boolean(userId),
  });
}

export function usePaymentMethods() {
  const userId = useUserId();

  return useQuery({
    queryKey: queryKeys.paymentMethods(userId ?? 'anonymous'),
    queryFn: () => services.wallet.listPaymentMethods(userId!),
    enabled: Boolean(userId),
  });
}

export function useTransactions(types?: TransactionType[], limit?: number) {
  const userId = useUserId();
  const filter = types?.length ? types.join(',') : 'all';

  return useQuery({
    queryKey: [...queryKeys.transactions(userId ?? 'anonymous', filter), limit ?? 0],
    queryFn: () => services.wallet.listTransactions({ userId: userId!, types, limit }),
    enabled: Boolean(userId),
  });
}

export function useTransaction(transactionId?: string) {
  return useQuery({
    queryKey: queryKeys.transaction(transactionId ?? ''),
    queryFn: () => services.wallet.getTransaction(transactionId!),
    enabled: Boolean(transactionId),
  });
}

function useWalletInvalidation() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ['wallet'] });
    void queryClient.invalidateQueries({ queryKey: ['transactions'] });
    void queryClient.invalidateQueries({ queryKey: ['payment-methods'] });
    void queryClient.invalidateQueries({ queryKey: ['notifications'] });
  };
}

export function useTopUp() {
  const userId = useUserId();
  const invalidate = useWalletInvalidation();

  return useMutation({
    mutationFn: ({
      amount,
      paymentMethodId,
      idempotencyKey,
    }: {
      amount: number;
      paymentMethodId: string;
      idempotencyKey: string;
    }) => services.wallet.topUp({ userId: userId!, amount, paymentMethodId, idempotencyKey }),
    onSuccess: invalidate,
  });
}

export function useSetAutoTopUp() {
  const userId = useUserId();
  const invalidate = useWalletInvalidation();

  return useMutation({
    mutationFn: (input: { enabled: boolean; threshold?: number; amount?: number }) =>
      services.wallet.setAutoTopUp({ userId: userId!, ...input }),
    onSuccess: invalidate,
  });
}

export function useAddPaymentMethod() {
  const userId = useUserId();
  const invalidate = useWalletInvalidation();

  return useMutation({
    mutationFn: (input: {
      last4: string;
      brand: PaymentMethod['brand'];
      expiryMonth: number;
      expiryYear: number;
      holderName?: string;
      makeDefault?: boolean;
    }) => services.wallet.addPaymentMethod({ userId: userId!, ...input }),
    onSuccess: invalidate,
  });
}

export function useSetDefaultPaymentMethod() {
  const userId = useUserId();
  const invalidate = useWalletInvalidation();

  return useMutation({
    mutationFn: (paymentMethodId: string) =>
      services.wallet.setDefaultPaymentMethod(userId!, paymentMethodId),
    onSuccess: invalidate,
  });
}

export function useRemovePaymentMethod() {
  const userId = useUserId();
  const invalidate = useWalletInvalidation();

  return useMutation({
    mutationFn: (paymentMethodId: string) =>
      services.wallet.removePaymentMethod(userId!, paymentMethodId),
    onSuccess: invalidate,
  });
}
