import { ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Award,
  Bell,
  CalendarCheck,
  CircleHelp,
  CreditCard,
  DoorOpen,
  Info,
  QrCode,
  LogOut,
  ScrollText,
  ShieldCheck,
  Settings,
  TriangleAlert,
  User as UserIcon,
} from 'lucide-react-native';
import { useState } from 'react';
import Constants from 'expo-constants';

import {
  AppButton,
  AppText,
  Avatar,
  BottomSheet,
  Card,
  Divider,
  ListItem,
  Screen,
  TabHeader,
} from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/spacing';
import { radius } from '@/theme/radius';
import { useLocale } from '@/hooks/useLocale';
import { useIsGateStaff } from '@/hooks/useGates';
import { useCurrentUser } from '@/hooks/useSession';
import { useTrust } from '@/hooks/useCommunity';
import { useAuthStore } from '@/store/authStore';
import { usePreferencesStore } from '@/store/preferencesStore';
import { services } from '@/services';
import { formatDate } from '@/utils/time';
import { haptics } from '@/utils/haptics';

const TAB_BAR_CLEARANCE = 96;

function MenuIcon({ children }: { children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        width: 40,
        height: 40,
        borderRadius: radius.md,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.surfaceAlt,
      }}
    >
      {children}
    </View>
  );
}

