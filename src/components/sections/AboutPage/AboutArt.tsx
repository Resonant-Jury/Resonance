'use client';

import { useMemo, useRef, type CSSProperties, type ReactNode } from 'react';
import { HandDrawnBorder } from '@/components/atoms/HandDrawnBorder/HandDrawnBorder';
import { useElementSize } from '@/lib/hooks/useElementSize';
import { cycleArc } from '@/lib/design/beliefCycle';
import { wobCircle } from '@/lib/design/wobCircle';
import { wobRect } from '@/lib/design/wobRect';
import { wavyLine } from '@/lib/design/wavyPath';
import { makePrng } from '@/lib/design/prng';
import { INK, INK_LIGHT, INK_STRONG } from '@/lib/design/strokes';

const PEN = 'oklch(36% 0.06 60 / 0.55)';
const PEN_SOFT = 'oklch(36% 0.06 60 / 0.35)';

/** Coordinates rounded, so the server's attributes and the browser's agree to the last digit. */
const f = (n: number) => +n.toFixed(2);

export type Belief = 'resonance' | 'depth' | 'insight';

/** Each belief's colour: the About page's stylesheet defines them, so the diagram and the motifs agree. */
export const BELIEF_FILL: Record<Belief, string> = {
  resonance: 'var(--about-resonance)',
  depth: 'var(--about-depth)',
  insight: 'var(--about-insight)',
};

/** Where each arrow runs round the ring (degrees, clockwise from three o'clock): 共振 → 立體 → 體悟 → 共振. */
const ARCS: { belief: Belief; from: number; to: number; seed: number }[] = [
  { belief: 'resonance', from: 165, to: 275, seed: 11 },
  { belief: 'depth', from: 285, to: 395, seed: 23 },
  { belief: 'insight', from: 45, to: 155, seed: 37 },
];

export interface BeliefCycleProps {
  labels: Record<Belief, string>;
  center: string;
  ariaLabel: string;
  /** Latin names are longer than the two characters of 共振, so they're set smaller. */
  compactLabels?: boolean;
}

/** The three beliefs as one cycle round a story: the slide's wheel, drawn by hand. */
export function BeliefCycle({ labels, center, ariaLabel, compactLabels = false }: BeliefCycleProps) {
  const arcs = useMemo(() => ARCS.map((a) => ({ ...a, ...cycleArc(200, 200, 98, 178, a.from, a.to, a.seed) })), []);
  const hub = useMemo(() => wobCircle(200, 200, 62, 71, { segments: 10, mag: 1.3 }), []);
  const ring = useMemo(() => wobCircle(200, 200, 74, 89, { segments: 10, mag: 1.6 }), []);
  return (
    <svg viewBox="0 0 400 400" role="img" aria-label={ariaLabel} style={{ display: 'block', width: '100%', height: 'auto' }}>
      {arcs.map((a) => (
        <path key={a.belief} d={a.d} fill={BELIEF_FILL[a.belief]} stroke={PEN} strokeWidth={INK} strokeLinejoin="round" />
      ))}
      <path d={ring} fill="none" stroke={PEN_SOFT} strokeWidth={INK_LIGHT} strokeDasharray="2 6" strokeLinecap="round" />
      <path d={hub} fill="var(--color-card-bg)" stroke={PEN} strokeWidth={INK} />
      <text
        x={200}
        y={200}
        textAnchor="middle"
        dominantBaseline="central"
        fill="var(--color-terracotta)"
        style={{ font: `700 ${compactLabels ? 22 : 26}px var(--font-heading)` }}
      >
        {center}
      </text>
      {arcs.map((a) => (
        <text
          key={a.belief}
          x={a.label[0]}
          y={a.label[1]}
          textAnchor="middle"
          dominantBaseline="central"
          fill="var(--color-text)"
          style={{ font: `800 ${compactLabels ? 19 : 30}px var(--font-heading)`, letterSpacing: compactLabels ? 0 : '0.04em' }}
        >
          {labels[a.belief]}
        </text>
      ))}
    </svg>
  );
}

