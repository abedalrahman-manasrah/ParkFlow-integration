import type { ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  View,
  type ScrollViewProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/theme/ThemeProvider';
import { screenPadding, spacing } from '@/theme/spacing';

export interface ScreenProps {
  children: ReactNode;
  /** `scroll` adds a ScrollView; `fixed` fills the screen (maps, lists). */
  layout?: 'scroll' | 'fixed';
  /** Skip the horizontal gutter for edge-to-edge content. */
  edgeToEdge?: boolean;
  /** Paint the deep brand colour behind the status bar (hero screens). */
  tone?: 'default' | 'deep' | 'sunken';
  /** Respect the top inset. Off for screens that draw under the status bar. */
  safeTop?: boolean;
  safeBottom?: boolean;
  /** Extra bottom room so content clears the tab bar / floating CTA. */
  bottomInset?: number;
  keyboardAvoiding?: boolean;
  contentContainerStyle?: StyleProp<ViewStyle>;
  style?: StyleProp<ViewStyle>;
  scrollProps?: Omit<ScrollViewProps, 'children' | 'contentContainerStyle'>;
  testID?: string;
}

export function Screen({
  children,
  layout = 'scroll',
  edgeToEdge = false,
  tone = 'default',
  safeTop = true,
  safeBottom = true,
  bottomInset = 0,
  keyboardAvoiding = false,
  contentContainerStyle,
  style,
  scrollProps,
  testID,
}: ScreenProps) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();

  const background =
    tone === 'deep' ? colors.deep : tone === 'sunken' ? colors.surfaceSunken : colors.background;

  const padding: ViewStyle = {
    paddingTop: safeTop ? insets.top + (edgeToEdge ? 0 : spacing.md) : 0,
    paddingBottom: safeBottom ? insets.bottom + bottomInset : bottomInset,
    paddingHorizontal: edgeToEdge ? 0 : screenPadding,
  };

  const body =
    layout === 'scroll' ? (
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[
          { flexGrow: 1, paddingBottom: spacing.xxl },
          padding,
          contentContainerStyle,
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        {...scrollProps}
      >
        {children}
      </ScrollView>
    ) : (
      <View style={[{ flex: 1 }, padding, contentContainerStyle]}>{children}</View>
    );

  const content = keyboardAvoiding ? (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}
    >
      {body}
    </KeyboardAvoidingView>
  ) : (
    body
  );

  return (
    <View testID={testID} style={[{ flex: 1, backgroundColor: background }, style]}>
      <StatusBar
        barStyle={tone === 'deep' || isDark ? 'light-content' : 'dark-content'}
        backgroundColor="transparent"
        translucent
      />
      {content}
    </View>
  );
}
