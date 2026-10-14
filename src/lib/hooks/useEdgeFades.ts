'use client';

import { useCallback, useRef, type RefObject } from 'react';

/**
 * The edges of a list that scrolls inside a dialog or a popover (the bell's
 * list, a card picker, the thread's 卡片與連結, the blocked list, the thought
 * map's tray) fade a little on the side it can still scroll toward — a hint
 * that more is there, never a frame (globals.css `[data-edge-fade-top]`,
 * `[data-edge-fade-bottom]`: 16px).
 *
 * Returns a callback ref for the scroller. Pass the component's own ref when
 * something else (an OrganicScrollbar) reads it too: it is kept current. The
 * attributes are written on the element itself, once a frame at most, so a
 * scroll never renders the list again.
 */
export function useEdgeFades<T extends HTMLElement>(ref?: RefObject<T | null>) {
  const stop = useRef<(() => void) | null>(null);
  return useCallback(
    (el: T | null) => {
      if (ref) ref.current = el;
      stop.current?.();
      stop.current = el ? watch(el) : null;
    },
    [ref],
  );
}

function watch(el: HTMLElement): () => void {
  let frame: number | null = null;
  const update = () => {
    frame = null;
    const max = el.scrollHeight - el.clientHeight;
    mark(el, 'edgeFadeTop', max > 1 && el.scrollTop > 1);
    mark(el, 'edgeFadeBottom', max > 1 && el.scrollTop < max - 1);
  };
  const schedule = () => {
    if (frame != null) return;
    // Marked pending before asking, so a frame that runs at once leaves it clear.
    frame = -1;
    const id = requestAnimationFrame(update);
    if (frame === -1) frame = id;
  };
  update();
  el.addEventListener('scroll', schedule, { passive: true });
  // The list's own size, and its rows' (they arrive, grow, go).
  const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule);
  const observeRows = () => {
    if (!ro) return;
    ro.observe(el);
    for (const child of Array.from(el.children)) ro.observe(child);
  };
  observeRows();
  const mo =
    typeof MutationObserver === 'undefined'
      ? null
      : new MutationObserver(() => {
          observeRows();
          schedule();
        });
  mo?.observe(el, { childList: true });
  return () => {
    el.removeEventListener('scroll', schedule);
    ro?.disconnect();
    mo?.disconnect();
    if (frame != null && frame !== -1) cancelAnimationFrame(frame);
  };
}

function mark(el: HTMLElement, key: 'edgeFadeTop' | 'edgeFadeBottom', on: boolean) {
  if (on) {
    if (el.dataset[key] == null) el.dataset[key] = '';
  } else if (el.dataset[key] != null) {
    delete el.dataset[key];
  }
}
