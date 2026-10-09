'use client';

import { MouseEvent, ReactNode, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { wobRect } from '@/lib/design/wobRect';
import { makePrng } from '@/lib/design/prng';
import { INK } from '@/lib/design/strokes';
import { ShapeGrain } from '@/components/atoms/ShapeGrain/ShapeGrain';
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
  /**
   * This segment drops its visible label — its icon is the affordance, the
   * words stay for a screen reader — once every label no longer fits the
   * bar's container in one row (the card page's Bookmark beside Resonate and
   * Send a note on a narrow phone).
   */
  collapsible?: boolean;
}

export interface SegmentedActionBarProps {
  segments: SegmentSpec[];
  seed?: number;
  /** The bar's own face, under every segment that brings no fill of its own. */
  fill?: string;
  /** A pen line round the bar — none by default: like OrganicButton, the bar is a filled shape. */
  stroke?: string | null;
  /** The wavy seam between segments: by default a cut in the paper, not an ink line. */
  divider?: string;
}

interface Bound {
  left: number;
  width: number;
}

/**
 * A segment's width with every label shown: its padding, its icon, its label
 * at its own width (read even while the label is visually hidden: an element
 * that clips its overflow still reports its content's width) and the gap
 * between them.
 */
function naturalWidth(seg: HTMLElement): number {
  const cs = getComputedStyle(seg);
  const px = (v: string) => parseFloat(v) || 0;
  const kids = Array.from(seg.children) as HTMLElement[];
  const content = kids.reduce(
    (sum, k) => sum + (k.hasAttribute('data-label') ? k.scrollWidth : k.getBoundingClientRect().width),
    0,
  );
  return px(cs.paddingLeft) + px(cs.paddingRight) + content + px(cs.columnGap) * Math.max(0, kids.length - 1);
}

