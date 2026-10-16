import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { services } from '@/services';
import type { CreateParkingReservationInput } from '@/types';
import { queryKeys } from './queryKeys';
import { useUserId } from './useSession';

export function useReservations() {
  const userId = useUserId();
  return useQuery({
    queryKey: queryKeys.reservations(userId ?? 'anonymous'),
    queryFn: () => services.parking.listReservations(),
    enabled: Boolean(userId),
  });
}

export function useReservation(reservationId?: string) {
  return useQuery({
    queryKey: queryKeys.reservation(reservationId ?? ''),
    queryFn: () => services.parking.getReservation(reservationId!),
    enabled: Boolean(reservationId),
  });
}

function useReservationInvalidation() {
  const queryClient = useQueryClient();
  return (id?: string, parkingId?: string) => {
    void queryClient.invalidateQueries({ queryKey: ['reservations'] });
    if (id) void queryClient.invalidateQueries({ queryKey: queryKeys.reservation(id) });
    if (parkingId) void queryClient.invalidateQueries({ queryKey: queryKeys.parkingLayout(parkingId) });
  };
}

export function useCreateReservation() {
  const invalidate = useReservationInvalidation();
  return useMutation({
    mutationFn: (input: CreateParkingReservationInput) => services.parking.createReservation(input),
    onSuccess: (reservation) => invalidate(reservation.id, reservation.parkingZoneId),
  });
}

export function useCancelReservation() {
  const invalidate = useReservationInvalidation();
  return useMutation({
    mutationFn: (reservationId: string) => services.parking.cancelReservation(reservationId),
    onSuccess: (reservation) => invalidate(reservation.id, reservation.parkingZoneId),
  });
}
