import { View } from 'react-native';
import Constants from 'expo-constants';
import { Building2, Camera, ShieldCheck, Sparkles } from 'lucide-react-native';

import { AppHeader, AppText, Card, DetailRow, Divider, Screen } from '@/components/ui';
import { Wordmark } from '@/components/brand/Logo';

import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/spacing';
import { radius } from '@/theme/radius';
import { useLocale } from '@/hooks/useLocale';

export default function AboutScreen() {
  const { colors } = useTheme();
  const { t, row } = useLocale();

  const roadmap = [
    { Icon: Building2, label: t('about.roadmapGarages') },
    { Icon: Camera, label: t('about.roadmapAnpr') },
    { Icon: ShieldCheck, label: t('about.roadmapPermits') },
  ];

  return (
    <Screen>
      <AppHeader title={t('profile.about')} />

      <View style={{ gap: spacing.xl }}>
        <Card padding="xl" style={{ alignItems: 'center', gap: spacing.lg }}>
          <Wordmark size="lg" />
          <AppText variant="body" color="textSecondary" align="center" style={{ maxWidth: 300 }}>
            {t('brand.subtitle')}
          </AppText>
        </Card>

        <Card padding="lg" style={{ gap: spacing.md }}>
          <DetailRow
            label={t('profile.version')}
            value={Constants.expoConfig?.version ?? '1.0.0'}
          />
          <Divider />
          <DetailRow
            label={t('about.build')}
            value={__DEV__ ? t('about.buildDevelopment') : t('about.buildProduction')}
          />
        </Card>

        <Card padding="lg" style={{ gap: spacing.lg }}>
          <View style={{ flexDirection: row, alignItems: 'center', gap: spacing.sm }}>
            <Sparkles size={18} color={colors.brand} strokeWidth={2.2} />
            <AppText variant="titleLg">{t('common.comingSoon')}</AppText>
          </View>

          {roadmap.map(({ Icon, label }) => (
            <View key={label} style={{ flexDirection: row, alignItems: 'center', gap: spacing.md }}>
              <View
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: radius.md,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: colors.surfaceAlt,
                }}
              >
                <Icon size={18} color={colors.textSecondary} strokeWidth={2.1} />
              </View>
              <AppText variant="body" style={{ flex: 1 }}>
                {label}
              </AppText>
            </View>
          ))}
        </Card>

        <AppText variant="caption" color="textTertiary" align="center">
          {t('brand.name')} · {t('brand.region')}
        </AppText>
      </View>
    </Screen>
  );
}
