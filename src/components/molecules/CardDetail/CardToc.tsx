'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { wavyVertical } from '@/lib/design/wavyPath';
import { scrollTopForThumb, thumbGeometry, type ScrollMetrics } from '@/lib/design/scrollbarGeometry';
import { INK_LIGHT, INK_STRONG } from '@/lib/design/strokes';
import styles from './CardToc.module.css';

export interface TocHeading {
  id: string;
  text: string;
  level: 2 | 3;
}

// Curve depth + stroke weight of the hand-drawn rule down the left of the list.
const AMP = 5;
const SW = INK_LIGHT;
const RAIL_W = AMP * 2 + SW + 2;
/** A click on the rule above or below the orange stretch moves the list this share of what shows. */
const PAGE = 0.9;
/** A wheel line, in px, for wheels that count in lines. */
const LINE = 40;

const NONE: ScrollMetrics = { scrollTop: 0, scrollHeight: 0, clientHeight: 0 };

// Measured before the first paint, so the rule appears at its height (no-op on the server).
const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

/**
 * Table of Contents for the card reading page. Headings are extracted from the
 * rendered story (so the `id`s match rehype-slug exactly); clicking one
 * smooth-scrolls the article to that section.
 *
 * The rail it sits in never runs past the window (page.module.css `.aside`), so
 * a story with many headings scrolls its list in place: the wheel over it moves
 * the list, not the page, and the edge it can still move toward fades out. No
 * scrollbar of its own — the wavy rule down its left is the bar: it stays the
 * height of what shows, and a stretch of it in terracotta stands for the part
 * of the list in view (thumbGeometry, as OrganicScrollbar's thumb), running down
 * the rule as the list scrolls. It can be dragged, and a click on the rule
 * above or below it moves the list a page; the drawn rule is aria-hidden —
 * keyboard and screen readers have the list itself.
 */
