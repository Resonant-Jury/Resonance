'use client';

import { ReactNode, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { wobRect } from '@/lib/design/wobRect';
import { makePrng } from '@/lib/design/prng';
import styles from './SegmentedActionBar.module.css';

export interface SegmentSpec {
  key: string;
  icon?: ReactNode;
  label: ReactNode;
  /** Filled background for this segment (e.g. terracotta for the primary action). */
  fill?: string;
  /** Text + icon color. */
  textColor?: string;
  /** Subtle wash drawn on hover (defaults to a translucent dark veil). */
  hoverOverlay?: string;
  onClick?: () => void;
  ariaLabel?: string;
}

export interface SegmentedActionBarProps {
  segments: SegmentSpec[];
  seed?: number;
  /** Outer container fill / stroke / divider colors. */
  fill?: string;
  stroke?: string;
  divider?: string;
}

interface Bound {
  left: number;
  width: number;
}

// A gently wobbly vertical boundary, returned as a point list so the fill edge
// and the stroked divider share *identical* geometry (no bezier mismatch).
// Runs from -pad to h+pad so the fill polygons overshoot the bar and the outer
// clip trims them flush to the wobbly border (no slivers along top/bottom).
function boundaryPoints(
  x: number,
  h: number,
  seed: number,
  amp: number,
  pad: number
): [number, number][] {
  // Just a couple of interior anchors across the visible height → a gentle
  // 1–2 turn wave (not a busy zig-zag), with straight stubs into the overshoot.
  const steps = 3;
  const rnd = makePrng(seed);
  const f = (n: number): number => +n.toFixed(2);
  const pts: [number, number][] = [[f(x), -pad]];
  for (let k = 0; k <= steps; k++) {
    const y = (k / steps) * h;
    const off = k === 0 || k === steps ? 0 : (rnd() - 0.5) * 2 * amp;
    pts.push([f(x + off), f(y)]);
  }
  pts.push([f(x), f(h + pad)]);
  return pts;
}

const polyline = (pts: [number, number][]) =>
  `M ${pts[0][0]},${pts[0][1]} ` + pts.slice(1).map((p) => `L ${p[0]},${p[1]}`).join(' ');

/**
 * Three (or more) actions fused into one organic bar, split by hand-drawn
 * wavy dividers. Each segment keeps its own fill colour and icon — a compact
 * alternative to a row of separate buttons.
 */
export function SegmentedActionBar({
  segments,
  seed = 71,
  fill = 'oklch(97% 0.016 70 / 0.72)',
  stroke = 'color-mix(in oklch, var(--color-terracotta), black 12%)',
  // match the divider to the outer border so the bar reads as one drawn shape
  divider = 'color-mix(in oklch, var(--color-terracotta), black 12%)',
}: SegmentedActionBarProps) {
  const barRef = useRef<HTMLDivElement>(null);
  const segRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [{ w, h }, setDims] = useState({ w: 0, h: 0 });
  const [bounds, setBounds] = useState<Bound[]>([]);
  const [hovered, setHovered] = useState<number | null>(null);

  const recompute = useCallback(() => {
    const bar = barRef.current;
    if (!bar) return;
    setDims({ w: bar.offsetWidth, h: bar.offsetHeight });
    setBounds(
      segRefs.current.map((el) => ({ left: el?.offsetLeft ?? 0, width: el?.offsetWidth ?? 0 }))
    );
  }, []);

  useLayoutEffect(() => {
    recompute();
    const ro = new ResizeObserver(recompute);
    if (barRef.current) ro.observe(barRef.current);
    segRefs.current.forEach((el) => el && ro.observe(el));
    return () => ro.disconnect();
  }, [recompute, segments.length]);

  // Re-measure once webfonts settle (CJK metrics shift segment widths).
  useEffect(() => {
    if (typeof document === 'undefined' || !document.fonts) return;
    document.fonts.ready.then(recompute).catch(() => {});
  }, [recompute]);

  const R = 16; // md radius for controls consistency
  // Overshoot the bar by this much so fills reach past the border, then get
  // clipped back to it — covers the outward wobble of the cap and top/bottom.
  const pad = h > 0 ? Math.max(12, h * 0.3) : 0;
  const outerPath = useMemo(() => {
    if (!w || !h) return '';
    return wobRect(w, h, R, seed, Math.min(w, h) * 0.05, {
      segmentsH: [7, 9],
      segmentsV: [2, 3],
      curve: 1.2,
      cornerJitter: 1.2,
      cornerOffset: h * 0.04,
    });
  }, [w, h, R, seed]);

  // Per-internal-boundary wavy point lists, shared by fills + divider strokes.
  const boundaries = useMemo(() => {
    if (!w || !h || bounds.length !== segments.length) return [];
    return bounds.slice(1).map((b, i) => boundaryPoints(b.left, h, seed + i * 37 + 11, 1.6, pad));
  }, [w, h, bounds, segments.length, seed, pad]);

  return (
    <div ref={barRef} className={styles.bar} role="group">
      {w > 0 && h > 0 && (
        <svg
          aria-hidden="true"
          width={w}
          height={h}
          viewBox={`0 0 ${w} ${h}`}
          className={styles.backdrop}
        >
          <defs>
            <clipPath id={`sab-clip-${seed}`}>
              <path d={outerPath} />
            </clipPath>
          </defs>
          <g clipPath={`url(#sab-clip-${seed})`}>
            {/* base fill */}
            <path d={outerPath} fill={fill} />
            {/* per-segment colour fills */}
            {segments.map((s, i) =>
              s.fill && s.fill !== 'transparent' && boundaries.length === segments.length - 1 ? (
                <path key={s.key} d={segmentRegion(i, segments.length, boundaries, w, h, pad)} fill={s.fill} />
              ) : null
            )}
            {/* hover wash */}
            {hovered != null && boundaries.length === segments.length - 1 && (
              <path
                d={segmentRegion(hovered, segments.length, boundaries, w, h, pad)}
                fill={segments[hovered].hoverOverlay ?? 'oklch(0% 0 0 / 0.07)'}
              />
            )}
          </g>
          {/* wavy dividers */}
          {boundaries.map((pts, i) => (
            <path
              key={i}
              d={polyline(pts)}
              fill="none"
              stroke={divider}
              strokeWidth={2}
              strokeLinecap="round"
              clipPath={`url(#sab-clip-${seed})`}
            />
          ))}
          {/* outer stroke */}
          <path d={outerPath} fill="none" stroke={stroke} strokeWidth={2} strokeLinejoin="round" />
        </svg>
      )}

      {segments.map((s, i) => (
        <button
          key={s.key}
          ref={(el) => {
            segRefs.current[i] = el;
          }}
          type="button"
          onClick={s.onClick}
          onMouseEnter={() => setHovered(i)}
          onMouseLeave={() => setHovered((h) => (h === i ? null : h))}
          onFocus={() => setHovered(i)}
          onBlur={() => setHovered((h) => (h === i ? null : h))}
          aria-label={s.ariaLabel}
          className={styles.seg}
          style={{ color: s.textColor ?? 'var(--color-terracotta)' }}
        >
          {s.icon}
          <span>{s.label}</span>
        </button>
      ))}
    </div>
  );
}

// Closed polygon for a segment, using shared wavy boundary points so the fill
// edge lines up exactly under the stroked divider.
function segmentRegion(
  i: number,
  count: number,
  boundaries: [number, number][][],
  w: number,
  h: number,
  pad: number
): string {
  // First/last segments use straight outer edges pushed beyond the bar by `pad`;
  // the outer clip trims them back to the wobbly border. Top/bottom likewise sit
  // at -pad / h+pad so the fill always reaches past the border's outward wobble.
  const leftEdge =
    i === 0 ? ([[-pad, -pad], [-pad, h + pad]] as [number, number][]) : boundaries[i - 1];
  const rightEdge =
    i === count - 1
      ? ([[w + pad, -pad], [w + pad, h + pad]] as [number, number][])
      : boundaries[i];
  const down = (pts: [number, number][]) => pts.map((p) => `L ${p[0]},${p[1]}`).join(' ');
  const upPts = [...rightEdge].reverse();
  // left edge top→bottom, across to right edge bottom→top, close.
  return (
    `M ${leftEdge[0][0]},${leftEdge[0][1]} ` +
    down(leftEdge.slice(1)) +
    ` L ${upPts[0][0]},${upPts[0][1]} ` +
    down(upPts.slice(1)) +
    ' Z'
  );
}
