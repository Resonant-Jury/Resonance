import type { ReactNode } from 'react';
import { GrainOverlay } from '@/components/atoms/GrainOverlay/GrainOverlay';
import { pointsToBezier, wavyPoints } from '@/lib/design/wavyPath';
import { INK_LIGHT } from '@/lib/design/strokes';
import styles from './AuthCard.module.css';

const SEED = 313;
const BORDER = 'color-mix(in oklch, var(--color-terracotta), black 18%)';

// The sheet's edge is one wavy pen line, a turn every ~68px of its length.
// Stacked (a phone, a tablet held upright) the sheet sits at the foot of the
// screen and the line is its top; side by side (a wider screen) the sheet is
// the screen's right part and the line is its left. Lengths are the CSS's to
// know (the server's HTML has no measure), so the top edge is drawn for each
// band of widths and the module CSS shows the band's own: 5 turns under
// 374px, 6 up to 442 … 15 from 986 (the widest stacked screen is 1024).
export const SHEET_EDGE_TURNS = [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15] as const;
export const SHEET_EDGE_TURN_PX = 68;
const EDGE_H = 14; // the strip the line wobbles in (its depth in the CSS)
const EDGE_Y = 7;
const EDGE_AMP = 4.5;

const SHEET_EDGES = SHEET_EDGE_TURNS.map((turns) => {
  const W = turns * SHEET_EDGE_TURN_PX;
  const line = pointsToBezier(wavyPoints(W, EDGE_Y, EDGE_AMP, SEED, turns));
  // The sheet's paper below the line (the rest of it is a box under the
  // strip); above it nothing, so what lies behind — the cover's blobs —
  // goes under the sheet exactly at its edge.
  return { turns, W, line, paper: `${line} L ${W},${EDGE_H + 1} L 0,${EDGE_H + 1} Z` };
});

// The side edge: one line for a screen ~900px tall (13 turns), stretched to
// the screen's height — a window's height varies less than a phone's width.
const SIDE_TURNS = 13;
const SIDE_H = SIDE_TURNS * SHEET_EDGE_TURN_PX;
const SIDE = (() => {
  const pts = wavyPoints(SIDE_H, EDGE_Y, EDGE_AMP, SEED + 1, SIDE_TURNS).map(([y, x]) => [x, y] as [number, number]);
  const f = (n: number) => +n.toFixed(2);
  let line = `M ${f(pts[0][0])},${f(pts[0][1])}`;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    const midY = (y0 + y1) / 2;
    line += ` C ${f(x0)},${f(midY)} ${f(x1)},${f(midY)} ${f(x1)},${f(y1)}`;
  }
  // The sheet's paper right of the line; left of it nothing.
  return { line, paper: `${line} L ${EDGE_H + 1},${SIDE_H} L ${EDGE_H + 1},0 Z` };
})();

/**
 * The sign-in and sign-up pages' sheet: the card's paper and grain under one
 * wavy pen line, beside or under the (auth) layout's cover. Everything here
 * is CSS-chosen, so the first paint — scripts or none — is already right.
 */
export function AuthCard({
  children,
  title,
  subtitle,
  focus = false,
}: {
  children: ReactNode;
  title: string;
  subtitle?: string;
  /** A form to fill in (sign-up's profile): on a phone the sheet takes the whole screen, the cover left out. */
  focus?: boolean;
}) {
  return (
    <div className={styles.card} data-focus={focus ? '' : undefined}>
      <div className={styles.chrome} aria-hidden>
        <div className={styles.paper}>
          <GrainOverlay opacity={0.04} />
        </div>
        <div className={styles.top}>
          {SHEET_EDGES.map(({ turns, W, line, paper }) => (
            <svg
              key={turns}
              className={styles.edge}
              data-turns={turns}
              viewBox={`0 0 ${W} ${EDGE_H}`}
              preserveAspectRatio="none"
            >
              <path d={paper} fill="var(--auth-interior)" />
              <path
                d={line}
                fill="none"
                stroke={BORDER}
                strokeWidth={INK_LIGHT}
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            </svg>
          ))}
        </div>
        <svg className={styles.side} data-side="" viewBox={`0 0 ${EDGE_H} ${SIDE_H}`} preserveAspectRatio="none">
          <path d={SIDE.paper} fill="var(--auth-interior)" />
          <path
            d={SIDE.line}
            fill="none"
            stroke={BORDER}
            strokeWidth={INK_LIGHT}
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      </div>

      <div className={styles.body}>
        <h1 className={styles.title} data-subtitle={subtitle ? '' : undefined}>
          {title}
        </h1>
        {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
        {children}
      </div>
    </div>
  );
}