// A gently wobbly vertical boundary, returned as a point list so the fill edge
// and the stroked divider share *identical* geometry (no bezier mismatch).
// Runs from -pad to h+pad so the fill polygons overshoot the bar and the outer
// clip trims them flush to the wobbly border (no slivers along top/bottom).
// Exported for segmented-bar lookalikes (e.g. the CardEditor tag input).
export function boundaryPoints(
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

export const polyline = (pts: [number, number][]) =>
  `M ${pts[0][0]},${pts[0][1]} ` + pts.slice(1).map((p) => `L ${p[0]},${p[1]}`).join(' ');

/**
 * Three (or more) actions fused into one organic bar, split by hand-drawn
 * wavy seams. Each segment keeps its own fill colour and icon — a compact
 * alternative to a row of separate buttons. Its segments are buttons, so
 * like every button it is a filled shape with no pen line (an outline marks a
 * floating surface, a container or an input): the bar wears the secondary
 * (tonal) face, a segment may bring its own (the verb's `--button-fill`), and
 * the seams between them are cut in the paper's colour.
 */
export function SegmentedActionBar({
  segments,
  seed = 71,
  fill = 'var(--button-tonal)',
  stroke = null,
  divider = 'var(--color-cream)',
}: SegmentedActionBarProps) {
  const barRef = useRef<HTMLDivElement>(null);
  const segRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [{ w, h }, setDims] = useState({ w: 0, h: 0 });
  const [bounds, setBounds] = useState<Bound[]>([]);
  // Index currently hovered (null = none). Each segment owns its own reveal
  // circle so moving between segments re-grows the wash from the new pointer,
  // exactly like hovering one OrganicButton then another.
  const [hovered, setHovered] = useState<number | null>(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const maskId = useId().replace(/:/g, '');
  // Too narrow for every label: the collapsible segments show their icon alone.
  const [tight, setTight] = useState(false);
  const collapsible = segments.some((s) => s.collapsible);

  const fit = useCallback(() => {
    const bar = barRef.current;
    const box = bar?.parentElement;
    if (!bar || !box || !collapsible) return;
    // The room is the container's (the bar spans it on a phone), never the
    // bar's own width, which shrinks with the words it hides.
    const cs = getComputedStyle(box);
    const room = box.clientWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0);
    const need = segRefs.current.reduce((sum, el) => sum + (el ? naturalWidth(el) : 0), 0);
    const next = room > 0 && need > room + 0.5;
    setTight((cur) => (cur === next ? cur : next));
  }, [collapsible]);

  const recompute = useCallback(() => {
    const bar = barRef.current;
    if (!bar) return;
    setDims({ w: bar.offsetWidth, h: bar.offsetHeight });
    setBounds(
      segRefs.current.map((el) => ({ left: el?.offsetLeft ?? 0, width: el?.offsetWidth ?? 0 }))
    );
    fit();
  }, [fit]);

  // A label changed under a hidden one (Bookmark ⇄ Remove bookmark) resizes
  // nothing the observer sees: weigh the room again after every render.
  useLayoutEffect(() => fit());

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

  // Radial-reveal hover (mirrors OrganicButton): track the pointer relative to
  // the bar and grow a circle out to the far corner.
  const recordPointer = (e: MouseEvent<HTMLButtonElement>) => {
    const r = barRef.current?.getBoundingClientRect();
    if (!r) return;
    setPos({ x: e.clientX - r.left, y: e.clientY - r.top });
  };
  const hoverMaxR = Math.hypot(Math.max(pos.x, w - pos.x), Math.max(pos.y, h - pos.y)) + 4;

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
            {/* One pointer-anchored reveal circle per segment — the hovered one
                grows to hoverMaxR, the rest sit at 0, so each transitions in/out
                independently (no jump when sliding between segments). */}
            {segments.map((s, i) => (
              <mask
                key={s.key}
                id={`sab-hover-${maskId}-${i}`}
                maskUnits="userSpaceOnUse"
                x={-w}
                y={-h}
                width={w * 3}
                height={h * 3}
              >
                <circle
                  cx={pos.x}
                  cy={pos.y}
                  r={hovered === i ? hoverMaxR : 0}
                  fill="white"
                  style={{ transition: 'r 340ms linear' }}
                />
              </mask>
            ))}
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
            {/* hover wash — each segment region revealed through its own circle */}
            {boundaries.length === segments.length - 1 &&
              segments.map((s, i) => (
                <g key={s.key} mask={`url(#sab-hover-${maskId}-${i})`}>
                  <path
                    d={segmentRegion(i, segments.length, boundaries, w, h, pad)}
                    fill={
                      s.hoverOverlay ??
                      'color-mix(in oklch, var(--color-terracotta) 13%, transparent)'
                    }
                  />
                </g>
              ))}
          </g>
          {/* wavy dividers */}
          {boundaries.map((pts, i) => (
            <path
              key={i}
              d={polyline(pts)}
              fill="none"
              stroke={divider}
              strokeWidth={INK}
              strokeLinecap="round"
              clipPath={`url(#sab-clip-${seed})`}
            />
          ))}
          {/* an outer pen line only when a caller asks for one — the house pen (INK) */}
          {stroke && <path d={outerPath} fill="none" stroke={stroke} strokeWidth={INK} strokeLinejoin="round" />}
        </svg>
      )}
      {/* The buttons' own grain over the whole face, so the bar and a lone OrganicButton feel cut from the same paper. */}
      <ShapeGrain w={w} h={h} d={outerPath} seed={seed} opacity={0.38} frequency={1.1} />

      {segments.map((s, i) => (
        <button
          key={s.key}
          ref={(el) => {
            segRefs.current[i] = el;
          }}
          type="button"
          onClick={s.onClick}
          onMouseEnter={(e) => { recordPointer(e); setHovered(i); }}
          onMouseMove={recordPointer}
          onMouseLeave={() => setHovered((cur) => (cur === i ? null : cur))}
          onFocus={() => {
            const b = bounds[i];
            if (b) setPos({ x: b.left + b.width / 2, y: h / 2 });
            setHovered(i);
          }}
          onBlur={() => setHovered((cur) => (cur === i ? null : cur))}
          aria-label={s.ariaLabel}
          className={styles.seg}
          data-icon-only={(s.collapsible && tight) || undefined}
          style={{ color: s.textColor ?? 'var(--button-on-tonal)' }}
        >
          {s.icon}
          <span data-label className={styles.label}>
            {s.label}
          </span>
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
