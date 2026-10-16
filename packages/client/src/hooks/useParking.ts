import { useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ParkingSession, ParkingZone, SessionCostBreakdown } from '@parkflow/contracts';
import { services, type StartSessionInput } from '../services/index';
import { computeSessionBreakdown } from '../utils/pricing';
import { queryKeys } from './queryKeys';
import { useUserId } from './useSession';
import { newQueueKey, retryQueue } from '../offline/retryQueue';
import { AppError } from '../utils/errors';
import { cachedRead } from '../offline/storage';

export function useZones(search?: string) {
  const userId = useUserId();
  return useQuery({
    queryKey: queryKeys.zones(search),
    queryFn: () => userId
      ? cachedRead(userId, `zones.${search ?? 'all'}`, () => services.parking.listZones(search ? { search } : undefined))
      : services.parking.listZones(search ? { search } : undefined),
    staleTime: 60_000,
  });
}

/** Preserve a successful code lookup even when the original map list predates the zone. */
export function useCacheParkingZone() {
  const queryClient = useQueryClient();
  return async (zone: ParkingZone) => {
    // Older list or detail requests must not erase the resolved result on arrival.
    await Promise.all([
      queryClient.cancelQueries({ queryKey: queryKeys.zones(), exact: true }),
      queryClient.cancelQueries({ queryKey: queryKeys.zone(zone.id), exact: true }),
    ]);
    queryClient.setQueryData<ParkingZone[]>(queryKeys.zones(), (current = []) =>
      [...current.filter((entry) => entry.id !== zone.id), zone],
    );
    queryClient.setQueryData(queryKeys.zone(zone.id), zone);
  };
}

export function useZone(zoneId?: string) {
  const userId = useUserId();
  return useQuery({
    queryKey: queryKeys.zone(zoneId ?? ''),
    queryFn: () => userId
      ? cachedRead(userId, `zone.${zoneId!}`, () => services.parking.getZone(zoneId!))
      : services.parking.getZone(zoneId!),
    enabled: Boolean(zoneId),
    staleTime: 60_000,
  });
}

export function useParkingLayout(parkingId?: string) {
  const userId = useUserId();
  return useQuery({
    queryKey: queryKeys.parkingLayout(parkingId ?? ''),
    queryFn: () => userId
      ? cachedRead(userId, `parkingLayout.${parkingId!}`, () => services.parking.getLayout(parkingId!))
      : services.parking.getLayout(parkingId!),
    enabled: Boolean(parkingId),
    staleTime: Infinity,
  });
}

export function useFacilityNavigation(facilityId?: string) {
  const userId = useUserId();
  return useQuery({
    queryKey: ['facility-navigation', facilityId ?? ''],
    queryFn: () => userId
      ? cachedRead(userId, `facilityNavigation.${facilityId!}`, () => services.parking.getFacilityNavigation(facilityId!))
      : services.parking.getFacilityNavigation(facilityId!),
    enabled: Boolean(facilityId),
    staleTime: 5 * 60_000,
  });
}

/**
 * Every vehicle may have its own live session, so this is always a list.
 * Refetched on focus and app resume so a session that ended elsewhere (ANPR
 * garage exit, server-side expiry) is reflected quickly.
 */
export function useActiveSessions() {
  const userId = useUserId();

  return useQuery({
    queryKey: queryKeys.activeSessions(userId ?? 'anonymous'),
    queryFn: () => services.parking.listActiveSessions(userId!),
    enabled: Boolean(userId),
    refetchOnWindowFocus: true,
    staleTime: 5_000,
  });
}

export function useSessionById(sessionId?: string) {
  return useQuery({
    queryKey: queryKeys.session(sessionId ?? ''),
    queryFn: () => services.parking.getSession(sessionId!),
    enabled: Boolean(sessionId),
  });
}