/** Ripples round a point: a filled dot inside fading rings. */
function Ripple({ cx, cy, fill, seed }: { cx: number; cy: number; fill: string; seed: number }) {
  return (
    <g>
      <path d={wobCircle(cx, cy, 12, seed + 2, { mag: 0.7 })} fill="none" stroke={PEN_SOFT} strokeWidth={INK_LIGHT} />
      <path d={wobCircle(cx, cy, 8, seed + 1, { mag: 0.5 })} fill="none" stroke={PEN} strokeWidth={INK_LIGHT} />
      <path d={wobCircle(cx, cy, 4.2, seed, { mag: 0.3 })} fill={fill} stroke={PEN} strokeWidth={INK_LIGHT} />
    </g>
  );
}

/** The geodesic ball of 立體: a sphere's network of nodes, many faces making one whole. */
function depthBall() {
  const rnd = makePrng(53);
  const nodes: [number, number][] = [[32, 32]];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.3;
    nodes.push([f(32 + Math.cos(a) * 12 + (rnd() - 0.5) * 2), f(32 + Math.sin(a) * 11 + (rnd() - 0.5) * 2)]);
  }
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    nodes.push([f(32 + Math.cos(a) * 23), f(32 + Math.sin(a) * 23)]);
  }
  const edges: [number, number][] = [];
  for (let i = 1; i <= 6; i++) {
    edges.push([0, i], [i, (i % 6) + 1]);
  }
  for (let j = 0; j < 9; j++) {
    const outer = 7 + j;
    edges.push([outer, 7 + ((j + 1) % 9)]);
    // Each outer node ties to the nearest inner one.
    let inner = 1;
    for (let i = 2; i <= 6; i++) {
      if (Math.hypot(nodes[i][0] - nodes[outer][0], nodes[i][1] - nodes[outer][1]) < Math.hypot(nodes[inner][0] - nodes[outer][0], nodes[inner][1] - nodes[outer][1])) inner = i;
    }
    edges.push([outer, inner]);
  }
  return { nodes, edges };
}

/** A belief's small emblem, after the slide's: ripples meeting, a geodesic ball, a burst of light. */
export function BeliefMotif({ belief, size = 56 }: { belief: Belief; size?: number }) {
  const art = useMemo(() => {
    if (belief === 'resonance') {
      return (
        <>
          <path d="M 20,32 Q 32,30.6 44,32" fill="none" stroke={PEN} strokeWidth={INK_LIGHT} strokeLinecap="round" />
          <Ripple cx={14} cy={32} fill="var(--about-resonance)" seed={5} />
          <Ripple cx={50} cy={32} fill="var(--about-insight)" seed={9} />
        </>
      );
    }
    if (belief === 'depth') {
      const { nodes, edges } = depthBall();
      return (
        <>
          <path d={wobCircle(32, 32, 23, 61, { mag: 0.8 })} fill="var(--about-depth)" fillOpacity={0.35} stroke={PEN} strokeWidth={INK_LIGHT} />
          {edges.map(([a, b]) => (
            <line key={`${a}-${b}`} x1={nodes[a][0]} y1={nodes[a][1]} x2={nodes[b][0]} y2={nodes[b][1]} stroke={PEN} strokeWidth={0.9} />
          ))}
          {nodes.map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r={i % 3 === 0 ? 2.4 : 1.8} fill={i % 2 ? 'var(--about-insight)' : 'var(--about-resonance)'} stroke={PEN} strokeWidth={0.6} />
          ))}
        </>
      );
    }
    const rnd = makePrng(77);
    const rays = Array.from({ length: 22 }, (_, i) => {
      const a = (i / 22) * Math.PI * 2 + (rnd() - 0.5) * 0.12;
      const r1 = 6 + rnd() * 2;
      const r2 = 17 + rnd() * 11;
      return [f(32 + Math.cos(a) * r1), f(32 + Math.sin(a) * r1), f(32 + Math.cos(a) * r2), f(32 + Math.sin(a) * r2)];
    });
    return (
      <>
        {rays.map(([x1, y1, x2, y2], i) => (
          <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={i % 3 ? PEN : 'var(--color-terracotta)'} strokeWidth={0.9} strokeLinecap="round" />
        ))}
        <path d={wobCircle(32, 32, 3.6, 81, { mag: 0.3 })} fill="var(--color-terracotta)" stroke={PEN} strokeWidth={INK_LIGHT} />
      </>
    );
  }, [belief]);
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden="true" style={{ flexShrink: 0, overflow: 'visible' }}>
      {art}
    </svg>
  );
}