export function CardToc({ headings, title }: { headings: TocHeading[]; title: string }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const railRef = useRef<HTMLDivElement>(null);
  const frame = useRef<number | null>(null);
  const drag = useRef<{ grab: number } | null>(null);
  const [metrics, setMetrics] = useState<ScrollMetrics>(NONE);
  const [dragging, setDragging] = useState(false);

  const measure = useCallback(() => {
    frame.current = null;
    const el = scrollRef.current;
    if (!el) return;
    const next = { scrollTop: el.scrollTop, scrollHeight: el.scrollHeight, clientHeight: el.clientHeight };
    setMetrics((m) =>
      m.scrollTop === next.scrollTop && m.scrollHeight === next.scrollHeight && m.clientHeight === next.clientHeight ? m : next,
    );
  }, []);

  // One measure per frame: on scroll, and whenever the list or the room it has changes size.
  const schedule = useCallback(() => {
    if (frame.current == null) frame.current = requestAnimationFrame(measure);
  }, [measure]);

  useIsomorphicLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    measure();
    el.addEventListener('scroll', schedule, { passive: true });
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule);
    ro?.observe(el);
    if (listRef.current) ro?.observe(listRef.current);
    return () => {
      el.removeEventListener('scroll', schedule);
      ro?.disconnect();
      if (frame.current != null) cancelAnimationFrame(frame.current);
      frame.current = null;
    };
  }, [measure, schedule, headings.length]);

  // A wheel over the rule scrolls the list too (React's onWheel is passive: it can't keep the page still).
  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return;
    const onWheel = (e: WheelEvent) => {
      const el = scrollRef.current;
      if (!el || el.scrollHeight <= el.clientHeight) return;
      e.preventDefault();
      const unit = e.deltaMode === 1 ? LINE : e.deltaMode === 2 ? el.clientHeight : 1;
      el.scrollTop += e.deltaY * unit;
    };
    rail.addEventListener('wheel', onWheel, { passive: false });
    return () => rail.removeEventListener('wheel', onWheel);
  }, [headings.length]);

  const trackH = metrics.clientHeight;
  const thumb = thumbGeometry(metrics, trackH);
  const above = thumb != null && metrics.scrollTop > 1;
  const below = thumb != null && metrics.scrollTop < thumb.max - 1;

  // A pronounced wavy rule — the organic sibling of a flat 1px border — as tall
  // as the list shows. Step count scales with height so the curve stays evenly
  // spaced however tall it is.
  const linePath = useMemo(
    () => (trackH > 0 ? wavyVertical(trackH, 9, AMP, Math.max(5, Math.round(trackH / 32))) : ''),
    [trackH],
  );

  const stopDrag = useCallback((pointerId?: number) => {
    if (!drag.current) return;
    drag.current = null;
    setDragging(false);
    const rail = railRef.current;
    if (pointerId != null && rail?.hasPointerCapture?.(pointerId)) rail.releasePointerCapture(pointerId);
  }, []);

  // While a drag lasts, a release anywhere ends it, and so does the window losing focus.
  useEffect(() => {
    if (!dragging) return;
    const up = (e: globalThis.PointerEvent) => stopDrag(e.pointerId);
    const blur = () => stopDrag();
    window.addEventListener('pointerup', up, true);
    window.addEventListener('pointercancel', up, true);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('pointerup', up, true);
      window.removeEventListener('pointercancel', up, true);
      window.removeEventListener('blur', blur);
    };
  }, [dragging, stopDrag]);

  if (headings.length === 0) return null;

  function scrollTo(id: string) {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    const el = scrollRef.current;
    const rail = railRef.current;
    if (e.button !== 0 || !el || !rail || !thumb) return;
    e.preventDefault();
    const y = e.clientY - rail.getBoundingClientRect().top;
    if (y >= thumb.top && y <= thumb.top + thumb.h) {
      // Grabbed: the stretch keeps the place under the pointer it was taken by.
      drag.current = { grab: y - thumb.top };
      rail.setPointerCapture?.(e.pointerId);
      setDragging(true);
      return;
    }
    // The rule above or below it: a page up or down.
    const by = (y < thumb.top ? -1 : 1) * el.clientHeight * PAGE;
    const still = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (typeof el.scrollBy === 'function') el.scrollBy({ top: by, behavior: still ? 'instant' : 'smooth' });
    else el.scrollTop += by;
  }

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    const el = scrollRef.current;
    const rail = railRef.current;
    if (!d || !el || !rail || !thumb) return;
    if (e.pointerType === 'mouse' && (e.buttons & 1) === 0) {
      stopDrag(e.pointerId);
      return;
    }
    const y = e.clientY - rail.getBoundingClientRect().top;
    el.scrollTop = scrollTopForThumb(y - d.grab, trackH, thumb.h, thumb.max);
  }

  return (
    <nav className={styles.toc} aria-label={title}>
      <div className={styles.title}>{title}</div>
      <div className={styles.listWrap}>
        <div
          ref={railRef}
          className={styles.rail}
          style={{ width: `${RAIL_W}px`, height: `${trackH}px` }}
          data-scrolls={thumb ? true : undefined}
          data-dragging={dragging || undefined}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={(e) => stopDrag(e.pointerId)}
          onLostPointerCapture={() => stopDrag()}
          aria-hidden
        >
          {trackH > 0 && (
            <svg
              className="res-shape-fade-in"
              width={RAIL_W}
              height={trackH}
              viewBox={`${-RAIL_W / 2} 0 ${RAIL_W} ${trackH}`}
              preserveAspectRatio="none"
              style={{ display: 'block', overflow: 'visible', width: `${RAIL_W}px`, height: `${trackH}px` }}
            >
              <path d={linePath} fill="none" stroke="var(--field-border)" strokeWidth={SW} strokeLinecap="round" />
              {thumb && (
                // The part in view: the same rule, a stretch of it in terracotta. Its length runs along the
                // curve (pathLength = the rule's height), round at both ends.
                <path
                  d={linePath}
                  fill="none"
                  stroke="var(--color-terracotta)"
                  strokeWidth={INK_STRONG}
                  strokeLinecap="round"
                  pathLength={trackH}
                  strokeDasharray={`${thumb.h} ${trackH * 2}`}
                  strokeDashoffset={-thumb.top}
                />
              )}
            </svg>
          )}
        </div>
        <div
          ref={scrollRef}
          className={styles.scroller}
          data-more-above={above || undefined}
          data-more-below={below || undefined}
        >
          <ul className={styles.list} ref={listRef}>
            {headings.map((h) => (
              <li key={h.id} data-level={h.level}>
                <button type="button" className={styles.link} onClick={() => scrollTo(h.id)}>
                  {h.text}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </nav>
  );
}
