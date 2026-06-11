'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
  type RefObject,
} from 'react';
import { wavyVertical } from '@/lib/design/wavyPath';
import { INK, INK_LIGHT } from '@/lib/design/strokes';
import { useElementSize } from '@/lib/hooks/useElementSize';
import styles from './OrganicScrollbar.module.css';

// Curve depth of the rail — the vertical sibling of CardToc's wavy rule.
const AMP = 4;
const RAIL_W = AMP * 2 + 8;
/** Shortest pen stroke that still reads as a thumb, in path-length units. */
const MIN_THUMB = 32;

interface Metrics {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
}

export interface OrganicScrollbarProps {
  /** The overflow container to mirror. Omit (and set `page`) for window scroll. */
  targetRef?: RefObject<HTMLElement | null>;
  /** Mirror the document/window scroll instead of an element. Hides the native
   *  page scrollbar (html.res-hide-scrollbar) while mounted. */
  page?: boolean;
  seed?: number;
}

/**
 * Hand-drawn replacement for the native scrollbar: a single wavy vertical
 * curve (same pen language as CardToc's rail) where the thumb is a stroked
 * window onto the curve, slid via stroke-dashoffset. Scrolling down doesn't
 * translate a block — the leading edge draws fresh curve below while the tail
 * lifts off above, like a dipped pen crossing the page. The faint full-length
 * track is the dry guide line underneath.
 *
 * The consumer hides the native scrollbar on the scroll container
 * (`scrollbar-width: none`); `page` mode does this itself on `<html>`.
 */
export function OrganicScrollbar({ targetRef, page = false, seed = 47 }: OrganicScrollbarProps) {
  const railRef = useRef<HTMLDivElement>(null);
  const pathRef = useRef<SVGPathElement>(null);
  const { h: railH } = useElementSize(railRef);
  const [metrics, setMetrics] = useState<Metrics>({ scrollTop: 0, scrollHeight: 0, clientHeight: 0 });
  const [pathLen, setPathLen] = useState(0);
  const [dragging, setDragging] = useState(false);

  const update = useCallback(() => {
    if (page) {
      const doc = document.documentElement;
      setMetrics({
        scrollTop: window.scrollY,
        scrollHeight: doc.scrollHeight,
        clientHeight: window.innerHeight,
      });
    } else {
      const el = targetRef?.current;
      if (!el) return;
      setMetrics({
        scrollTop: el.scrollTop,
        scrollHeight: el.scrollHeight,
        clientHeight: el.clientHeight,
      });
    }
  }, [page, targetRef]);

  // Track scroll position + size changes of both the viewport and the content.
  useEffect(() => {
    update();
    if (page) {
      document.documentElement.classList.add('res-hide-scrollbar');
      window.addEventListener('scroll', update, { passive: true });
      window.addEventListener('resize', update);
      const ro = new ResizeObserver(update);
      ro.observe(document.body);
      return () => {
        document.documentElement.classList.remove('res-hide-scrollbar');
        window.removeEventListener('scroll', update);
        window.removeEventListener('resize', update);
        ro.disconnect();
      };
    }
    const el = targetRef?.current;
    if (!el) return;
    el.addEventListener('scroll', update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    return () => {
      el.removeEventListener('scroll', update);
      ro.disconnect();
    };
  }, [page, targetRef, update]);

  // Step count scales with height so the wave stays evenly spaced when the
  // rail grows; the path only regenerates when the rail itself resizes.
  const linePath = useMemo(
    () => (railH > 0 ? wavyVertical(railH, seed, AMP, Math.max(6, Math.round(railH / 48))) : ''),
    [railH, seed],
  );

  useLayoutEffect(() => {
    setPathLen(pathRef.current && linePath ? pathRef.current.getTotalLength() : 0);
  }, [linePath]);

  const maxScroll = metrics.scrollHeight - metrics.clientHeight;
  // A few px of overflow (divider overshoot, sub-pixel layout) isn't worth a
  // scrollbar; only draw the rail for a real scroll range.
  const scrollable = maxScroll > 6 && metrics.clientHeight > 0;

  const thumbLen = scrollable
    ? Math.max(pathLen * (metrics.clientHeight / metrics.scrollHeight), Math.min(MIN_THUMB, pathLen))
    : 0;
  const progress = scrollable ? Math.min(1, Math.max(0, metrics.scrollTop / maxScroll)) : 0;
  const thumbOffset = (pathLen - thumbLen) * progress;

  const seekTo = useCallback(
    (clientY: number) => {
      const rail = railRef.current;
      if (!rail || !scrollable || pathLen === 0) return;
      const r = rail.getBoundingClientRect();
      const thumbPx = r.height * (thumbLen / pathLen);
      const usable = r.height - thumbPx;
      if (usable <= 0) return;
      const p = Math.min(1, Math.max(0, (clientY - r.top - thumbPx / 2) / usable));
      const top = p * maxScroll;
      // Instant, not the page's smooth behavior — a dragged thumb must track 1:1.
      if (page) window.scrollTo({ top, behavior: 'instant' });
      else if (targetRef?.current) targetRef.current.scrollTop = top;
    },
    [scrollable, pathLen, thumbLen, maxScroll, page, targetRef],
  );

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (!scrollable) return;
    e.preventDefault();
    railRef.current?.setPointerCapture(e.pointerId);
    setDragging(true);
    seekTo(e.clientY);
  }

  if (!page && !targetRef) return null;

  return (
    <div
      ref={railRef}
      className={styles.rail}
      data-page={page || undefined}
      data-dragging={dragging || undefined}
      data-hidden={!scrollable || undefined}
      style={{ width: RAIL_W }}
      aria-hidden
      onPointerDown={onPointerDown}
      onPointerMove={(e) => dragging && seekTo(e.clientY)}
      onPointerUp={(e) => {
        setDragging(false);
        railRef.current?.releasePointerCapture(e.pointerId);
      }}
      onPointerCancel={() => setDragging(false)}
    >
      {railH > 0 && scrollable && (
        <svg
          className="res-shape-fade-in"
          width={RAIL_W}
          height={railH}
          viewBox={`${-RAIL_W / 2} 0 ${RAIL_W} ${railH}`}
          style={{ display: 'block', overflow: 'visible' }}
        >
          {/* dry guide line the pen follows */}
          <path
            d={linePath}
            fill="none"
            stroke="var(--field-border)"
            strokeWidth={INK_LIGHT}
            strokeLinecap="round"
            opacity={0.35}
          />
          {/* the wet stroke: a dash window slid along the same curve */}
          <path
            ref={pathRef}
            d={linePath}
            fill="none"
            className={styles.thumb}
            strokeWidth={INK}
            strokeLinecap="round"
            strokeDasharray={`${thumbLen.toFixed(2)} ${Math.max(pathLen, 1).toFixed(2)}`}
            strokeDashoffset={(-thumbOffset).toFixed(2)}
          />
        </svg>
      )}
    </div>
  );
}
