import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { services } from '@/services';
import type { CreateRideInput, CreateSpotInput, GeoPoint, RideSearch } from '@/types';
import { useAuthStore } from '@/store/authStore';
import { queryKeys } from './queryKeys';
import { useUserId } from './useSession';

/* Every ride or spot action can move money, so the wallet is refreshed with it. */
function useSharingInvalidation() {
  const queryClient = useQueryClient();
  return () => {
    for (const key of ['rides', 'ride', 'spots', 'spot', 'wallet', 'transactions', 'notifications']) {
      void queryClient.invalidateQueries({ queryKey: [key] });
    }
  };
}

export function useRideSearch(search: RideSearch) {
  const userId = useUserId();
  return useQuery({
    queryKey: queryKeys.rideSearch(search),
    queryFn: () => services.sharing.searchRides(search),
    enabled: Boolean(userId),
  });
}

export function useMyRides() {
  const userId = useUserId();
  return useQuery({ queryKey: queryKeys.myRides(), queryFn: () => services.sharing.myRides(), enabled: Boolean(userId) });
}

export function useRide(id?: string) {
  return useQuery({ queryKey: queryKeys.ride(id ?? ''), queryFn: () => services.sharing.getRide(id!), enabled: Boolean(id) });
}

export function useCreateRide() {
  const invalidate = useSharingInvalidation();
  return useMutation({ mutationFn: (input: CreateRideInput) => services.sharing.createRide(input), onSuccess: invalidate });
}

export function useRideAction() {
  const invalidate = useSharingInvalidation();
  return useMutation({
    mutationFn: (action:
      | { kind: 'book'; rideId: string; seats: number }
      | { kind: 'cancelRide' | 'completeRide'; rideId: string }
      | { kind: 'accept' | 'decline' | 'cancelBooking'; bookingId: string }
      | { kind: 'rate'; bookingId: string; rating: number }) => {
      switch (action.kind) {
        case 'book': return services.sharing.bookRide(action.rideId, action.seats);
        case 'cancelRide': return services.sharing.cancelRide(action.rideId);
        case 'completeRide': return services.sharing.completeRide(action.rideId);
        case 'accept': return services.sharing.respondToRideBooking(action.bookingId, true);
        case 'decline': return services.sharing.respondToRideBooking(action.bookingId, false);
        case 'cancelBooking': return services.sharing.cancelRideBooking(action.bookingId);
        case 'rate': return services.sharing.rateRideBooking(action.bookingId, action.rating);
      }
    },
    onSuccess: invalidate,
  });
}

export function useSpots(near?: GeoPoint) {
  const userId = useUserId();
  return useQuery({ queryKey: queryKeys.spots(near), queryFn: () => services.sharing.listSpots(near), enabled: Boolean(userId) });
}

export function useMySpots() {
  const userId = useUserId();
  return useQuery({ queryKey: queryKeys.mySpots(), queryFn: () => services.sharing.mySpots(), enabled: Boolean(userId) });
}

export function useSpot(id?: string) {
  return useQuery({ queryKey: queryKeys.spot(id ?? ''), queryFn: () => services.sharing.getSpot(id!), enabled: Boolean(id) });
}

export function useCreateSpot() {
  const invalidate = useSharingInvalidation();
  return useMutation({ mutationFn: (input: CreateSpotInput) => services.sharing.createSpot(input), onSuccess: invalidate });
}

export function useSpotAction() {
  const invalidate = useSharingInvalidation();
  return useMutation({
    mutationFn: (action:
      | { kind: 'book'; spotId: string; startTime: string; hours: number }
      | { kind: 'setActive'; spotId: string; active: boolean }
      | { kind: 'accept' | 'decline' | 'cancel' | 'check-in' | 'complete'; bookingId: string }
      | { kind: 'rate'; bookingId: string; rating: number }): Promise<unknown> => {
      switch (action.kind) {
        case 'book': return services.sharing.bookSpot(action.spotId, action.startTime, action.hours);
        case 'setActive': return services.sharing.setSpotActive(action.spotId, action.active);
        case 'rate': return services.sharing.rateSpotBooking(action.bookingId, action.rating);
        default: return services.sharing.spotBookingAction(action.bookingId, action.kind);
      }
    },
    onSuccess: invalidate,
  });
}

/** Self-declared gender, needed only to offer or join women-only rides. */
export function useSetGender() {
  const invalidate = useSharingInvalidation();
  return useMutation({
    mutationFn: async (gender: 'female' | 'male') => {
      await services.sharing.setGender(gender);
      const { user, setUser } = useAuthStore.getState();
      if (user) setUser({ ...user, gender });
    },
    onSuccess: invalidate,
  });
}
