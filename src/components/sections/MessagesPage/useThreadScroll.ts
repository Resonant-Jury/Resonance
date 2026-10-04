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
  /**
   * The last row drawn is the newest message (the default). False while the thread draws a stretch further
   * up (gone to a message far back): its foot isn't the bottom — nothing new is followed there, and nothing
   * holds the reader at it.
   */
  tail?: boolean;
  /** The reader is near the top: read the next older page (called again as they keep scrolling there). */
  onNearTop?: () => void;
  /** For a stretch further up (`tail` false): the reader is near its foot — draw the next newer page. */
  onNearBottom?: () => void;
}

export interface ThreadScroll {
  /** The reader is at (or near) the newest message. */
  atBottom: boolean;
  /** The reader is well up the thread (more than a window and a half above the newest message): the way back down is worth offering. */
  farUp: boolean;
  /** A message came in below while the reader was further up (for a "new messages" pill). */
  newBelow: boolean;
  /** Scrolls to the newest message drawn. */
  toBottom: (behavior?: ScrollBehavior) => void;
  /**
   * The reader is being taken up the thread (to a quote's original, a match, a note): what grows at the
   * bottom meanwhile — a card arriving, a picture loading — no longer pulls them back down to it.
   */
  leaveBottom: () => void;
}

const rowOf = (scroller: HTMLElement, key: string) =>
  [...scroller.querySelectorAll<HTMLElement>('[data-message-key]')].find((el) => el.dataset.messageKey === key);

/** Where a row sits from the top of the scroller's window, in pixels. */
const offsetIn = (scroller: HTMLElement, row: HTMLElement) =>
  row.getBoundingClientRect().top - scroller.getBoundingClientRect().top;

/**
 * Whether the browser keeps what is on screen in place by itself when content
 * above it changes height (CSS scroll anchoring) — Safari doesn't.
 */
function anchorsByItself(): boolean {
  return typeof CSS !== 'undefined' && typeof CSS.supports === 'function' && CSS.supports('overflow-anchor', 'auto');
}

/** The first row whose foot is below the top of the scroller's window (the rows are in order: a binary search). */
function firstVisibleRow(scroller: HTMLElement): HTMLElement | null {
  const rows = scroller.querySelectorAll<HTMLElement>('[data-message-key]');
  const top = scroller.getBoundingClientRect().top;
  let lo = 0;
  let hi = rows.length - 1;
  let found: HTMLElement | null = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (rows[mid].getBoundingClientRect().bottom > top) {
      found = rows[mid];
      hi = mid - 1;
    } else lo = mid + 1;
  }
  return found;
}

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
 *   done it, and this then moves nothing.) A row above the reader changing
 *   height later leaves it there too, where the browser doesn't anchor by
 *   itself (Safari).
 * - A new message at the bottom is followed when it is the viewer's own or
 *   the reader was at the bottom already; otherwise `newBelow` says one came.
 * - Coming near the top asks for the next older page — and, in a stretch
 *   drawn further up (`tail` false), coming near its foot for the next newer.
 */
