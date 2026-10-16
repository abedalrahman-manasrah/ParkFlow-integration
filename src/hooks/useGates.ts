import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { services } from '@/services';
import type { GateScan, OverstayRules } from '@/types';
import { useCurrentUser } from './useSession';

export function useIsGateStaff() {
  const { user } = useCurrentUser();
  return { gate: user?.role === 'ADMIN' || user?.role === 'PARKING_OPERATOR', patrol: Boolean(user?.role && user.role !== 'USER') };
}

/** Refreshes itself before the two-minute pass expires. */
export function useGatePass(vehicleId?: string) {
  return useQuery({
    queryKey: ['gate-pass', vehicleId ?? ''],
    queryFn: () => services.gates.gatePass(vehicleId!),
    enabled: Boolean(vehicleId),
    refetchInterval: 60_000,
    staleTime: 50_000,
  });
}

export function useGateZones(enabled = true) {
  return useQuery({ queryKey: ['gate-zones'], queryFn: () => services.gates.zones(), enabled });
}

export function useVisits(zoneId?: string) {
  return useQuery({ queryKey: ['gate-visits', zoneId ?? ''], queryFn: () => services.gates.visits(zoneId!), enabled: Boolean(zoneId), refetchInterval: 30_000 });
}

export function useGateScan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ direction, scan }: { direction: 'entry' | 'exit'; scan: GateScan }) =>
      direction === 'entry' ? services.gates.entry(scan) : services.gates.exit(scan),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['gate-visits'] }),
  });
}

export function useSaveRules() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ zoneId, rules }: { zoneId: string; rules: OverstayRules }) => services.gates.saveRules(zoneId, rules),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['gate-zones'] }),
  });
}

export function usePatrolCheck() {
  return useMutation({ mutationFn: ({ zoneId, plate }: { zoneId: string; plate: string }) => services.gates.patrolCheck(zoneId, plate) });
}

export function usePatrolIssue() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ zoneId, plate }: { zoneId: string; plate: string }) => services.gates.patrolIssue(zoneId, plate),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['violations'] }),
  });
}
