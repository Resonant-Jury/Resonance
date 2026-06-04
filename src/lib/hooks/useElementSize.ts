'use client';

import { RefObject, useEffect, useLayoutEffect, useState } from 'react';

// useLayoutEffect emits a warning when run on the server, so fall back to the
// no-op useEffect path there. On the client we want layout-phase measurement
// so the real size is committed *before* the browser paints — this avoids the
// organic shapes flashing at a wrong default size while we wait for an effect.
const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

export interface ElementSize {
  w: number;
  h: number;
  /** False until the element has been measured in the browser. */
  measured: boolean;
}

/**
 * Measures an element and keeps the size in sync via ResizeObserver.
 *
 * Starts at 0×0 (never a guessed default) so shape generators that gate on
 * `w && h` render nothing until the real size is known — the SVG then appears
 * already at the correct geometry instead of resizing in front of the user.
 * The trailing numeric args are accepted for call-site compatibility but no
 * longer seed an initial size.
 */
export function useElementSize<T extends HTMLElement>(
  ref: RefObject<T | null>,
  _legacyDefaultW = 0,
  _legacyDefaultH = 0,
  deps: unknown[] = []
): ElementSize {
  const [dims, setDims] = useState<ElementSize>({ w: 0, h: 0, measured: false });
  useIsomorphicLayoutEffect(() => {
    if (!ref.current) return;
    const update = () => {
      if (ref.current) {
        setDims({ w: ref.current.offsetWidth, h: ref.current.offsetHeight, measured: true });
      }
    };
    const ro = new ResizeObserver(update);
    ro.observe(ref.current);
    update();
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref.current, ...deps]);
  return dims;
}
