import { useCallback, useRef } from 'react';
import { createId } from '@/utils/id';

/**
 * Stable key for one logical attempt at a mutation.
 *
 * The key is generated once and reused for retries, so a double tap or a retry
 * after a timeout cannot create a second parking session or a second charge.
 * `reset()` is called after a successful, completed action to begin a new one.
 */
export function useIdempotencyKey(prefix: string): { key: () => string; reset: () => void } {
  const ref = useRef<string | null>(null);

  const key = useCallback(() => {
    if (!ref.current) ref.current = createId(prefix);
    return ref.current;
  }, [prefix]);

  const reset = useCallback(() => {
    ref.current = null;
  }, []);

  return { key, reset };
}
