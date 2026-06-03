'use client';

import { CSSProperties, MouseEvent, ReactNode, useId, useMemo, useRef, useState } from 'react';
import { HandDrawnBorder } from '../HandDrawnBorder/HandDrawnBorder';
import { ShapeGrain } from '../ShapeGrain/ShapeGrain';
import { useElementSize } from '@/lib/hooks/useElementSize';
import { wobRect } from '@/lib/design/wobRect';
import styles from './OrganicButton.module.css';

export type OrganicButtonVariant = 'primary' | 'secondary' | 'ghost' | 'outline' | 'ctaLight' | 'ctaGhost';

const BTN_VARIANTS: Record<OrganicButtonVariant, {
  fill: string; text: string; stroke: string; stroke2: string; hoverOverlay: string;
}> = {
  primary:   { fill: 'var(--color-terracotta)', text: 'var(--color-cream)',      stroke: 'color-mix(in oklch, var(--color-terracotta), black 35%)', stroke2: 'color-mix(in oklch, var(--color-terracotta), black 50%)', hoverOverlay: 'oklch(0% 0 0 / 0.14)' },
  secondary: { fill: 'var(--color-lavender)',   text: 'var(--color-cream)',      stroke: 'oklch(50% 0.10 290)', stroke2: 'oklch(40% 0.09 290)', hoverOverlay: 'oklch(0% 0 0 / 0.12)' },
  ghost:     { fill: 'transparent',             text: 'var(--color-text)',       stroke: 'oklch(44% 0.04 70)', stroke2: 'oklch(34% 0.04 70)', hoverOverlay: 'color-mix(in oklch, var(--color-terracotta) 14%, transparent)' },
  outline:   { fill: 'transparent',             text: 'var(--color-terracotta)', stroke: 'color-mix(in oklch, var(--color-terracotta), black 15%)', stroke2: 'color-mix(in oklch, var(--color-terracotta), black 35%)', hoverOverlay: 'color-mix(in oklch, var(--color-terracotta) 14%, transparent)' },
  ctaLight:  { fill: 'var(--color-cream)',      text: 'var(--color-terracotta)', stroke: 'oklch(80% 0.04 75)', stroke2: 'oklch(70% 0.04 75)', hoverOverlay: 'oklch(0% 0 0 / 0.08)' },
  ctaGhost:  { fill: 'transparent',             text: 'var(--color-cream)',      stroke: 'oklch(88% 0.02 75 / 0.65)', stroke2: 'oklch(80% 0.02 75 / 0.38)', hoverOverlay: 'oklch(96% 0.015 75 / 0.18)' },
};

const BTN_SEEDS: Record<OrganicButtonVariant, number> = {
  primary: 3, secondary: 201, ghost: 401, outline: 601, ctaLight: 801, ctaGhost: 1001,
};

export interface OrganicButtonProps {
  children: ReactNode;
  variant?: OrganicButtonVariant;
  onClick?: (e: MouseEvent<HTMLButtonElement>) => void;
  style?: CSSProperties & { fillColor?: string };
}

export function OrganicButton({ children, variant = 'primary', onClick, style = {} }: OrganicButtonProps) {
  const [hovered, setHovered] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const ref = useRef<HTMLButtonElement>(null);
  const { w, h } = useElementSize(ref, 160, 50);
  const v = BTN_VARIANTS[variant] || BTN_VARIANTS.primary;
  const seed = BTN_SEEDS[variant] ?? 3;
  const R = 16; // md radius for controls consistency
  const mag = Math.min(w, h) * 0.04;
  const maskId = useId().replace(/:/g, '');

  // Buttons are small — keep the wobble gentle (few turns, low bow) so the
  // outline reads as a calm pill rather than a busy blob.
  const segH: [number, number] = [2, 3];
  const btnCurve = 1.3;
  const btnJitter = 1.3;

  const recordPointer = (e: MouseEvent<HTMLButtonElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setPos({ x: e.clientX - r.left, y: e.clientY - r.top });
  };
  const maxR = Math.hypot(Math.max(pos.x, w - pos.x), Math.max(pos.y, h - pos.y)) + 4;

  const cornerOff = Math.min(w, h) * 0.03;
  const overlayPath = useMemo(() => {
    if (!w || !h) return '';
    return wobRect(w, h, R, seed, mag, {
      segmentsH: segH,
      segmentsV: 1,
      curve: btnCurve,
      cornerJitter: btnJitter,
      cornerOffset: cornerOff,
    });
  }, [w, h, R, seed, mag, cornerOff]);

  const { fillColor: _fill, ...restStyle } = style;

  return (
    <button
      ref={ref}
      onClick={onClick}
      onMouseEnter={(e) => { recordPointer(e); setHovered(true); }}
      onMouseLeave={(e) => { recordPointer(e); setHovered(false); }}
      className={styles.btn}
      style={{ color: v.text, ...restStyle }}
    >
      <HandDrawnBorder
        w={w} h={h} R={R} seed={seed} mag={mag}
        fillColor={style.fillColor || v.fill}
        strokeColor="transparent"
        strokeWidth={0}
        segmentsH={segH} segmentsV={1}
        curve={btnCurve} cornerJitter={btnJitter} cornerOffset={cornerOff}
      />
      {v.fill !== 'transparent' && (
        <ShapeGrain w={w} h={h} d={overlayPath} opacity={0.38} frequency={1.1} seed={seed} />
      )}
      {w > 0 && h > 0 && (
        <svg
          aria-hidden="true"
          width={w} height={h}
          viewBox={`0 0 ${w} ${h}`}
          style={{ position: 'absolute', top: 0, left: 0, overflow: 'visible', pointerEvents: 'none', zIndex: 0 }}
        >
          <defs>
            <mask
              id={`btn-${maskId}`}
              maskUnits="userSpaceOnUse"
              x={-w} y={-h} width={w * 3} height={h * 3}
            >
              <circle
                cx={pos.x} cy={pos.y}
                r={hovered ? maxR : 0}
                fill="white"
                style={{ transition: 'r 340ms linear' }}
              />
            </mask>
          </defs>
          <g mask={`url(#btn-${maskId})`}>
            <path d={overlayPath} fill={v.hoverOverlay || 'oklch(0% 0 0 / 0.12)'} />
          </g>
        </svg>
      )}
      <HandDrawnBorder
        w={w} h={h} R={R} seed={seed} mag={mag}
        strokeColor={v.stroke}
        segmentsH={segH} segmentsV={1}
        curve={btnCurve} cornerJitter={btnJitter} cornerOffset={cornerOff}
      />
      <span className={styles.label}>{children}</span>
    </button>
  );
}
