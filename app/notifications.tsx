import { useMemo } from 'react';
import { SectionList, View } from 'react-native';
import { Bell } from 'lucide-react-native';
import { useRouter } from 'expo-router';

import {
  AppHeader,
  AppText,
  EmptyState,
  ErrorState,
  PressableScale,
  Screen,
  SkeletonGroup,
} from '@/components/ui';

import { useTheme } from '@/theme/ThemeProvider';
import { spacing, screenPadding } from '@/theme/spacing';
import { radius } from '@/theme/radius';
import { useLocale } from '@/hooks/useLocale';
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
} from '@/hooks/useNotifications';
import type { AppNotification } from '@/types';
import { ALERT_NOTIFICATION_TYPES, NOTIFICATION_ICONS } from '@/components/domain/notificationIcons';
import { formatDayHeading, formatTime } from '@/utils/time';
import { haptics } from '@/utils/haptics';


export default function NotificationsScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { t, row, dateLocale, locale } = useLocale();

  const { data: notifications = [], isPending, isError, error, refetch, isRefetching } =
    useNotifications();
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();

  const unreadCount = notifications.filter((n) => !n.readAt).length;

  const sections = useMemo(() => {
    const groups = new Map<string, AppNotification[]>();
    notifications.forEach((notification) => {
      const key = notification.createdAt.slice(0, 10);
      const bucket = groups.get(key);
      if (bucket) bucket.push(notification);
      else groups.set(key, [notification]);
    });

    return Array.from(groups.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([day, data]) => ({
        key: day,
        title: formatDayHeading(
          data[0]!.createdAt,
          { today: t('common.today'), yesterday: t('common.yesterday') },
          dateLocale,
        ),
        data,
      }));
  }, [notifications, t, dateLocale]);

  const open = (notification: AppNotification) => {
    haptics.select();
    if (!notification.readAt) markRead.mutate(notification.id);
    if (notification.href) router.push(notification.href as never);
  };

  return (
    <Screen layout="fixed" edgeToEdge>
      <View style={{ paddingHorizontal: screenPadding, paddingTop: spacing.md }}>
        <AppHeader
          title={t('notifications.title')}
          leading="close"
          trailing={
            unreadCount > 0 ? (
              <PressableScale
                onPress={() => {
                  haptics.light();
                  markAllRead.mutate();
                }}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={t('notifications.markAllRead')}
              >
                <AppText variant="label" color="brand">
                  {t('notifications.markAllRead')}
                </AppText>
              </PressableScale>
            ) : undefined
          }
        />
      </View>

      {isPending ? (
        <View style={{ paddingHorizontal: screenPadding }}>
          <SkeletonGroup count={5} height={78} />
        </View>
      ) : isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          refreshing={isRefetching}
          onRefresh={() => void refetch()}
          showsVerticalScrollIndicator={false}
          stickySectionHeadersEnabled={false}
          contentContainerStyle={{
            paddingHorizontal: screenPadding,
            paddingBottom: spacing.giant,
            flexGrow: 1,
          }}
          renderSectionHeader={({ section }) => (
            <AppText
              variant="overline"
              color="textTertiary"
              style={{ paddingTop: spacing.lg, paddingBottom: spacing.sm }}
            >
              {section.title}
            </AppText>
          )}
          renderItem={({ item }) => {
            const Icon = NOTIFICATION_ICONS[item.type];
            const unread = !item.readAt;
            const alert = ALERT_NOTIFICATION_TYPES.includes(item.type);

            return (
              <PressableScale
                onPress={() => open(item)}
                scaleTo={0.99}
                dimTo={0.7}
                accessibilityRole="button"
                accessibilityLabel={`${locale === 'ar' ? item.titleAr : item.title}. ${
                  locale === 'ar' ? item.bodyAr : item.body
                }`}
                style={{
                  flexDirection: row,
                  gap: spacing.md,
                  padding: spacing.lg,
                  marginBottom: spacing.sm,
                  borderRadius: radius.lg,
                  backgroundColor: unread ? colors.surface : 'transparent',
                  borderWidth: unread ? 1 : 0,
                  borderColor: colors.border,
                }}
              >
                <View
                  style={{
                    width: 42,
                    height: 42,
                    borderRadius: radius.md,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: alert ? colors.dangerSoft : colors.brandSoft,
                  }}
                >
                  <Icon
                    size={19}
                    color={alert ? colors.danger : colors.brand}
                    strokeWidth={2.1}
                  />
                </View>

                <View style={{ flex: 1, gap: 4 }}>
                  <View style={{ flexDirection: row, alignItems: 'center', gap: spacing.sm }}>
                    <AppText variant="titleLg" numberOfLines={1} style={{ flex: 1 }}>
                      {locale === 'ar' ? item.titleAr : item.title}
                    </AppText>
                    <AppText variant="caption" color="textTertiary" numeric>
                      {formatTime(item.createdAt, dateLocale)}
                    </AppText>
                  </View>

                  <AppText variant="bodySm" color="textSecondary">
                    {locale === 'ar' ? item.bodyAr : item.body}
                  </AppText>
                </View>

                {unread ? (
                  <View
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 4,
                      backgroundColor: colors.brand,
                      marginTop: 6,
                    }}
                  />
                ) : null}
              </PressableScale>
            );
          }}
          ListEmptyComponent={
            <EmptyState
              icon={<Bell size={28} color={colors.brand} strokeWidth={2} />}
              title={t('notifications.empty')}
              body={t('notifications.emptyBody')}
            />
          }
        />
      )}
    </Screen>
  );
}
