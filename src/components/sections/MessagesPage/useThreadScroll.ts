'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';

/** Within this many pixels of the end, the reader is "at the bottom" (a new message keeps them there). */
const BOTTOM_SLACK = 80;
/** Within this many pixels of the top, the next older page is read. */
const TOP_SLACK = 400;

export interface ThreadScrollOptions {
  /** The key of the first (oldest) row drawn: older rows going in above it change it. */
  firstKey: string | undefined;
  /** The key of the last (newest) row drawn. */
  lastKey: string | undefined;
  /** The newest row is the viewer's own: their own send always scrolls to it. */
  lastIsOwn: boolean;
  /** The reader is near the top: read the next older page (called again as they keep scrolling there). */
  onNearTop?: () => void;
}

export interface ThreadScroll {
  /** The reader is at (or near) the newest message. */
  atBottom: boolean;
  /** The reader is well up the thread (more than a window and a half above the newest message): the way back down is worth offering. */
  farUp: boolean;
  /** A message came in below while the reader was further up (for a "new messages" pill). */
  newBelow: boolean;
  /** Scrolls to the newest message. */
  toBottom: (behavior?: ScrollBehavior) => void;
}

const rowOf = (scroller: HTMLElement, key: string) =>
  [...scroller.querySelectorAll<HTMLElement>('[data-message-key]')].find((el) => el.dataset.messageKey === key);

/** Where a row sits from the top of the scroller's window, in pixels. */
const offsetIn = (scroller: HTMLElement, row: HTMLElement) =>
  row.getBoundingClientRect().top - scroller.getBoundingClientRect().top;

/** The longest a glide is waited for (a browser without `scrollend` says nothing when it is over). */
const SETTLE_MS = 700;

/**
 * Scrolls the thread so that `row` sits in the middle of it — the scroller
 * alone, where `scrollIntoView` would move the page around it too (the
 * headers with it). A long way (a quote's original pages back, a search hit
 * far up) is covered at once but for the last window, which glides: a glide
 * over the whole way is slow and drags everything between past the eye.
 * Resolves when the scroller has come to rest there, so what marks the row
 * (a quote's wash) is seen arriving, not spent on the way.
 */
export function centerRow(scroller: HTMLElement, row: HTMLElement, behavior: ScrollBehavior = 'smooth'): Promise<void> {
  const wanted =
    scroller.scrollTop + offsetIn(scroller, row) - Math.max(0, (scroller.clientHeight - row.offsetHeight) / 2);
  const top = Math.max(0, Math.min(wanted, scroller.scrollHeight - scroller.clientHeight));
  const way = top - scroller.scrollTop;
  const glides = behavior === 'smooth' && Math.abs(way) >= 2;
  if (glides && Math.abs(way) > scroller.clientHeight * 1.5) scroller.scrollTop = top - Math.sign(way) * scroller.clientHeight;
  if (typeof scroller.scrollTo === 'function') scroller.scrollTo({ top, behavior });
  else scroller.scrollTop = top;
  if (!glides) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      window.clearTimeout(timer);
      scroller.removeEventListener('scrollend', ended);
      resolve();
    };
    // The jump most of the way ends too (later, on its own): only an end at the row is the glide's.
    const ended = () => {
      if (Math.abs(scroller.scrollTop - top) < 2) done();
    };
    const timer = window.setTimeout(done, SETTLE_MS);
    scroller.addEventListener('scrollend', ended);
  });
}

/**
 * How a thread's scroller moves as messages come and go (the rows carry
 * `data-message-key`):
 *
 * - Older messages going in above leave what is on screen where it was: the
 *   row that was first is found again and the scroller moves by however far
 *   it went down. (Browsers that anchor scrolling on their own have already
 *   done it, and this then moves nothing.)
 * - A new message at the bottom is followed when it is the viewer's own or
 *   the reader was at the bottom already; otherwise `newBelow` says one came.
 * - Coming near the top asks for the next older page.
 */