/** One story card as a sketch: paper, a cover, and a few lines of handwriting. */
function SketchCard({ x, y, rotate, seed, cover }: { x: number; y: number; rotate: number; seed: number; cover: string }) {
  const W = 128;
  const H = 158;
  const outline = wobRect(W, H, 16, seed, 2.2, { segmentsH: 2, segmentsV: 2 });
  const coverD = wobRect(W - 24, 52, 10, seed + 3, 1.4);
  const lines = [0, 1, 2, 3].map((i) => wavyLine(i === 3 ? 58 : 92 - i * 6, seed + 10 + i, 1.1, 4));
  return (
    <g transform={`translate(${x} ${y}) rotate(${rotate} ${W / 2} ${H / 2})`}>
      <path d={outline} fill="var(--color-card-bg)" stroke={PEN} strokeWidth={INK} />
      <path d={coverD} transform="translate(12 12)" fill={cover} stroke={PEN_SOFT} strokeWidth={INK_LIGHT} />
      {lines.map((d, i) => (
        <path key={i} d={d} transform={`translate(14 ${84 + i * 16})`} fill="none" stroke={PEN_SOFT} strokeWidth={INK} strokeLinecap="round" />
      ))}
    </g>
  );
}

/** How a card answers a card: the second written in resonance with the first, ripples between them and a thread back. */
export function ResonanceSketch({ ariaLabel }: { ariaLabel: string }) {
  const ripples = useMemo(
    () =>
      [22, 36, 50].map((r, i) => {
        const a0 = (-38 * Math.PI) / 180;
        const a1 = (38 * Math.PI) / 180;
        const cx = 150;
        const cy = 118;
        const p0 = [cx + Math.cos(a0) * r, cy + Math.sin(a0) * r];
        const p1 = [cx + Math.cos(a1) * r, cy + Math.sin(a1) * r];
        const bulge = r * (1.08 + i * 0.02);
        return { d: `M ${p0[0].toFixed(1)},${p0[1].toFixed(1)} Q ${(cx + bulge * 1.18).toFixed(1)},${cy} ${p1[0].toFixed(1)},${p1[1].toFixed(1)}`, opacity: 0.9 - i * 0.25 };
      }),
    [],
  );
  return (
    <svg viewBox="0 0 360 230" role="img" aria-label={ariaLabel} style={{ display: 'block', width: '100%', height: 'auto', overflow: 'visible' }}>
      <SketchCard x={16} y={42} rotate={-5} seed={141} cover="var(--about-depth)" />
      <SketchCard x={214} y={34} rotate={4} seed={167} cover="var(--about-insight)" />
      {ripples.map((r, i) => (
        <path key={i} d={r.d} fill="none" stroke="var(--color-terracotta)" strokeOpacity={r.opacity} strokeWidth={INK_STRONG} strokeLinecap="round" />
      ))}
      {/* The resonance names the card it answers: a thread from the new card back to the first. */}
      <path d="M 262,30 C 236,-6 140,-8 104,36" fill="none" stroke={PEN} strokeWidth={INK_LIGHT} strokeDasharray="5 6" strokeLinecap="round" />
      <path d="M 96,26 L 104,37 L 115,30" fill="none" stroke={PEN} strokeWidth={INK_LIGHT} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * A sheet of paper for a few lines of text: drawn by hand once measured, a plain card of the same
 * paper and pen (the CSS stand-in) until then.
 */
export function PaperCard({ children, seed, className }: { children: ReactNode; seed: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const { w, h } = useElementSize(ref);
  const R = 20;
  return (
    <div ref={ref} className={className} style={{ position: 'relative' }}>
      <div
        className="res-shape-stand-in"
        aria-hidden="true"
        data-shape-pending={w > 0 && h > 0 ? undefined : ''}
        style={
          {
            position: 'absolute',
            inset: 0,
            '--shape-fill': 'var(--color-card-bg)',
            '--shape-ink': PEN,
            '--shape-ink-width': `${INK}px`,
            '--shape-radius': `${R}px`,
          } as CSSProperties
        }
      >
        {w > 0 && h > 0 && (
          <HandDrawnBorder
            w={w}
            h={h}
            R={R}
            seed={seed}
            mag={Math.min(w, h) * 0.02}
            fillColor="var(--color-card-bg)"
            strokeColor={PEN}
            strokeWidth={INK}
            segmentsH={[2, 3]}
            segmentsV={[2, 3]}
            curve={0.6}
            cornerJitter={0.8}
          />
        )}
      </div>
      <div style={{ position: 'relative' }}>{children}</div>
    </div>
  );
}
