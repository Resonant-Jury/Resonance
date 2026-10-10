'use client';

import { useMemo } from 'react';
import { pointsToBezier, wavyPoints } from '@/lib/design/wavyPath';
import { INK } from '@/lib/design/strokes';
import styles from './HeaderChrome.module.css';

export const HEADER_BODY_H = 68;
export const HEADER_WAVE_H = 14;
export const HEADER_TOTAL_H = HEADER_BODY_H + HEADER_WAVE_H;
// Y of the wavy bottom stroke — the visible bottom edge of the header chrome.
// Centering content within 0…HEADER_STROKE_Y puts it on the visible bar's
// midpoint (rather than the top HEADER_BODY_H, which reads a couple px high).
export const HEADER_STROKE_Y = HEADER_BODY_H + HEADER_WAVE_H * 0.35;

/** The width the bar's paper and pen line are drawn at, stretched across the bar. */
export const HEADER_DRAW_W = 1440;
/**
 * The header's overlay layer (AppHeader): over its paper and pen line, under its row — and so under the
 * avatar's menu, which drops from the row. A page draws on the bar's line here (the card page's reading
 * progress), never as a layer of its own over the whole header.
 */
export const HEADER_OVERLAY_ID = 'app-header-overlay';

/**
 * The points of the bar's pen line on its {@link HEADER_DRAW_W}-wide drawing
 * (what a reading-progress line drawn on it follows).
 */
export function headerStrokePoints(seed = 211): [number, number][] {
  return wavyPoints(HEADER_DRAW_W, HEADER_STROKE_Y, 1.4, seed, 12);
}

function buildHeaderPaths(seed: number) {
  const W = HEADER_DRAW_W;
  const pts = headerStrokePoints(seed);
  const strokeD = pointsToBezier(pts);
  const f = (n: number) => +n.toFixed(2);
  const last = pts[pts.length - 1];
  let maskD = `M 0,0 L ${W},0 L ${f(last[0])},${f(last[1])}`;
  for (let i = pts.length - 2; i >= 0; i--) {
    const [x0, y0] = pts[i + 1];
    const [x1, y1] = pts[i];
    const midX = (x0 + x1) / 2;
    maskD += ` C ${f(midX)},${f(y0)} ${f(midX)},${f(y1)} ${f(x1)},${f(y1)}`;
  }
  maskD += ' Z';
  return { maskD, strokeD, W };
}

/**
 * The app header's paper and its wavy pen line: cream that stops exactly on
 * the line, what scrolls passing beneath it. The line is half ink at rest and
 * whole once something is under it (`scrolled`). Shared by the app header and
 * every bar drawn in its likeness (a page's own back + title).
 */
export function HeaderChrome({ scrolled }: { scrolled: boolean }) {
  const { maskD, strokeD, W } = useMemo(() => buildHeaderPaths(211), []);
  const maskUrl = useMemo(() => {
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${W} ${HEADER_TOTAL_H}' preserveAspectRatio='none'><path d='${maskD}' fill='white'/></svg>`;
    return `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`;
  }, [maskD, W]);

  return (
    <>
      <div
        aria-hidden="true"
        className={styles.bg}
        // Phones keep the header fully opaque (the module CSS: the PWA wants
        // a solid band there); wider, it firms up once the page scrolls.
        data-scrolled={scrolled || undefined}
        style={{
          WebkitMaskImage: maskUrl,
          maskImage: maskUrl,
        }}
      />
      <svg
        aria-hidden="true"
        viewBox={`0 0 ${W} ${HEADER_TOTAL_H}`}
        preserveAspectRatio="none"
        className={styles.waveStroke}
        style={{ height: HEADER_TOTAL_H, opacity: scrolled ? 1 : 0.5 }}
      >
        <path
          d={strokeD}
          fill="none"
          stroke="var(--field-border-hover)"
          strokeWidth={INK}
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </>
  );
}
