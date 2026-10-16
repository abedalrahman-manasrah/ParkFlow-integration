import { Easing } from 'react-native-reanimated';

/** Durations in ms. Kept short — premium motion is quick and confident. */
export const duration = {
  instant: 90,
  fast: 160,
  normal: 240,
  slow: 360,
  slower: 520,
  pulse: 1600,
} as const;

/** Standard easing curves. `emphasized` is the app's signature curve. */
export const easing = {
  standard: Easing.bezier(0.2, 0.0, 0.0, 1.0),
  emphasized: Easing.bezier(0.16, 1, 0.3, 1),
  decelerate: Easing.out(Easing.cubic),
  accelerate: Easing.in(Easing.cubic),
  linear: Easing.linear,
};

export const spring = {
  /** Sheets, selectors — settles fast with almost no wobble. */
  sheet: { damping: 22, stiffness: 220, mass: 0.9 },
  /** Press feedback. */
  press: { damping: 18, stiffness: 380, mass: 0.6 },
  /** Playful but controlled — success ticks, badges. */
  bouncy: { damping: 12, stiffness: 200, mass: 0.8 },
} as const;
