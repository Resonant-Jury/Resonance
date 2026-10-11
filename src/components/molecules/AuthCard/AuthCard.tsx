import { useId, type ReactNode } from 'react';
import { GrainOverlay } from '@/components/atoms/GrainOverlay/GrainOverlay';
import { pointsToBezier, wavyPoints } from '@/lib/design/wavyPath';
import { INK_LIGHT } from '@/lib/design/strokes';
import styles from './AuthCard.module.css';

const SEED = 313;
const BORDER = 'color-mix(in oklch, var(--color-terracotta), black 18%)';

// The sheet's edge is one wavy pen line. Stacked (a phone, a tablet held
// upright) the sheet sits at the foot of the screen and the line is its top;
// side by side (a wider screen) the sheet is the screen's right part and the
// line is its left. How many turns a line takes follows its length — and a
// turn is longer on a short line than on a long one: a phone's few gentle
// waves, a desktop's many small wobbles, which is what reads as drawn by hand.
// Lengths are the CSS's to know (the server's HTML has no measure), so each
// edge is drawn for every band of lengths and the module CSS shows the
// band's own (its bands are edgeTurns' steps).
/** px per turn along a line `length` px long: 92 on the shortest, 52 from 1300 px. */
export function edgeTurnPx(length: number): number {
  return Math.min(92, Math.max(52, 104 - 0.04 * length));
}
/** The turns of a line `length` px long. */
export function edgeTurns(length: number): number {
  return Math.max(3, Math.round(length / edgeTurnPx(length)));
}
const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);
/** The top edge's turns, across stacked widths (280–1024 px). */
export const TOP_EDGE_TURNS = range(edgeTurns(280), edgeTurns(1024));
/** The side edge's turns, across window heights (300–1440 px; taller ones stretch the last). */
export const SIDE_EDGE_TURNS = range(edgeTurns(300), edgeTurns(1440));

const EDGE_H = 14; // the strip the line wobbles in (its depth in the CSS)
const EDGE_Y = 7;
const EDGE_AMP = 4.5;
/** GrainOverlay's at the sheet's opacity (0.04, doubled: its noise averages ½). */
const GRAIN_OPACITY = 0.08;

// Each strip is drawn at a length its band covers, so it stretches little.
const drawnLength = (turns: number) => turns * edgeTurnPx(turns * 66);

const TOP_EDGES = TOP_EDGE_TURNS.map((turns) => {
  const W = Math.round(drawnLength(turns));
  const line = pointsToBezier(wavyPoints(W, EDGE_Y, EDGE_AMP, SEED, turns));
  // The sheet's paper below the line (the rest of it is a box under the
  // strip); above it nothing, so what lies behind — the cover's blobs —
  // goes under the sheet exactly at its edge.
  return { turns, W, line, paper: `${line} L ${W},${EDGE_H + 1} L 0,${EDGE_H + 1} Z` };
});

const SIDE_EDGES = SIDE_EDGE_TURNS.map((turns) => {
  const H = Math.round(drawnLength(turns));
  const pts = wavyPoints(H, EDGE_Y, EDGE_AMP, SEED + 1, turns).map(([y, x]) => [x, y] as [number, number]);
  const f = (n: number) => +n.toFixed(2);
  let line = `M ${f(pts[0][0])},${f(pts[0][1])}`;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    const midY = (y0 + y1) / 2;
    line += ` C ${f(x0)},${f(midY)} ${f(x1)},${f(midY)} ${f(x1)},${f(y1)}`;
  }
  // The sheet's paper right of the line; left of it nothing.
  return { turns, H, line, paper: `${line} L ${EDGE_H + 1},${H} L ${EDGE_H + 1},0 Z` };
});

/**
 * The grain every strip's paper wears, defined once: GrainOverlay's noise,
 * kept to the shape it filters (its own alpha) at the sheet's strength and
 * laid over it — so the strip's paper reads as the box's, up to the pen line.
 * Lives in an SVG that is always rendered (a filter inside a display:none
 * SVG paints nothing); each strip's paper path names it.
 */
function GrainFilter({ id }: { id: string }) {
  return (
    <svg className={styles.defs} aria-hidden>
      <defs>
        <filter id={id} x="0%" y="0%" width="100%" height="100%">
          {/* The noise and its specks as GrainOverlay makes them (linearRGB, a
              filter's default); every step names its input and result. */}
          <feTurbulence type="fractalNoise" baseFrequency="0.72" numOctaves={4} stitchTiles="stitch" result="noise" />
          <feColorMatrix
            in="noise"
            type="matrix"
            values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -0.2126 -0.7152 -0.0722 0 1"
            result="specks"
          />
          <feComposite in="specks" in2="SourceAlpha" operator="in" result="shaped" />
          <feComponentTransfer in="shaped" result="grain">
            <feFuncA type="linear" slope={GRAIN_OPACITY} />
          </feComponentTransfer>
          {/* Laid over the paper in sRGB, as GrainOverlay's opacity lays its
              grain: blended in linearRGB, 8% black darkens a light paper far
              less to the eye, and the strip showed as a lighter band. */}
          <feMerge colorInterpolationFilters="sRGB">
            <feMergeNode in="SourceGraphic" />
            <feMergeNode in="grain" />
          </feMerge>
        </filter>
      </defs>
    </svg>
  );
}

function PenLine({ d }: { d: string }) {
  return (
    <path
      d={d}
      fill="none"
      stroke={BORDER}
      strokeWidth={INK_LIGHT}
      strokeLinecap="round"
      vectorEffect="non-scaling-stroke"
    />
  );
}

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
  const grain = `${useId().replace(/:/g, '')}-grain`;
  return (
    <div className={styles.card} data-focus={focus ? '' : undefined}>
      <div className={styles.chrome} aria-hidden>
        <div className={styles.paper}>
          <GrainOverlay opacity={0.04} />
        </div>
        <GrainFilter id={grain} />
        <div className={styles.top}>
          {TOP_EDGES.map(({ turns, W, line, paper }) => (
            <svg
              key={turns}
              className={styles.edge}
              data-turns={turns}
              viewBox={`0 0 ${W} ${EDGE_H}`}
              preserveAspectRatio="none"
            >
              <path d={paper} fill="var(--auth-interior)" filter={`url(#${grain})`} />
              <PenLine d={line} />
            </svg>
          ))}
        </div>
        <div className={styles.sides}>
          {SIDE_EDGES.map(({ turns, H, line, paper }) => (
            <svg
              key={turns}
              className={styles.side}
              data-side-turns={turns}
              viewBox={`0 0 ${EDGE_H} ${H}`}
              preserveAspectRatio="none"
            >
              <path d={paper} fill="var(--auth-interior)" filter={`url(#${grain})`} />
              <PenLine d={line} />
            </svg>
          ))}
        </div>
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
