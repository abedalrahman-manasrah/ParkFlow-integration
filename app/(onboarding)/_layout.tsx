import { Stack } from 'expo-router';
import { useTheme } from '@/theme/ThemeProvider';

export default function OnboardingLayout() {
  const { colors } = useTheme();

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
        animation: 'slide_from_right',
        gestureEnabled: true,
      }}
    >
      <Stack.Screen name="welcome" options={{ animation: 'fade', gestureEnabled: false }} />
      <Stack.Screen name="email" />
      <Stack.Screen name="otp" />
      <Stack.Screen name="name" options={{ gestureEnabled: false }} />
      <Stack.Screen name="vehicle" options={{ gestureEnabled: false }} />
    </Stack>
  );
}
