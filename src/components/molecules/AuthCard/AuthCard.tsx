'use client';

import { useMemo, useRef, type CSSProperties, type ReactNode } from 'react';
import { HandDrawnBorder } from '@/components/atoms/HandDrawnBorder/HandDrawnBorder';
import { ShapeGrain } from '@/components/atoms/ShapeGrain/ShapeGrain';
import { GrainOverlay } from '@/components/atoms/GrainOverlay/GrainOverlay';
import { useElementSize } from '@/lib/hooks/useElementSize';
import { wobRect } from '@/lib/design/wobRect';
import { pointsToBezier, wavyPoints } from '@/lib/design/wavyPath';
import { INK, INK_LIGHT } from '@/lib/design/strokes';
import styles from './AuthCard.module.css';

const SEED = 313;
const BORDER = 'color-mix(in oklch, var(--color-terracotta), black 18%)';

// The phone's sheet has one wavy pen line for a top edge, a turn every ~68px
// of its width. The width is the CSS's to know (the server's HTML has no
// measure), so the edge is drawn for each band of phone widths and the module
// CSS shows the band's own: 5 turns under 374px, 6 up to 442 … 9 from 578.
export const SHEET_EDGE_TURNS = [5, 6, 7, 8, 9] as const;
export const SHEET_EDGE_TURN_PX = 68;
const EDGE_H = 14; // the strip the line wobbles in (its height in the CSS)
const EDGE_Y = 7;
const EDGE_AMP = 4.5;

const SHEET_EDGES = SHEET_EDGE_TURNS.map((turns) => {
  const W = turns * SHEET_EDGE_TURN_PX;
  const line = pointsToBezier(wavyPoints(W, EDGE_Y, EDGE_AMP, SEED, turns));
  // Above the line is the page's paper, laid over the sheet's fill and grain,
  // so the sheet starts at the line.
  return { turns, W, line, above: `${line} L ${W},-1 L 0,-1 Z` };
});

export function AuthCard({
  children,
  title,
  intro,
}: {
  children: ReactNode;
  title: string;
  /** A line under the title (the sign-in's "We use Google…"). */
  intro?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const { w, h } = useElementSize(ref, 420, 480);
  const R = 22;
  // The module CSS's --auth-interior: derived from the accent token so the
  // Tweaks themes re-tint the card.
  const interior = 'var(--auth-interior)';
  const mag = Math.min(w, h) * 0.025;

  const borderPath = useMemo(() => {
    if (!w || !h) return '';
    return wobRect(w, h, R, SEED, mag, {
      segmentsH: [3, 4],
      segmentsV: [5, 6],
      curve: 0.55,
      cornerJitter: 0.7,
      cornerOffset: 4,
    });
  }, [w, h, mag]);

  // Both designs render; the module CSS shows the phone's (a sheet of the
  // card's paper under a wavy top edge) or the card, so the first paint is right.
  return (
    <div ref={ref} className={styles.card}>
      <div className={styles.mobileChrome} aria-hidden>
        <GrainOverlay opacity={0.04} />
        {SHEET_EDGES.map(({ turns, W, line, above }) => (
          <svg
            key={turns}
            className={styles.edge}
            data-turns={turns}
            viewBox={`0 0 ${W} ${EDGE_H}`}
            preserveAspectRatio="none"
          >
            <path d={above} fill="var(--color-cream)" />
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
      <div
        className={`${styles.desktopChrome} res-shape-stand-in`}
        aria-hidden
        // A plain card of the same paper and pen until measured.
        data-shape-pending={w > 0 && h > 0 ? undefined : ''}
        style={
          {
            '--shape-fill': interior,
            '--shape-ink': BORDER,
            '--shape-ink-width': `${INK}px`,
            '--shape-radius': `${R}px`,
          } as CSSProperties
        }
      >
        <HandDrawnBorder
          w={w}
          h={h}
          R={R}
          seed={SEED}
          mag={mag}
          fillColor={interior}
          strokeColor="transparent"
          strokeWidth={0}
          chalkSeed={7}
          segmentsH={[3, 4]}
          segmentsV={[5, 6]}
          curve={0.55}
          cornerJitter={0.7}
          cornerOffset={4}
        />
        <ShapeGrain w={w} h={h} d={borderPath} opacity={0.3} frequency={0.85} seed={SEED} />
        <HandDrawnBorder
          w={w}
          h={h}
          R={R}
          seed={SEED}
          mag={mag}
          strokeColor={BORDER}
          segmentsH={[3, 4]}
          segmentsV={[5, 6]}
          curve={0.55}
          cornerJitter={0.7}
          cornerOffset={4}
        />
      </div>

      <div className={styles.body}>
        <h1 className={styles.title} data-intro={intro ? '' : undefined}>
          {title}
        </h1>
        {intro && <p className={styles.intro}>{intro}</p>}
        {children}
      </div>
    </div>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label style={{ display: 'block', marginBottom: 16 }}>
      <span
        style={{
          display: 'block',
          fontSize: 12,
          fontWeight: 600,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: 'var(--color-text-muted)',
          marginBottom: 6,
        }}
      >
        {label}
      </span>
      {children}
      {hint && (
        <span
          style={{
            display: 'block',
            marginTop: 4,
            fontSize: 12,
            color: 'var(--color-text-muted)',
          }}
        >
          {hint}
        </span>
      )}
    </label>
  );
}

// Kept for backward compatibility; prefer the OrganicInput atom going forward.
export const authInputStyle: React.CSSProperties = {
  width: '100%',
  padding: '11px 18px',
  borderRadius: 999,
  border: '1px solid oklch(78% 0.04 60)',
  background: 'var(--color-cream)',
  fontFamily: 'var(--font-body)',
  fontSize: 15,
  color: 'var(--color-text)',
  outline: 'none',
};
