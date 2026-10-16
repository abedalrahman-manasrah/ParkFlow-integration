import { Tabs } from 'expo-router';
import { TabBar } from '@/components/navigation/TabBar';

/**
 * Six destinations, Map first. The tab bar is fully custom (see TabBar) so the
 * default header/bar chrome is switched off here.
 */
export default function TabsLayout() {
  return (
    <Tabs
      tabBar={(props) => <TabBar {...props} />}
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: 'transparent' } }}
    >
      <Tabs.Screen name="map" />
      <Tabs.Screen name="share" />
      <Tabs.Screen name="activity" />
      <Tabs.Screen name="vehicles" />
      <Tabs.Screen name="wallet" />
      <Tabs.Screen name="profile" />
    </Tabs>
  );
}
