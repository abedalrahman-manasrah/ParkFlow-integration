import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { services } from '@/services';
import { queryKeys } from './queryKeys';
import { useUserId } from './useSession';

export function useNotifications() {
  const userId = useUserId();

  return useQuery({
    queryKey: queryKeys.notifications(userId ?? 'anonymous'),
    queryFn: () => services.notifications.list(userId!),
    enabled: Boolean(userId),
  });
}

export function useUnreadNotificationCount() {
  const userId = useUserId();

  return useQuery({
    queryKey: queryKeys.unreadCount(userId ?? 'anonymous'),
    queryFn: () => services.notifications.unreadCount(userId!),
    enabled: Boolean(userId),
    staleTime: 10_000,
  });
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (notificationId: string) => services.notifications.markRead(notificationId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}

export function useMarkAllNotificationsRead() {
  const userId = useUserId();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => services.notifications.markAllRead(userId!),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}
