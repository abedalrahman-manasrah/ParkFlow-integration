import { Redirect } from 'expo-router';
import { useAuthStore } from '@/store/authStore';

/**
 * Boot route. The root layout has already hydrated auth by the time this
 * renders, so this is a pure decision with no loading state of its own.
 */
export default function Index() {
  const user = useAuthStore((s) => s.user);
  const hasAccount = Boolean(user?.id && user.fullName);

  return <Redirect href={hasAccount ? '/(tabs)/map' : '/(onboarding)/welcome'} />;
}