export default function ProfileScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { t, dateLocale } = useLocale();
  const staff = useIsGateStaff();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  const { user } = useCurrentUser();
  const { data: trust } = useTrust();
  const signOut = useAuthStore((s) => s.signOut);
  const resetPreferences = usePreferencesStore((s) => s.reset);
  const [logoutOpen, setLogoutOpen] = useState(false);

  const handleLogout = async () => {
    haptics.medium();
    setLogoutOpen(false);
    await services.auth.signOut();
    await signOut();
    resetPreferences();
    // Drop every cached query so the next account starts clean.
    queryClient.clear();
    router.replace('/(onboarding)/welcome');
  };

  const iconProps = { size: 19, color: colors.textSecondary, strokeWidth: 2.1 } as const;

  return (
    <Screen layout="fixed" safeBottom={false}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          gap: spacing.xl,
          paddingBottom: TAB_BAR_CLEARANCE + insets.bottom,
        }}
      >
        <TabHeader title={t('profile.title')} />

        <Card padding="xl" style={{ alignItems: 'center', gap: spacing.md }}>
          <Avatar name={user?.fullName} size={76} />
          <View style={{ gap: 4, alignItems: 'center' }}>
            <AppText variant="h2" align="center">
              {user?.fullName}
            </AppText>
            <AppText variant="body" color="textSecondary" numeric align="center">
              {user?.email}
            </AppText>
          </View>
          {user?.createdAt ? (
            <AppText variant="caption" color="textTertiary" align="center">
              {t('profile.memberSince')} {formatDate(user.createdAt, dateLocale)}
            </AppText>
          ) : null}
        </Card>

        <Card padding="lg" style={{ paddingVertical: spacing.xs }}>
          <ListItem
            title={t('points.menu')}
            subtitle={
              trust
                ? trust.discountPercent
                  ? t('points.menuBody', {
                      tier: t(`points.tier.${trust.tier}` as const),
                      score: trust.score,
                      percent: trust.discountPercent,
                    })
                  : t('points.menuBodyNoDiscount', {
                      tier: t(`points.tier.${trust.tier}` as const),
                      score: trust.score,
                    })
                : undefined
            }
            leading={<MenuIcon><Award {...iconProps} /></MenuIcon>}
            showChevron
            onPress={() => router.push('/profile/points')}
          />
          <Divider inset={52} />
          <ListItem
            title={t('profile.roadAlerts')}
            leading={<MenuIcon><TriangleAlert {...iconProps} /></MenuIcon>}
            showChevron
            onPress={() => router.push('/roads')}
          />
          <Divider inset={52} />
          <ListItem
            title={t('reservation.myReservations')}
            leading={<MenuIcon><CalendarCheck {...iconProps} /></MenuIcon>}
            showChevron
            onPress={() => router.push('/parking/reservations')}
          />
          <Divider inset={52} />
          <ListItem
            title={t('gate.passTitle')}
            leading={<MenuIcon><QrCode {...iconProps} /></MenuIcon>}
            showChevron
            onPress={() => router.push('/gate/pass')}
          />
        </Card>

        {staff.patrol ? (
          <Card padding="lg" style={{ paddingVertical: spacing.xs }}>
            {staff.gate ? (
              <>
                <ListItem
                  title={t('gate.modeTitle')}
                  leading={<MenuIcon><DoorOpen {...iconProps} /></MenuIcon>}
                  showChevron
                  onPress={() => router.push('/gate')}
                />
                <Divider inset={52} />
              </>
            ) : null}
            <ListItem
              title={t('patrol.title')}
              leading={<MenuIcon><ShieldCheck {...iconProps} /></MenuIcon>}
              showChevron
              onPress={() => router.push('/gate/patrol')}
            />
          </Card>
        ) : null}

        <Card padding="lg" style={{ paddingVertical: spacing.xs }}>
          <ListItem
            title={t('profile.personalInfo')}
            leading={<MenuIcon><UserIcon {...iconProps} /></MenuIcon>}
            showChevron
            onPress={() => router.push('/profile/personal')}
          />
          <Divider inset={52} />
          <ListItem
            title={t('profile.paymentMethods')}
            leading={<MenuIcon><CreditCard {...iconProps} /></MenuIcon>}
            showChevron
            onPress={() => router.push('/wallet/methods')}
          />
          <Divider inset={52} />
          <ListItem
            title={t('violation.title')}
            leading={<MenuIcon><ScrollText {...iconProps} /></MenuIcon>}
            showChevron
            onPress={() => router.push('/violations')}
          />
          <Divider inset={52} />
          <ListItem
            title={t('notifications.title')}
            leading={<MenuIcon><Bell {...iconProps} /></MenuIcon>}
            showChevron
            onPress={() => router.push('/notifications')}
          />
        </Card>

        <Card padding="lg" style={{ paddingVertical: spacing.xs }}>
          <ListItem
            title={t('profile.settings')}
            leading={<MenuIcon><Settings {...iconProps} /></MenuIcon>}
            showChevron
            onPress={() => router.push('/profile/settings')}
          />
          <Divider inset={52} />
          <ListItem
            title={t('profile.help')}
            leading={<MenuIcon><CircleHelp {...iconProps} /></MenuIcon>}
            showChevron
            onPress={() => router.push('/profile/help')}
          />
          <Divider inset={52} />
          <ListItem
            title={t('profile.about')}
            leading={<MenuIcon><Info {...iconProps} /></MenuIcon>}
            showChevron
            onPress={() => router.push('/profile/about')}
          />
        </Card>

        <AppButton
          label={t('profile.logout')}
          variant="danger"
          onPress={() => setLogoutOpen(true)}
          icon={<LogOut size={18} color={colors.dangerText} strokeWidth={2.2} />}
        />

        <AppText variant="caption" color="textTertiary" align="center">
          {t('profile.version')} {Constants.expoConfig?.version ?? '1.0.0'}
        </AppText>
      </ScrollView>

      <BottomSheet
        visible={logoutOpen}
        onClose={() => setLogoutOpen(false)}
        title={t('profile.logoutTitle')}
        subtitle={t('profile.logoutBody')}
      >
        <View style={{ gap: spacing.md }}>
          <AppButton label={t('profile.logout')} variant="danger" onPress={handleLogout} />
          <AppButton label={t('common.cancel')} variant="ghost" onPress={() => setLogoutOpen(false)} />
        </View>
      </BottomSheet>
    </Screen>
  );
}
