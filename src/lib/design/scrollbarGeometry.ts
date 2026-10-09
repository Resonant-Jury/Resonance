import { makePrng } from './prng';

/**
 * The scrollbar family's numbers, in px — shared with the native bars'
 * `--sb-*` tokens in globals.css: a 6px thumb at rest and 10px when pointed
 * at or dragged, inside a 14px column the pointer can hit, never shorter
 * than 36px.
 */
export const SB = { hit: 14, rest: 6, active: 10, min: 36 } as const;

/** A scroller's position and extent (an element's scrollTop / scrollHeight / clientHeight). */
export interface ScrollMetrics {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
}

export interface ThumbGeometry {
  /** The thumb's length, in whole px (it is drawn once per length). */
  h: number;
  /** How far down the track its top is. */
  top: number;
  /** The scroller's scroll range (scrollHeight − clientHeight). */
  max: number;
}

/**
 * Where a scroller's thumb stands on a track `trackH` px tall: as long as
 * the visible share of the content (at least {@link SB.min}, at most the
 * track), as far down as the scroller is. Null when there is nothing worth a
 * bar — a scroll range of 6px or less (a divider's overshoot, sub-pixel
 * layout) — or nothing measured yet.
 */
export function thumbGeometry(m: ScrollMetrics, trackH: number): ThumbGeometry | null {
  const max = m.scrollHeight - m.clientHeight;
  if (max <= 6 || trackH <= 0 || m.clientHeight <= 0) return null;
  const h = Math.round(Math.min(trackH, Math.max(SB.min, (trackH * m.clientHeight) / m.scrollHeight)));
  const progress = Math.min(1, Math.max(0, m.scrollTop / max));
  return { h, top: (trackH - h) * progress, max };
}

/**
 * The scrollTop that puts a thumb `h` long at `thumbTop` on the track (the
 * inverse of {@link thumbGeometry}, clamped to the track's ends) — what a
 * drag asks for, with the place it was grabbed taken off first.
 */
export function scrollTopForThumb(thumbTop: number, trackH: number, h: number, max: number): number {
  const room = trackH - h;
  if (room <= 0) return 0;
  return (Math.min(Math.max(thumbTop, 0), room) / room) * max;
}

/**
 * The thumb's brush stroke, `h` px long: a spine from 5px below its top to
 * 5px above its foot (room for the round caps of a {@link SB.active} stroke),
 * bowed sideways by a seeded 0.6–0.9px at its middle — a capsule with a
 * hand-made edge, no wiggle. Vertical handles, like wavyVertical; drawn
 * around x = 0. The same seed and length always give the same stroke.
 */
export function brushSpine(h: number, seed: number): string {
  const rnd = makePrng(seed);
  const bow = (rnd() < 0.5 ? -1 : 1) * (0.6 + 0.3 * rnd());
  const cap = SB.active / 2;
  const top = Math.min(cap, h / 2);
  const foot = Math.max(h - cap, h / 2);
  const mid = h / 2;
  const v = (mid - top) / 3;
  const f = (n: number) => +n.toFixed(2);
  return (
    `M 0,${f(top)}` +
    ` C 0,${f(top + v)} ${f(bow)},${f(mid - v)} ${f(bow)},${f(mid)}` +
    ` C ${f(bow)},${f(mid + v)} 0,${f(foot - v)} 0,${f(foot)}`
  );
}