export function useThreadScroll(ref: RefObject<HTMLElement | null>, opts: ThreadScrollOptions): ThreadScroll {
  const { firstKey, lastKey, lastIsOwn } = opts;
  const [atBottom, setAtBottom] = useState(true);
  const [farUp, setFarUp] = useState(false);
  const [newBelow, setNewBelow] = useState(false);
  const atBottomRef = useRef(true);
  const drawn = useRef<{ firstKey?: string; lastKey?: string }>({});
  // Where the row that was first stood before older rows went in above it — read while rendering, which is
  // the last moment before the new rows are in the page.
  const anchor = useRef<{ forFirst: string; key: string; offset: number } | null>(null);
  const onNearTop = useRef(opts.onNearTop);
  onNearTop.current = opts.onNearTop;

  const el = ref.current;
  if (el && drawn.current.firstKey && firstKey !== drawn.current.firstKey && anchor.current?.forFirst !== firstKey) {
    const row = rowOf(el, drawn.current.firstKey);
    anchor.current = row ? { forFirst: firstKey ?? '', key: drawn.current.firstKey, offset: offsetIn(el, row) } : null;
  }

  const toBottom = useCallback(
    (behavior: ScrollBehavior = 'auto') => {
      const scroller = ref.current;
      if (!scroller) return;
      if (behavior === 'auto') scroller.scrollTop = scroller.scrollHeight;
      else scroller.scrollTo({ top: scroller.scrollHeight, behavior });
      setNewBelow(false);
    },
    [ref],
  );

  useLayoutEffect(() => {
    const scroller = ref.current;
    if (!scroller) return;
    const before = drawn.current;
    const held = anchor.current;
    if (held && held.forFirst === (firstKey ?? '')) {
      const row = rowOf(scroller, held.key);
      if (row) scroller.scrollTop += offsetIn(scroller, row) - held.offset;
    }
    anchor.current = null;
    if (lastKey && lastKey !== before.lastKey) {
      // The first rows drawn, the viewer's own send, or a reader already at the bottom: follow it.
      if (!before.lastKey || lastIsOwn || atBottomRef.current) {
        scroller.scrollTop = scroller.scrollHeight;
        atBottomRef.current = true;
        setAtBottom(true);
        setNewBelow(false);
      } else {
        setNewBelow(true);
      }
    }
    // Rows that don't fill the window give the reader nothing to scroll up by: read further back now.
    if ((firstKey !== before.firstKey || lastKey !== before.lastKey) && scroller.scrollTop <= TOP_SLACK) {
      onNearTop.current?.();
    }
    drawn.current = { firstKey, lastKey };
  }, [ref, firstKey, lastKey, lastIsOwn]);

  // The scroller may be drawn after the hook first runs (the thread waits for its person): follow the element.
  const [scroller, setScroller] = useState<HTMLElement | null>(null);
  // Every render (the ref doesn't say when it changes); setting it only on a change ends there.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    if (ref.current !== scroller) setScroller(ref.current);
  });

  useEffect(() => {
    if (!scroller) return;
    const onScroll = () => {
      const below = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;
      const bottom = below <= BOTTOM_SLACK;
      setFarUp(below > scroller.clientHeight * 1.5);
      if (bottom !== atBottomRef.current) {
        atBottomRef.current = bottom;
        setAtBottom(bottom);
      }
      if (bottom) setNewBelow(false);
      if (scroller.scrollTop <= TOP_SLACK) onNearTop.current?.();
    };
    // A reader at the bottom stays there when the window changes size, or the newest messages grow after
    // they were drawn: a shared card or a preview arriving, a hand-drawn shape measuring itself, a picture loading.
    const keepBottom = () => {
      if (atBottomRef.current) scroller.scrollTop = scroller.scrollHeight;
    };
    const resized = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(keepBottom);
    resized?.observe(scroller);
    const grown = typeof MutationObserver === 'undefined' ? null : new MutationObserver(keepBottom);
    grown?.observe(scroller, { childList: true, subtree: true });
    scroller.addEventListener('scroll', onScroll, { passive: true });
    scroller.addEventListener('load', keepBottom, true);
    return () => {
      resized?.disconnect();
      grown?.disconnect();
      scroller.removeEventListener('scroll', onScroll);
      scroller.removeEventListener('load', keepBottom, true);
    };
  }, [scroller]);

  return { atBottom, farUp, newBelow, toBottom };
}
