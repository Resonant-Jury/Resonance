'use client';

import { useMemo } from 'react';
import { wobRect, type WobRectOpts } from '@/lib/design/wobRect';
import { wobCircle, type WobCircleOpts } from '@/lib/design/wobCircle';
import { INK_LIGHT } from '@/lib/design/strokes';
import { ShapeGrain } from '../ShapeGrain/ShapeGrain';
import styles from './ToggleSwitch.module.css';

export interface ToggleSwitchProps {
  checked: boolean;
  onChange: () => void;
  ariaLabel?: string;
  /** The id of the text that explains the switch (a hint under its label). */
  describedBy?: string;
  /** Not to be flipped now (e.g. its value is still loading): faded, and clicks do nothing. */
  disabled?: boolean;
  /** Seed so the wobble of track + knob is deterministic but per-instance. */
  seed?: number;
}

/**
 * The switch's geometry — the apps' OrganicToggle (iOS DesignSystem Atoms.swift,
 * Android core/design Dialogs.kt) draws the same numbers through their wobRect /
 * wobCircle ports, so change all three together.
 *
 * The track is a pill bowed by hand: a radius just under half the height, so
 * each end may come out a little rounder or flatter than the other, and one
 * seeded turn in each long edge (`curve` sets how far it bows, up to 2.5px, in or
 * out). The pen goes round it twice, the second pass (seed + 1) lighter. The
 * knob is a lumpier circle than a button's dot (six arcs, ±1px).
 */
export const TOGGLE = {
  w: 50,
  h: 28,
  radius: 12.5,
  mag: 2.4,
  track: { curve: 2.8, segmentsH: 2, segmentsV: 1, cornerJitter: 2, cornerOffset: 1.4 } satisfies WobRectOpts,
  retraceSeed: 1,
  retraceOpacity: 0.4,
  knob: 20,
  pad: 4,
  knobSeed: 5,
  knobOpts: { segments: 6, mag: 1, cpJitter: 0.5 } satisfies WobCircleOpts,
} as const;

/** The track, its second pen pass and the knob (drawn at 0,0) for one seed. */
export function toggleShapes(seed: number) {
  const { w, h, radius, mag, track, retraceSeed, knob, knobSeed, knobOpts } = TOGGLE;
  const r = knob / 2;
  return {
    track: wobRect(w, h, radius, seed, mag, track),
    retrace: wobRect(w, h, radius, seed + retraceSeed, mag, track),
    knob: wobCircle(r, r, r, seed + knobSeed, knobOpts),
  };
}

/**
 * Organic toggle — a hand-drawn pill in a chalky double pen line with a lumpy
 * knob that slides across. Pairs with `role="switch"` semantics. Use anywhere
 * a boolean preference is flipped (settings rows, opt-ins).
 */
export function ToggleSwitch({ checked, onChange, ariaLabel, describedBy, disabled = false, seed = 9 }: ToggleSwitchProps) {
  const shapes = useMemo(() => toggleShapes(seed), [seed]);
  const { w, h, knob, pad } = TOGGLE;
  const knobX = checked ? w - knob - pad : pad;
  const knobY = (h - knob) / 2;
  const viewBox = `0 0 ${w} ${h}`;

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      aria-describedby={describedBy}
      disabled={disabled}
      onClick={onChange}
      className={styles.switch}
    >
      <svg aria-hidden="true" className={styles.layer} width={w} height={h} viewBox={viewBox}>
        <path className={styles.fill} d={shapes.track} />
      </svg>
      {/* The buttons' grain on the well, so the switch sits in their family. */}
      <ShapeGrain w={w} h={h} d={shapes.track} seed={3} opacity={0.38} frequency={1.1} />
      <svg aria-hidden="true" className={styles.layer} width={w} height={h} viewBox={viewBox}>
        <path className={styles.retrace} d={shapes.retrace} strokeWidth={INK_LIGHT} strokeOpacity={TOGGLE.retraceOpacity} />
        <path className={styles.pen} d={shapes.track} strokeWidth={INK_LIGHT} />
        <g className={styles.knob} style={{ transform: `translate(${knobX}px, ${knobY}px)` }}>
          <path className={styles.knobFace} d={shapes.knob} strokeWidth={INK_LIGHT} />
        </g>
      </svg>
    </button>
  );
}
