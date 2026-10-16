import { Stack } from 'expo-router';
import { useTheme } from '@/theme/ThemeProvider';

export default function ParkingLayout() {
  const { colors } = useTheme();

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="start" options={{ animation: 'slide_from_bottom' }} />
      {/* Reached by starting or stopping parking — going "back" to the form
          would be meaningless, so both are gesture-locked. */}
      <Stack.Screen name="active/[id]" options={{ gestureEnabled: true }} />
      <Stack.Screen name="receipt/[id]" options={{ gestureEnabled: false, animation: 'fade' }} />
      <Stack.Screen name="reserve/[zoneId]" options={{ animation: 'slide_from_bottom' }} />
      <Stack.Screen name="layout/[zoneId]" options={{ animation: 'slide_from_bottom' }} />
      <Stack.Screen name="reservation/[id]" />
      <Stack.Screen name="reservations/index" />
    </Stack>
  );
}
