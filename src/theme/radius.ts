export const radius = {
  none: 0,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 18,
  xl: 20,
  xxl: 20,
  pill: 999,
} as const;

export type Radius = keyof typeof radius;
