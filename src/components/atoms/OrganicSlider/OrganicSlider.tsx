'use client';

import { useId, useMemo, useRef } from 'react';
import { wavyLine } from '@/lib/design/wavyPath';
import { wobCircle } from '@/lib/design/wobCircle';
import { useElementSize } from '@/lib/hooks/useElementSize';
import styles from './OrganicSlider.module.css';
import { INK } from '@/lib/design/strokes';

export interface OrganicSliderProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  seed?: number;
  ariaLabel?: string;
  disabled?: boolean;
}

const TRACK_SW = 7; // thickness of the hand-drawn bar stroke
const KNOB_R = 11;

/**
 * Organic range slider — a wobbly hand-drawn track, a terracotta wobbly fill up
 * to the value, and a slightly irregular hand-drawn knob. A transparent native
 * `<input type="range">` sits on top so dragging, keyboard and accessibility
 * all come for free; the SVG behind it is purely visual.
 */
export function OrganicSlider({
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  seed = 5,
  ariaLabel,
  disabled,
}: OrganicSliderProps) {
  const ref = useRef<HTMLDivElement>(null);
  const { w } = useElementSize(ref);
  const uid = useId().replace(/:/g, '');

  const H = KNOB_R * 2 + 4;
  const cy = H / 2;
  const pad = KNOB_R + 1;
  const usableW = Math.max(0, w - pad * 2);
  const frac = max > min ? (value - min) / (max - min) : 0;
  const thumbX = pad + frac * usableW;

  // Inset the bar so its round end-caps aren't clipped by the svg box.
  const capPad = TRACK_SW / 2 + 1;
  const barLen = Math.max(0, w - capPad * 2);

  // The bar is a single thick wavy stroke (a hand-drawn squiggle, not a flat
  // pill). The terracotta fill is the *same* wavy path clipped to the value, so
  // the filled portion rides exactly over the grey bar.
  const barPath = useMemo(
    () => (barLen > 0 ? wavyLine(barLen, seed, 2.6, Math.max(4, Math.round(barLen / 38))) : ''),
    [barLen, seed],
  );

  const knobPath = useMemo(
    () => wobCircle(KNOB_R, KNOB_R, KNOB_R, seed + 5, { segments: 9, mag: 0.7, cpJitter: 0.4 }),
    [seed],
  );

  return (
    <div ref={ref} className={styles.wrap} style={{ height: H }}>
      {w > 0 && (
        <svg
          className={`${styles.svg} res-shape-fade-in`}
          width={w}
          height={H}
          viewBox={`0 0 ${w} ${H}`}
          aria-hidden
        >
          <defs>
            {/* Local frame is translated by (capPad, cy); x=-capPad covers the
                visual left, width=thumbX puts the cut at the global thumb x. */}
            <clipPath id={`oslider-${uid}`}>
              <rect x={-capPad} y={-H} width={thumbX} height={H * 2} />
            </clipPath>
          </defs>
          <g transform={`translate(${capPad}, ${cy})`}>
            <path
              d={barPath}
              fill="none"
              stroke="oklch(84% 0.022 75)"
              strokeWidth={TRACK_SW}
              strokeLinecap="round"
            />
            <path
              d={barPath}
              fill="none"
              stroke="var(--color-terracotta)"
              strokeWidth={TRACK_SW}
              strokeLinecap="round"
              clipPath={`url(#oslider-${uid})`}
            />
          </g>
          <g transform={`translate(${thumbX - KNOB_R}, ${cy - KNOB_R})`}>
            <path
              d={knobPath}
              fill="var(--color-cream)"
              stroke="var(--color-terracotta)"
              strokeWidth={INK}
              strokeLinejoin="round"
            />
          </g>
        </svg>
      )}
      <input
        type="range"
        className={styles.input}
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        aria-label={ariaLabel}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}
