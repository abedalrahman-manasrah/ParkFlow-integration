import { Platform, type ViewStyle } from 'react-native';

type Level = 'none' | 'xs' | 'sm' | 'md' | 'lg' | 'xl';

const ios: Record<Level, ViewStyle> = {
  none: {},
  xs: { shadowColor: '#1F2D2A', shadowOpacity: 0.05, shadowRadius: 4, shadowOffset: { width: 0, height: 1 } },
  sm: { shadowColor: '#1F2D2A', shadowOpacity: 0.05, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
  md: { shadowColor: '#1F2D2A', shadowOpacity: 0.06, shadowRadius: 18, shadowOffset: { width: 0, height: 8 } },
  lg: { shadowColor: '#1F2D2A', shadowOpacity: 0.08, shadowRadius: 28, shadowOffset: { width: 0, height: 14 } },
  xl: { shadowColor: '#1F2D2A', shadowOpacity: 0.10, shadowRadius: 40, shadowOffset: { width: 0, height: 20 } },
};

const android: Record<Level, ViewStyle> = {
  none: {},
  xs: { elevation: 1 },
  sm: { elevation: 2 },
  md: { elevation: 3 },
  lg: { elevation: 4 },
  xl: { elevation: 6 },
};

const web: Record<Level, ViewStyle> = {
  none: {},
  xs: { boxShadow: '0 1px 3px rgba(31,45,42,0.04)' } as ViewStyle,
  sm: { boxShadow: '0 4px 14px rgba(31,45,42,0.05)' } as ViewStyle,
  md: { boxShadow: '0 8px 24px rgba(31,45,42,0.06)' } as ViewStyle,
  lg: { boxShadow: '0 14px 34px rgba(31,45,42,0.08)' } as ViewStyle,
  xl: { boxShadow: '0 20px 48px rgba(31,45,42,0.10)' } as ViewStyle,
};

export const shadow: Record<Level, ViewStyle> = Platform.select({
  ios,
  android,
  default: web,
}) as Record<Level, ViewStyle>;

/** Coloured glow for the primary CTA — used sparingly. */
export const brandGlow: ViewStyle = Platform.select({
  ios: { shadowColor: '#1F5A4A', shadowOpacity: 0.08, shadowRadius: 14, shadowOffset: { width: 0, height: 6 } },
  android: { elevation: 2, shadowColor: '#1F5A4A' },
  default: { boxShadow: '0 6px 16px rgba(31,90,74,0.08)' } as ViewStyle,
}) as ViewStyle;

export type ShadowLevel = Level;
