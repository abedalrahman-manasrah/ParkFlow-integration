import { Stack } from 'expo-router';
import { useTheme } from '@/theme/ThemeProvider';

export default function RidesLayout() {
  const { colors } = useTheme();
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background }, animation: 'slide_from_right' }}>
      <Stack.Screen name="new" options={{ animation: 'slide_from_bottom' }} />
      <Stack.Screen name="mine" />
      <Stack.Screen name="[id]" />
    </Stack>
  );
}
