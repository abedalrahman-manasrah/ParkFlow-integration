import type { ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowLeft, ArrowRight, X } from 'lucide-react-native';
import { AppText } from './AppText';
import { IconButton } from './IconButton';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/spacing';
import { useLocale } from '@/hooks/useLocale';

export interface AppHeaderProps {
  title?: string;
  subtitle?: string;
  /** `back` shows a direction-aware arrow, `close` an X, `none` nothing. */
  leading?: 'back' | 'close' | 'none';
  onLeadingPress?: () => void;
  trailing?: ReactNode;
  /** Larger title block for top-level screens. */
  size?: 'default' | 'large';
  tone?: 'default' | 'onDeep';
  style?: StyleProp<ViewStyle>;
}

export function AppHeader({
  title,
  subtitle,
  leading = 'back',
  onLeadingPress,
  trailing,
  size = 'default',
  tone = 'default',
  style,
}: AppHeaderProps) {
  const router = useRouter();
  const { colors } = useTheme();
  const { row, isRTL, t } = useLocale();

  const iconColor = tone === 'onDeep' ? colors.onDeep : colors.text;
  // The back arrow must point the way "back" reads in the current language.
  const BackIcon = isRTL ? ArrowRight : ArrowLeft;

  const handleLeading = () => {
    if (onLeadingPress) return onLeadingPress();
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/map');
  };

  return (
    <View
      style={[
        {
          flexDirection: row,
          alignItems: size === 'large' ? 'flex-start' : 'center',
          gap: spacing.md,
          minHeight: 48,
          marginBottom: size === 'large' ? spacing.xxl : spacing.lg,
        },
        style,
      ]}
    >
      {leading !== 'none' ? (
        <IconButton
          icon={
            leading === 'close' ? (
              <X size={20} color={iconColor} strokeWidth={2.4} />
            ) : (
              <BackIcon size={20} color={iconColor} strokeWidth={2.4} />
            )
          }
          tone={tone === 'onDeep' ? 'glass' : 'surface'}
          size={40}
          onPress={handleLeading}
          accessibilityLabel={leading === 'close' ? t('common.close') : t('common.back')}
        />
      ) : null}

      <View style={{ flex: 1, gap: spacing.xs }}>
        {title ? (
          <AppText
            variant={size === 'large' ? 'h1' : 'h3'}
            color={tone === 'onDeep' ? 'onDeep' : 'text'}
            numberOfLines={1}
          >
            {title}
          </AppText>
        ) : null}
        {subtitle ? (
          <AppText
            variant="bodySm"
            color={tone === 'onDeep' ? 'onDeepMuted' : 'textSecondary'}
            numberOfLines={2}
          >
            {subtitle}
          </AppText>
        ) : null}
      </View>

      {trailing}
    </View>
  );
}
