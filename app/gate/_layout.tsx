import { Stack } from 'expo-router';
import { useTheme } from '@/theme/ThemeProvider';

export default function GateLayout() {
  const { colors } = useTheme();
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background }, animation: 'slide_from_right' }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="pass" />
      <Stack.Screen name="patrol" />
    </Stack>
  );
}
