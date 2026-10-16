import { useEffect, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { UserVehicleView } from '@/types';
import { services, type CreateVehicleInput } from '@/services';
import { usePreferencesStore } from '@/store/preferencesStore';
import { queryKeys } from './queryKeys';
import { useUserId } from './useSession';

export function useVehicles() {
  const userId = useUserId();

  return useQuery({
    queryKey: queryKeys.vehicles(userId ?? 'anonymous'),
    queryFn: () => services.vehicles.list(userId!),
    enabled: Boolean(userId),
  });
}

export function useVehicle(vehicleId?: string) {
  const userId = useUserId();

  return useQuery({
    queryKey: queryKeys.vehicle(userId ?? 'anonymous', vehicleId ?? ''),
    queryFn: () => services.vehicles.get(userId!, vehicleId!),
    enabled: Boolean(userId && vehicleId),
  });
}

export function useVehiclePermits(vehicleId?: string) {
  return useQuery({
    queryKey: queryKeys.vehiclePermits(vehicleId ?? ''),
    queryFn: () => services.vehicles.permits(vehicleId!),
    enabled: Boolean(vehicleId),
  });
}

/**
 * The vehicle the app is currently acting on. The stored preference wins, but we
 * self-heal when it points at a vehicle that has been unlinked — otherwise the
 * user would be stuck with a dead selection after removing a car.
 */
export function useSelectedVehicle() {
  const { data: vehicles = [], isPending } = useVehicles();
  const selectedId = usePreferencesStore((s) => s.selectedVehicleId);
  const setSelectedVehicleId = usePreferencesStore((s) => s.setSelectedVehicleId);

  const selected = useMemo<UserVehicleView | undefined>(() => {
    if (!vehicles.length) return undefined;
    return (
      vehicles.find((v) => v.id === selectedId) ??
      vehicles.find((v) => v.isDefault) ??
      vehicles[0]
    );
  }, [vehicles, selectedId]);

  useEffect(() => {
    if (selected && selected.id !== selectedId) setSelectedVehicleId(selected.id);
  }, [selected, selectedId, setSelectedVehicleId]);

  return {
    vehicles,
    selected,
    isPending,
    select: setSelectedVehicleId,
  };
}

export function useAddVehicle() {
  const userId = useUserId();
  const queryClient = useQueryClient();
  const setSelectedVehicleId = usePreferencesStore((s) => s.setSelectedVehicleId);

  return useMutation({
    mutationFn: (input: CreateVehicleInput) => services.vehicles.create(userId!, input),
    onSuccess: (vehicle) => {
      // A freshly added vehicle becomes the working selection — it is almost
      // always the one the user is about to park.
      setSelectedVehicleId(vehicle.id);
      void queryClient.invalidateQueries({ queryKey: ['vehicles'] });
      void queryClient.invalidateQueries({ queryKey: ['violations'] });
      void queryClient.invalidateQueries({ queryKey: ['wallet'] });
      void queryClient.invalidateQueries({ queryKey: ['transactions'] });
      void queryClient.invalidateQueries({ queryKey: ['sessions'] });
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}

export function useUpdateVehicle() {
  const userId = useUserId();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      vehicleId,
      input,
    }: {
      vehicleId: string;
      input: Partial<CreateVehicleInput>;
    }) => services.vehicles.update(userId!, vehicleId, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['vehicles'] });
    },
  });
}

export function useSetDefaultVehicle() {
  const userId = useUserId();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (vehicleId: string) => services.vehicles.setDefault(userId!, vehicleId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['vehicles'] });
    },
  });
}

export function useUnlinkVehicle() {
  const userId = useUserId();
  const queryClient = useQueryClient();
  const selectedId = usePreferencesStore((s) => s.selectedVehicleId);
  const setSelectedVehicleId = usePreferencesStore((s) => s.setSelectedVehicleId);

  return useMutation({
    mutationFn: (vehicleId: string) => services.vehicles.unlink(userId!, vehicleId),
    onSuccess: (_result, vehicleId) => {
      if (selectedId === vehicleId) setSelectedVehicleId(undefined);
      void queryClient.invalidateQueries({ queryKey: ['vehicles'] });
      void queryClient.invalidateQueries({ queryKey: ['violations'] });
    },
  });
}
