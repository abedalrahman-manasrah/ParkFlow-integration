import type { ReactNode } from 'react';
import { View } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { WEB_APP_MAX_WIDTH, WEB_VIEWPORT_HEIGHT } from './appShellMetrics';

/** Keeps the web build at phone dimensions without changing native layouts. */
export function WebAppShell({ children }: { children: ReactNode }) {
  const { colors } = useTheme();

  return (
    <View
      style={{
        width: '100%',
        height: WEB_VIEWPORT_HEIGHT,
        alignItems: 'center',
        overflow: 'hidden',
        backgroundColor: colors.deepAlt,
      }}
    >
      <View
        style={{
          flex: 1,
          width: '100%',
          maxWidth: WEB_APP_MAX_WIDTH,
          minWidth: 0,
          height: WEB_VIEWPORT_HEIGHT,
          overflow: 'hidden',
          position: 'relative',
          backgroundColor: colors.background,
        }}
      >
        {children}
      </View>
    </View>
  );
}
