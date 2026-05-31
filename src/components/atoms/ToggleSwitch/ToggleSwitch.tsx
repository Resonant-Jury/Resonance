'use client';

import { useMemo } from 'react';
import { wobRect } from '@/lib/design/wobRect';

export interface ToggleSwitchProps {
  checked: boolean;
  onChange: () => void;
  ariaLabel?: string;
  /** Seed so the wobble of track + knob is deterministic but per-instance. */
  seed?: number;
}

const W = 50;
const H = 28;
const KNOB = 20;
const PAD = 4;

/**
 * Organic toggle — a wobbly hand-drawn pill track with a slightly irregular
 * knob that slides across. Pairs with `role="switch"` semantics. Use anywhere
 * a boolean preference is flipped (settings rows, opt-ins).
 */
export function ToggleSwitch({ checked, onChange, ariaLabel, seed = 9 }: ToggleSwitchProps) {
  const track = useMemo(
    () =>
      wobRect(W, H, H / 2, seed, 1.1, {
        curve: 1.5,
        segmentsH: [2, 3],
        segmentsV: [2, 2],
        cornerJitter: 0.6,
      }),
    [seed],
  );
  const knob = useMemo(
    () =>
      wobRect(KNOB, KNOB, KNOB / 2, seed + 5, 0.7, {
        curve: 1.7,
        segmentsH: [2, 2],
        segmentsV: [2, 2],
        cornerJitter: 0.5,
      }),
    [seed],
  );

  const knobX = checked ? W - KNOB - PAD : PAD;
  const knobY = (H - KNOB) / 2;

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      onClick={onChange}
      style={{
        border: 'none',
        background: 'none',
        padding: 0,
        cursor: 'pointer',
        lineHeight: 0,
        flexShrink: 0,
      }}
    >
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: 'block', overflow: 'visible' }}>
        <path
          d={track}
          fill={checked ? 'var(--color-terracotta)' : 'oklch(86% 0.02 75)'}
          stroke={checked ? 'oklch(45% 0.11 45)' : 'oklch(70% 0.03 70)'}
          strokeWidth={1.4}
          strokeLinejoin="round"
          style={{ transition: 'fill 160ms' }}
        />
        <g
          style={{
            transition: 'transform 200ms cubic-bezier(.2,.8,.3,1)',
            transform: `translate(${knobX}px, ${knobY}px)`,
          }}
        >
          <path
            d={knob}
            fill="var(--color-cream)"
            stroke="oklch(58% 0.03 60 / 0.4)"
            strokeWidth={1}
            strokeLinejoin="round"
          />
        </g>
      </svg>
    </button>
  );
}
