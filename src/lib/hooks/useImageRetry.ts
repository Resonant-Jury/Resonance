'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * How long a picture that failed waits before it is asked for once more: just
 * past the 15 s the server remembers a failure that may pass
 * (`REMEMBER_RETRY_MS` in lib/links/imageProxy), so the second ask is a fresh
 * fetch of the page's picture, not the remembered failure.
 */
export const IMAGE_RETRY_MS = 16_000;

/**
 * A link preview's picture (our own `/api/link-image`) that fails is hidden at
 * once and asked for again once, after `retryMs`: the server's first fetch of
 * a page's picture can fail and pass a moment later. A second failure hides it
 * for good (until `src` changes). Render the image with `key={attempt}` and
 * `onError`, and leave it out while `hidden`.
 */
export function useImageRetry(src: string | null | undefined, retryMs = IMAGE_RETRY_MS) {
  const [state, setState] = useState({ src, attempt: 0, hidden: false });
  const attempt = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  let current = state;
  if (state.src !== src) {
    current = { src, attempt: 0, hidden: false };
    setState(current);
  }

  useEffect(() => {
    attempt.current = 0;
    return () => {
      clearTimeout(timer.current);
      timer.current = undefined;
    };
  }, [src]);

  const onError = useCallback(() => {
    if (attempt.current === 0 && !timer.current) {
      timer.current = setTimeout(() => {
        timer.current = undefined;
        attempt.current = 1;
        setState((s) => ({ ...s, attempt: 1, hidden: false }));
      }, retryMs);
    }
    setState((s) => (s.hidden ? s : { ...s, hidden: true }));
  }, [retryMs]);

  return { hidden: current.hidden, attempt: current.attempt, onError };
}
