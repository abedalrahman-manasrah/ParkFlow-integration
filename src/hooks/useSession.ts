import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/store/authStore';
import { services } from '@/services';
import { queryKeys } from './queryKeys';

/** The signed-in user id, or undefined while signed out. */
export function useUserId(): string | undefined {
  return useAuthStore((s) => s.user?.id);
}

/**
 * Most hooks need a user id and are pointless without one. This throws rather
 * than returning undefined so screens behind the auth gate stay simple.
 */
export function useRequireUserId(): string {
  const userId = useUserId();
  if (!userId) throw new Error('useRequireUserId used outside an authenticated screen');
  return userId;
}

export function useCurrentUser() {
  const user = useAuthStore((s) => s.user);
  const userId = user?.id;

  const query = useQuery({
    queryKey: queryKeys.profile(userId ?? 'anonymous'),
    queryFn: () => services.profile.get(userId!),
    enabled: Boolean(userId),
    // The store copy is a cache; the backend remains authoritative.
    initialData: user,
  });

  return { user: query.data ?? user, ...query };
}
