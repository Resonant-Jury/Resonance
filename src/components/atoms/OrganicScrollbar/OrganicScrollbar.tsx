'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent, type RefObject } from 'react';
import { SB, brushSpine, scrollTopForThumb, thumbGeometry } from '@/lib/design/scrollbarGeometry';
import styles from './OrganicScrollbar.module.css';

/** How far a click on the track pages: most of a screenful, keeping a line or two in view. */
const PAGE = 0.9;
/** A wheel's line, in px, for a wheel that counts in lines. */
const LINE = 16;
/** How far the column stands in from its list's top and bottom, in px. */
const INSET = 4;

/**
 * The class a scroller wearing this bar takes (beside its own): its native
 * bar steps aside for the drawn one — except in forced colours, where the
 * drawn one can't show and the system's comes back.
 */
export const organicScrollTarget = styles.target;

export interface OrganicScrollbarProps {
  /** The overflow container it scrolls (which also takes {@link organicScrollTarget}). */
  targetRef: RefObject<HTMLElement | null>;
  seed?: number;
}

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * The scrollbar of a short list in a modal, drawn: a brush capsule — one
 * nearly straight stroke with round ends and a slight seeded bow — 6px wide
 * at rest and 10px when the pointer is over its column, in the native bars'
 * ink (globals.css `--sb-*`), terracotta while dragged. It floats in the
 * gutter the list keeps on its right (its 14px column inside a 16–18px
 * padding), so it takes no layout, and behaves like a standard bar:
 *
 * - the thumb is drawn once per length and moved whole (a transform written
 *   on every scroll frame, no transition), so it never lags or reshapes;
 * - a grab keeps the place it was grabbed (no jump to the pointer);
 * - a press on the track above or below the thumb pages up or down;
 * - a wheel over the column scrolls the list, not the page behind it.
 *
 * The native scroller stays the accessible one (keyboard, wheel over the
 * list, screen readers): the drawn bar is aria-hidden. Phones and touch
 * screens show no bar (the ≤720px / coarse-pointer rule in globals.css);
 * forced colours give the system bar back (see {@link organicScrollTarget}).
 */
export function OrganicScrollbar({ targetRef, seed = 47 }: OrganicScrollbarProps) {
  const railRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);
  // The thumb's length (0 = no bar): the only thing React draws; where it stands is written straight to its style.
  const [h, setH] = useState(0);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ grab: number } | null>(null);
  const frame = useRef<number | null>(null);

  /** The scroller's geometry on the track as it is now, or null for no bar. */
  const geometry = useCallback(() => {
    const el = targetRef.current;
    if (!el) return null;
    // The column runs the list's height, less its inset at each end — measured on the list, since a
    // column with no bar to show takes no room of its own to measure.
    const trackH = el.clientHeight - 2 * INSET;
    const g = thumbGeometry({ scrollTop: el.scrollTop, scrollHeight: el.scrollHeight, clientHeight: el.clientHeight }, trackH);
    return g ? { ...g, trackH, el } : null;
  }, [targetRef]);

  const place = useCallback(() => {
    const g = geometry();
    setH(g ? g.h : 0);
    if (g && thumbRef.current) thumbRef.current.style.transform = `translateY(${g.top}px)`;
  }, [geometry]);

  // Once per frame, however many scroll or resize events it brings.
  const schedule = useCallback(() => {
    if (frame.current != null) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      place();
    });
  }, [place]);

  // A thumb of a new length stands where the scroller is before it is painted.
  useLayoutEffect(() => place(), [place, h]);

  // Scrolling, and any change of size: the list's box (the track is its height), every child in it (items loading in).
  useEffect(() => {
    const el = targetRef.current;
    if (!el) return;
    el.addEventListener('scroll', schedule, { passive: true });
    const ro = new ResizeObserver(schedule);
    const observeAll = () => {
      ro.disconnect();
      ro.observe(el);
      for (const child of Array.from(el.children)) ro.observe(child);
    };
    observeAll();
    const mo = new MutationObserver(() => {
      observeAll();
      schedule();
    });
    mo.observe(el, { childList: true });
    return () => {
      el.removeEventListener('scroll', schedule);
      ro.disconnect();
      mo.disconnect();
      if (frame.current != null) cancelAnimationFrame(frame.current);
      frame.current = null;
    };
  }, [targetRef, schedule]);

  // A wheel over the column scrolls the list (React's onWheel can't stop the page behind it: it is passive).
  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return;
    const onWheel = (e: WheelEvent) => {
      const el = targetRef.current;
      if (!el) return;
      const unit = e.deltaMode === 1 ? LINE : e.deltaMode === 2 ? el.clientHeight : 1;
      e.preventDefault();
      el.scrollTop += e.deltaY * unit;
    };
    rail.addEventListener('wheel', onWheel, { passive: false });
    return () => rail.removeEventListener('wheel', onWheel);
  }, [targetRef]);

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    const g = geometry();
    const thumb = thumbRef.current;
    if (!g || !thumb) return;
    e.preventDefault();
    const box = thumb.getBoundingClientRect();
    if (e.clientY >= box.top && e.clientY <= box.bottom) {
      // Grabbed: the thumb keeps the place under the pointer it was taken by.
      drag.current = { grab: e.clientY - box.top };
      railRef.current?.setPointerCapture?.(e.pointerId);
      setDragging(true);
      return;
    }
    // The track above or below it: a page up or down.
    const by = (e.clientY < box.top ? -1 : 1) * g.el.clientHeight * PAGE;
    if (typeof g.el.scrollBy === 'function') g.el.scrollBy({ top: by, behavior: prefersReducedMotion() ? 'instant' : 'smooth' });
    else g.el.scrollTop += by;
  }

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    const g = d ? geometry() : null;
    if (!d || !g || !railRef.current) return;
    const railTop = railRef.current.getBoundingClientRect().top;
    // Instant, 1:1 with the pointer.
    g.el.scrollTop = scrollTopForThumb(e.clientY - railTop - d.grab, g.trackH, g.h, g.max);
  }

  function endDrag(e: PointerEvent<HTMLDivElement>) {
    if (!drag.current) return;
    drag.current = null;
    setDragging(false);
    if (railRef.current?.hasPointerCapture?.(e.pointerId)) railRef.current.releasePointerCapture(e.pointerId);
  }

  const spine = useMemo(() => (h > 0 ? brushSpine(h, seed) : ''), [h, seed]);

  return (
    <div
      ref={railRef}
      className={styles.rail}
      style={{ top: INSET, bottom: INSET }}
      data-hidden={h > 0 ? undefined : ''}
      data-dragging={dragging || undefined}
      aria-hidden
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      <span className={styles.track} />
      {h > 0 && (
        <div ref={thumbRef} className={styles.thumb} style={{ height: h }}>
          <svg width={SB.hit} height={h} viewBox={`${-SB.hit / 2} 0 ${SB.hit} ${h}`}>
            <path d={spine} />
          </svg>
        </div>
      )}
    </div>
  );
}