export function useSessionHistory(vehicleId?: string) {
  const userId = useUserId();

  return useQuery({
    queryKey: queryKeys.sessions(userId ?? 'anonymous', vehicleId),
    queryFn: () => services.parking.listSessions({ userId: userId!, vehicleId }),
    enabled: Boolean(userId),
  });
}

function useParkingInvalidation() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ['sessions'] });
    void queryClient.invalidateQueries({ queryKey: ['session'] });
    void queryClient.invalidateQueries({ queryKey: ['wallet'] });
    void queryClient.invalidateQueries({ queryKey: ['transactions'] });
    void queryClient.invalidateQueries({ queryKey: ['notifications'] });
    // Paid sessions raise the trust score.
    void queryClient.invalidateQueries({ queryKey: ['trust'] });
  };
}

export function useStartParking() {
  const invalidate = useParkingInvalidation();

  return useMutation({
    mutationFn: (input: StartSessionInput) => services.parking.startSession(input),
    onSuccess: invalidate,
  });
}

export function useStopParking() {
  const invalidate = useParkingInvalidation();

  return useMutation({
    mutationFn: (sessionId: string) => services.parking.stopSession(sessionId),
    onSuccess: invalidate,
  });
}

export function useExtendParking() {
  const invalidate = useParkingInvalidation();

  return useMutation({
    mutationFn: ({ sessionId, minutes }: { sessionId: string; minutes: number }) =>
      services.parking.extendSession(sessionId, minutes),
    onSuccess: invalidate,
  });
}

export function useSettleSession() {
  const invalidate = useParkingInvalidation();

  return useMutation({
    mutationFn: (sessionId: string) => services.parking.settleSession(sessionId),
    onSuccess: invalidate,
  });
}

export function useSubmitParkingFeedback() {
  const userId = useUserId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: Omit<Parameters<typeof services.parking.submitParkingFeedback>[0], 'userId' | 'idempotencyKey'>) => {
      const idempotencyKey = newQueueKey(`feedback-${input.zoneId}-${input.outcome}`);
      try {
        return await services.parking.submitParkingFeedback({ ...input, userId: userId!, idempotencyKey });
      } catch (error) {
        if (!userId || !(error instanceof AppError) || error.code !== 'network') throw error;
        await retryQueue.enqueue({ userId, createdAt: new Date().toISOString(), idempotencyKey, mutation: { kind: 'parking-feedback', payload: input } });
        throw new AppError('network', 'Saved to send when online.', { queued: true });
      }
    },
    onSuccess: (_feedback, input) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.zone(input.zoneId) });
      void queryClient.invalidateQueries({ queryKey: ['zones'] });
    },
  });
}

/**
 * Renders a live cost/elapsed readout for a session.
 *
 * The interval only forces a re-render — every number comes from
 * `computeSessionBreakdown(session, now)`, which is a pure function of the
 * session's `startedAt`. Backgrounding the app, killing it, or a slow device
 * therefore cannot drift the timer: on resume it simply recomputes from the
 * timestamp and lands on the correct value.
 */
export function useSessionBreakdown(
  session?: ParkingSession,
  options: { live?: boolean } = {},
): SessionCostBreakdown | undefined {
  const { live = true } = options;
  const [tick, setTick] = useState(0);
  const isLive = live && session?.status === 'ACTIVE';
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!isLive) return;

    const start = () => {
      if (intervalRef.current) return;
      intervalRef.current = setInterval(() => setTick((n) => n + 1), 1000);
    };
    const stop = () => {
      if (!intervalRef.current) return;
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    };

    start();

    // Stop ticking in the background — the value is recomputed on resume.
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        setTick((n) => n + 1);
        start();
      } else {
        stop();
      }
    });

    return () => {
      stop();
      subscription.remove();
    };
  }, [isLive]);

  return useMemo(() => {
    if (!session) return undefined;
    void tick;
    return computeSessionBreakdown(session);
  }, [session, tick]);
}
