'use client';

import { useSyncExternalStore } from 'react';

/**
 * Whether a media query matches — `null` until it can be known (the server
 * render and hydration). Unlike {@link useIsMobile}, whose `false` before the
 * first effect is indistinguishable from "wide", this lets a caller wait
 * rather than mount what a phone doesn't need (and then throw it away).
 * Layout that CSS can decide belongs in a media query instead.
 */
export function useMediaQuery(query: string): boolean | null {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia(query);
      mq.addEventListener('change', onChange);
      return () => mq.removeEventListener('change', onChange);
    },
    () => window.matchMedia(query).matches,
    () => null,
  );
}
