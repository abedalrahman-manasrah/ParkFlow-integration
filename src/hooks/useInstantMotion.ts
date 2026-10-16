import { Platform } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

/**
 * True when entrance animations should be skipped and the final state rendered
 * immediately.
 *
 * Two cases matter:
 *  - the user has asked the OS for reduced motion;
 *  - the page has no animation frames to run on (a backgrounded browser tab),
 *    where an opacity-from-zero entrance would otherwise leave real content
 *    permanently invisible.
 *
 * Decorative motion must never be load-bearing for whether content can be seen.
 */
export function useInstantMotion(): boolean {
  const reducedMotion = useReducedMotion();

  const documentHidden =
    Platform.OS === 'web' && typeof document !== 'undefined' && document.hidden;

  return reducedMotion || documentHidden;
}
