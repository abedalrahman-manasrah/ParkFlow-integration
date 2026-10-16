import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AppealAttachment, AppealReason } from '@/types';
import { services } from '@/services';
import { queryKeys } from './queryKeys';
import { useUserId } from './useSession';

export function useViolations(vehicleId?: string) {
  const userId = useUserId();

  return useQuery({
    queryKey: queryKeys.violations(userId ?? 'anonymous', vehicleId),
    queryFn: () => services.violations.list({ userId: userId!, vehicleId }),
    enabled: Boolean(userId),
  });
}

export function useViolation(violationId?: string) {
  return useQuery({
    queryKey: queryKeys.violation(violationId ?? ''),
    queryFn: () => services.violations.get(violationId!),
    enabled: Boolean(violationId),
  });
}

export function useEvidence(violationId?: string) {
  return useQuery({
    queryKey: queryKeys.evidence(violationId ?? ''),
    queryFn: () => services.violations.getEvidence(violationId!),
    enabled: Boolean(violationId),
  });
}

export function useAppeal(appealId?: string) {
  return useQuery({
    queryKey: queryKeys.appeal(appealId ?? ''),
    queryFn: () => services.violations.getAppeal(appealId!),
    enabled: Boolean(appealId),
  });
}

function useViolationInvalidation() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ['violations'] });
    void queryClient.invalidateQueries({ queryKey: ['violation'] });
    void queryClient.invalidateQueries({ queryKey: ['wallet'] });
    void queryClient.invalidateQueries({ queryKey: ['transactions'] });
    void queryClient.invalidateQueries({ queryKey: ['notifications'] });
  };
}

export function usePayViolation() {
  const userId = useUserId();
  const invalidate = useViolationInvalidation();

  return useMutation({
    mutationFn: ({ violationId, idempotencyKey }: { violationId: string; idempotencyKey: string }) =>
      services.violations.pay({ violationId, userId: userId!, idempotencyKey }),
    onSuccess: invalidate,
  });
}

export function useSubmitAppeal() {
  const userId = useUserId();
  const invalidate = useViolationInvalidation();

  return useMutation({
    mutationFn: (input: {
      violationId: string;
      reason: AppealReason;
      notes: string;
      attachments: AppealAttachment[];
    }) => services.violations.submitAppeal({ ...input, userId: userId! }),
    onSuccess: invalidate,
  });
}
