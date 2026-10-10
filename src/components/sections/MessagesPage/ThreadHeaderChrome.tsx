'use client';

import { useMemo, useRef } from 'react';
import { pointsToBezier, wavyPoints } from '@/lib/design/wavyPath';
import { INK } from '@/lib/design/strokes';
import { useElementSize } from '@/lib/hooks/useElementSize';
import pageStyles from './MessagesPage.module.css';

/** The thread header's row (its 38px content + 10px above and below). */
export const THREAD_HEADER_H = 58;
/** The band under the row the wave lies in — the app header's (HEADER_WAVE_H). */
const WAVE_BAND = 14;
/** Where the pen line runs: as the app header's, 0.35 of the way into its band. */
const LINE_Y = THREAD_HEADER_H + WAVE_BAND * 0.35;

/** The paper (cream down to the wave) and the pen line, across a header `w` wide. */
export function threadHeaderPaths(w: number): { paper: string; line: string } {
  const pts = wavyPoints(w, LINE_Y, 1.4, 41, 12);
  const line = pointsToBezier(pts);
  const f = (n: number) => +n.toFixed(2);
  const last = pts[pts.length - 1];
  let paper = `M 0,0 L ${f(w)},0 L ${f(last[0])},${f(last[1])}`;
  for (let i = pts.length - 2; i >= 0; i--) {
    const [x0, y0] = pts[i + 1];
    const [x1, y1] = pts[i];
    const midX = (x0 + x1) / 2;
    paper += ` C ${f(midX)},${f(y0)} ${f(midX)},${f(y1)} ${f(x1)},${f(y1)}`;
  }
  return { paper: `${paper} Z`, line };
}

/**
 * The thread header's paper and wavy pen line — the app header's treatment
 * (design note §4): opaque cream that stops on the wave, the messages
 * scrolling beneath it and vanishing exactly there. The line is half ink
 * while the whole history fits (nothing under it), whole otherwise.
 */
export function ThreadHeaderChrome({ under }: { under: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const { w } = useElementSize(ref);
  const paths = useMemo(() => (w > 0 ? threadHeaderPaths(w) : null), [w]);
  const h = THREAD_HEADER_H + WAVE_BAND;
  return (
    <div ref={ref} className={pageStyles.threadChrome} aria-hidden>
      {paths && (
        <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className={pageStyles.threadChromeSvg}>
          <path d={paths.paper} fill="var(--color-cream)" />
          <path
            d={paths.line}
            fill="none"
            stroke="var(--field-border-hover)"
            strokeWidth={INK}
            strokeLinecap="round"
            opacity={under ? 1 : 0.5}
            style={{ transition: 'opacity 300ms ease' }}
          />
        </svg>
      )}
    </div>
  );
}