export function useThreadScroll(ref: RefObject<HTMLElement | null>, opts: ThreadScrollOptions): ThreadScroll {
  const { firstKey, lastKey, lastIsOwn } = opts;
  const tail = opts.tail ?? true;
  const tailRef = useRef(tail);
  tailRef.current = tail;
  const [atBottom, setAtBottom] = useState(true);
  const [farUp, setFarUp] = useState(false);
  const [newBelow, setNewBelow] = useState(false);
  const atBottomRef = useRef(true);
  /** Until when the bottom doesn't pull the reader back (they are being taken up the thread). */
  const leftUntil = useRef(0);
  const drawn = useRef<{ firstKey?: string; lastKey?: string; tail?: boolean }>({});
  // Where the row that was first stood before older rows went in above it — read while rendering, which is
  // the last moment before the new rows are in the page.
  const anchor = useRef<{ forFirst: string; key: string; offset: number } | null>(null);
  const onNearTop = useRef(opts.onNearTop);
  onNearTop.current = opts.onNearTop;
  const onNearBottom = useRef(opts.onNearBottom);
  onNearBottom.current = opts.onNearBottom;

  const el = ref.current;
  if (el && drawn.current.firstKey && firstKey !== drawn.current.firstKey && anchor.current?.forFirst !== firstKey) {
    const row = rowOf(el, drawn.current.firstKey);
    anchor.current = row ? { forFirst: firstKey ?? '', key: drawn.current.firstKey, offset: offsetIn(el, row) } : null;
  }

  const toBottom = useCallback(
    (behavior: ScrollBehavior = 'auto') => {
      const scroller = ref.current;
      if (!scroller) return;
      if (behavior === 'auto') {
        scroller.scrollTop = scroller.scrollHeight;
        // There at once: what grows at the foot from here on keeps the reader with it.
        if (tailRef.current) {
          atBottomRef.current = true;
          setAtBottom(true);
        }
      } else scroller.scrollTo({ top: scroller.scrollHeight, behavior });
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
    // A stretch further up has no bottom to be at.
    if (!tail && atBottomRef.current) {
      atBottomRef.current = false;
      setAtBottom(false);
    }
    if (lastKey && lastKey !== before.lastKey) {
      if (!tail || before.tail === false) {
        // The stretch drawn moved (or reached the newest message as the reader came down to it): nothing came in.
      } else if (!before.lastKey || lastIsOwn || atBottomRef.current) {
        // The first rows drawn, the viewer's own send, or a reader already at the bottom: follow it.
        scroller.scrollTop = scroller.scrollHeight;
        atBottomRef.current = true;
        setAtBottom(true);
        setNewBelow(false);
      } else {
        setNewBelow(true);
      }
    }
    // Rows that don't fill the window give the reader nothing to scroll by: read further back (or draw further
    // down a stretch) now — not as a stretch gives way to the newest, which the reader is taken down to.
    if ((firstKey !== before.firstKey || lastKey !== before.lastKey) && !(tail && before.tail === false)) {
      if (scroller.scrollTop <= TOP_SLACK) onNearTop.current?.();
      if (!tail && scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight <= TOP_SLACK) onNearBottom.current?.();
    }
    drawn.current = { firstKey, lastKey, tail };
  }, [ref, firstKey, lastKey, lastIsOwn, tail]);

  // The scroller may be drawn after the hook first runs (the thread waits for its person): follow the element.
  const [scroller, setScroller] = useState<HTMLElement | null>(null);
  // Every render (the ref doesn't say when it changes); setting it only on a change ends there.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    if (ref.current !== scroller) setScroller(ref.current);
  });

  useEffect(() => {
    if (!scroller) return;
    // Where the reader is, for a browser that doesn't anchor by itself: the first row on screen and how far
    // it sits from the top of the window. A row above it that changes height afterwards (a shared card's
    // stand-in becoming the card, a picture loading) would move everything under it; the row is put back.
    const ownAnchor = !anchorsByItself();
    let held: { key: string; offset: number } | null = null;
    const holdPlace = () => {
      if (!ownAnchor) return;
      const row = firstVisibleRow(scroller);
      held = row?.dataset.messageKey ? { key: row.dataset.messageKey, offset: offsetIn(scroller, row) } : null;
    };
    const keepPlace = () => {
      if (!ownAnchor || atBottomRef.current || !held) return;
      const row = rowOf(scroller, held.key);
      const moved = row ? offsetIn(scroller, row) - held.offset : 0;
      if (Math.abs(moved) >= 1) scroller.scrollTop += moved;
    };
    const onScroll = () => {
      const below = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;
      const bottom = tailRef.current && below <= BOTTOM_SLACK;
      setFarUp(below > scroller.clientHeight * 1.5);
      if (bottom !== atBottomRef.current) {
        atBottomRef.current = bottom;
        setAtBottom(bottom);
      }
      if (bottom) setNewBelow(false);
      if (scroller.scrollTop <= TOP_SLACK) onNearTop.current?.();
      if (!tailRef.current && below <= TOP_SLACK) onNearBottom.current?.();
      holdPlace();
    };
    // A reader at the bottom stays there when the window changes size, or the newest messages grow after
    // they were drawn: a shared card or a preview arriving, a hand-drawn shape measuring itself, a picture loading.
    const keepBottom = () => {
      if (atBottomRef.current && performance.now() >= leftUntil.current) scroller.scrollTop = scroller.scrollHeight;
    };
    const resized = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(keepBottom);
    resized?.observe(scroller);
    const grown = typeof MutationObserver === 'undefined' ? null : new MutationObserver(keepBottom);
    grown?.observe(scroller, { childList: true, subtree: true });
    // Every row's height, for the browser that doesn't anchor by itself (rows coming and going are followed).
    const rowsResized = ownAnchor && typeof ResizeObserver !== 'undefined' ? new ResizeObserver(keepPlace) : null;
    const watched = new Set<Element>();
    const watchRows = () => {
      if (!rowsResized) return;
      for (const row of scroller.querySelectorAll('[data-message-key]')) {
        if (watched.has(row)) continue;
        watched.add(row);
        rowsResized.observe(row);
      }
    };
    watchRows();
    const rowsCame = rowsResized && typeof MutationObserver !== 'undefined' ? new MutationObserver(watchRows) : null;
    rowsCame?.observe(scroller, { childList: true });
    scroller.addEventListener('scroll', onScroll, { passive: true });
    scroller.addEventListener('load', keepBottom, true);
    return () => {
      resized?.disconnect();
      grown?.disconnect();
      rowsResized?.disconnect();
      rowsCame?.disconnect();
      scroller.removeEventListener('scroll', onScroll);
      scroller.removeEventListener('load', keepBottom, true);
    };
  }, [scroller]);

  const leaveBottom = useCallback(() => {
    atBottomRef.current = false;
    // The glide starts at the bottom, its first steps still within reach of it: held off for its length.
    leftUntil.current = performance.now() + SETTLE_MS + 300;
  }, []);

  return { atBottom, farUp, newBelow, toBottom, leaveBottom };
}
