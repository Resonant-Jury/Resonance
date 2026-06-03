'use client';

import { useId, useMemo, useRef } from 'react';
import { wobRect } from '@/lib/design/wobRect';
import { wobCircle } from '@/lib/design/wobCircle';
import { useElementSize } from '@/lib/hooks/useElementSize';
import styles from './OrganicSlider.module.css';

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

const TRACK_H = 8;
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

  // The track + its terracotta fill share one wobble (the fill is the same path
  // clipped to the value), so the filled portion sits exactly over the track.
  const trackPath = useMemo(() => {
    if (!w) return '';
    return wobRect(w, TRACK_H, TRACK_H / 2, seed, 1, {
      curve: 1.4,
      segmentsH: [3, 5],
      segmentsV: 1,
      cornerJitter: 0.5,
    });
  }, [w, seed]);

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
            <clipPath id={`oslider-${uid}`}>
              <rect x={0} y={0} width={thumbX} height={H} />
            </clipPath>
          </defs>
          <g transform={`translate(0, ${cy - TRACK_H / 2})`}>
            <path d={trackPath} fill="oklch(88% 0.02 75)" stroke="oklch(72% 0.03 70)" strokeWidth={1.2} />
            <path
              d={trackPath}
              fill="var(--color-terracotta)"
              stroke="oklch(45% 0.11 45)"
              strokeWidth={1.2}
              clipPath={`url(#oslider-${uid})`}
            />
          </g>
          <g transform={`translate(${thumbX - KNOB_R}, ${cy - KNOB_R})`}>
            <path
              d={knobPath}
              fill="var(--color-cream)"
              stroke="var(--color-terracotta)"
              strokeWidth={2}
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
