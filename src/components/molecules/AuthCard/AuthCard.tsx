'use client';

import { useMemo, useRef, type ReactNode } from 'react';
import { HandDrawnBorder } from '@/components/atoms/HandDrawnBorder/HandDrawnBorder';
import { ShapeGrain } from '@/components/atoms/ShapeGrain/ShapeGrain';
import { Divider } from '@/components/atoms/Divider/Divider';
import { useElementSize } from '@/lib/hooks/useElementSize';
import { useIsMobile } from '@/lib/hooks/useIsMobile';
import { wobRect } from '@/lib/design/wobRect';

export function AuthCard({ children, title }: { children: ReactNode; title: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const { w, h } = useElementSize(ref, 420, 480);
  const isMobile = useIsMobile(640);
  const seed = 313;
  const R = 22;
  const interior = 'oklch(97.5% 0.012 60)';

  const borderPath = useMemo(() => {
    if (!w || !h) return '';
    return wobRect(w, h, R, seed, Math.min(w, h) * 0.025, {
      segmentsH: [3, 4],
      segmentsV: [5, 6],
      curve: 0.55,
      cornerJitter: 0.7,
      cornerOffset: 4,
    });
  }, [w, h]);

  // On phones the card chrome (border + grain) is dropped in favor of a
  // borderless "section" framed by top/bottom wavy rules — mirroring how the
  // home feed cards degrade to dividers on small screens. (After all hooks, so
  // hook order stays stable across the breakpoint.)
  if (isMobile) {
    return (
      <section style={{ width: '100%' }}>
        <Divider seed={seed} spacing={0} />
        <div style={{ padding: '28px 4px' }}>
          <h1
            style={{
              fontFamily: 'var(--font-heading)',
              fontSize: 24,
              fontWeight: 700,
              marginBottom: 22,
              color: 'var(--color-text)',
            }}
          >
            {title}
          </h1>
          {children}
        </div>
        <Divider seed={seed + 11} spacing={0} />
      </section>
    );
  }

  return (
    <div
      ref={ref}
      style={{
        position: 'relative',
        width: '100%',
        maxWidth: 420,
        padding: '40px 36px',
      }}
    >
      <HandDrawnBorder
        w={w}
        h={h}
        R={R}
        seed={seed}
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
        strokeColor="oklch(52% 0.13 55)"
        segmentsH={[3, 4]}
        segmentsV={[5, 6]}
        curve={0.55}
        cornerJitter={0.7}
        cornerOffset={4}
      />

      <div style={{ position: 'relative', zIndex: 1 }}>
        <h1
          style={{
            fontFamily: 'var(--font-heading)',
            fontSize: 26,
            fontWeight: 700,
            marginBottom: 24,
            color: 'var(--color-text)',
          }}
        >
          {title}
        </h1>
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
