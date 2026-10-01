'use client';

import { useMemo, useRef, type CSSProperties, type ReactNode } from 'react';
import { HandDrawnBorder } from '@/components/atoms/HandDrawnBorder/HandDrawnBorder';
import { ShapeGrain } from '@/components/atoms/ShapeGrain/ShapeGrain';
import { Divider } from '@/components/atoms/Divider/Divider';
import { GrainOverlay } from '@/components/atoms/GrainOverlay/GrainOverlay';
import { useElementSize } from '@/lib/hooks/useElementSize';
import { wobRect } from '@/lib/design/wobRect';
import { INK, INK_LIGHT } from '@/lib/design/strokes';
import styles from './AuthCard.module.css';

export function AuthCard({ children, title }: { children: ReactNode; title: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const { w, h } = useElementSize(ref, 420, 480);
  const seed = 313;
  const R = 22;
  // The module CSS's --auth-interior: derived from the accent token so the
  // Tweaks themes re-tint the card.
  const interior = 'var(--auth-interior)';
  const borderColor = 'color-mix(in oklch, var(--color-terracotta), black 18%)';
  const mag = Math.min(w, h) * 0.025;

  const borderPath = useMemo(() => {
    if (!w || !h) return '';
    return wobRect(w, h, R, seed, mag, {
      segmentsH: [3, 4],
      segmentsV: [5, 6],
      curve: 0.55,
      cornerJitter: 0.7,
      cornerOffset: 4,
    });
  }, [w, h, mag]);

  // Both designs render; the module CSS shows the phone's (a borderless
  // section between wavy rules) or the card, so the first paint is right.
  return (
    <div ref={ref} className={styles.card}>
      <div className={styles.mobileChrome} aria-hidden>
        <GrainOverlay opacity={0.04} />
        <div className={styles.edge} data-edge="top">
          <Divider seed={seed} spacing={0} color={borderColor} strokeWidth={INK_LIGHT} />
        </div>
        <div className={styles.edge} data-edge="bottom">
          <Divider seed={seed + 11} spacing={0} color={borderColor} strokeWidth={INK_LIGHT} />
        </div>
      </div>
      <div
        className={`${styles.desktopChrome} res-shape-stand-in`}
        aria-hidden
        // A plain card of the same paper and pen until measured.
        data-shape-pending={w > 0 && h > 0 ? undefined : ''}
        style={
          {
            '--shape-fill': interior,
            '--shape-ink': borderColor,
            '--shape-ink-width': `${INK}px`,
            '--shape-radius': `${R}px`,
          } as CSSProperties
        }
      >
        <HandDrawnBorder
          w={w}
          h={h}
          R={R}
          seed={seed}
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
        <ShapeGrain w={w} h={h} d={borderPath} opacity={0.3} frequency={0.85} seed={seed} />
        <HandDrawnBorder
          w={w}
          h={h}
          R={R}
          seed={seed}
          mag={mag}
          strokeColor={borderColor}
          segmentsH={[3, 4]}
          segmentsV={[5, 6]}
          curve={0.55}
          cornerJitter={0.7}
          cornerOffset={4}
        />
      </div>

      <div className={styles.body}>
        <h1 className={styles.title}>{title}</h1>
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
