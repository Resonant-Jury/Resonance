'use client';

import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { HEADER_DRAW_W, HEADER_STROKE_Y, HEADER_TOTAL_H, headerStrokePoints } from '@/components/sections/AppHeader/HeaderChrome';
import { pointsToBezier } from '@/lib/design/wavyPath';
import styles from './ReadingProgress.module.css';

/** Below this nothing is drawn: no lone cap dot at the line's start. */
const MIN_SHOWN = 0.002;

/**
 * How far through the story the reader is, 0–1 — 0 while the story's top is
 * still below the bar's pen line, 1 once its bottom reaches the screen's
 * bottom — or null when the whole story fits on the screen (nothing to show).
 * `top` is the story's top in the viewport, `lineY` the bar's pen line.
 */
export function readingProgress(top: number, height: number, viewportH: number, lineY: number): number | null {
  const visible = viewportH - lineY;
  if (height <= visible) return null;
  return Math.min(1, Math.max(0, (lineY - top) / (height - visible)));
}

/**
 * The card page's reading progress (design note §3): a marker drawn on the
 * app bar's own wavy pen line — the same points, so centred on it and
 * covering it — from the left edge to the share of the story read, in its own
 * pen (`--reading-progress`, at the line's own width `--reading-progress-width`,
 * round caps, a soft glow of its colour `--reading-progress-glow`; the module
 * CSS), so the unread rest of the line reads as its track. Decorative — no
 * space, no pointer, no words.
 */
export function ReadingProgress({ targetRef }: { targetRef: RefObject<HTMLElement | null> }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const pathRef = useRef<SVGPathElement>(null);
  const [w, setW] = useState(0);

  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const measure = () => setW(box.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(box);
    return () => ro.disconnect();
  }, []);

  // The bar's line, stretched to the bar's width as the bar stretches it — drawn at the real width, so the
  // trim is in the path's own length.
  const d = useMemo(
    () => (w > 0 ? pointsToBezier(headerStrokePoints().map(([x, y]) => [(x * w) / HEADER_DRAW_W, y] as [number, number])) : ''),
    [w],
  );

  useEffect(() => {
    if (!d) return;
    let frame: number | null = null;
    const update = () => {
      frame = null;
      const story = targetRef.current;
      const path = pathRef.current;
      if (!story || !path) return;
      const r = story.getBoundingClientRect();
      const p = readingProgress(r.top, r.height, window.innerHeight, HEADER_STROKE_Y);
      if (p == null || p < MIN_SHOWN) {
        path.style.visibility = 'hidden';
        path.style.strokeDashoffset = '1';
        return;
      }
      path.style.visibility = 'visible';
      path.style.strokeDashoffset = String(1 - p);
    };
    const schedule = () => {
      if (frame == null) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    const ro = new ResizeObserver(schedule);
    if (targetRef.current) ro.observe(targetRef.current);
    return () => {
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      ro.disconnect();
      if (frame != null) cancelAnimationFrame(frame);
    };
  }, [d, targetRef]);

  return (
    <div ref={boxRef} className={styles.progress} aria-hidden>
      {d && (
        <svg width={w} height={HEADER_TOTAL_H} viewBox={`0 0 ${w} ${HEADER_TOTAL_H}`} className={styles.svg}>
          <path
            ref={pathRef}
            d={d}
            fill="none"
            pathLength={1}
            strokeDasharray="1 1"
            style={{ strokeDashoffset: 1, visibility: 'hidden' }}
            className={styles.line}
          />
        </svg>
      )}
    </div>
  );
}
