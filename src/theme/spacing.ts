/** 4pt base scale. Screens use these names, never raw numbers. */
export const spacing = {
  none: 0,
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  huge: 40,
  giant: 56,
} as const;

/** Horizontal gutter used by every screen so content lines up across the app. */
export const screenPadding = spacing.xl;

export type Spacing = keyof typeof spacing;
