import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { MapPinOff } from 'lucide-react-native';
import { Screen, EmptyState } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';
import { useLocale } from '@/hooks/useLocale';

export default function NotFoundScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { t } = useLocale();

  return (
    <Screen layout="fixed">
      <View style={{ flex: 1, justifyContent: 'center' }}>
        <EmptyState
          icon={<MapPinOff size={28} color={colors.brand} strokeWidth={2} />}
          title={t('error.notFound')}
          body={t('error.notFoundBody')}
          action={{ label: t('tabs.map'), onPress: () => router.replace('/(tabs)/map') }}
        />
      </View>
    </Screen>
  );
}
