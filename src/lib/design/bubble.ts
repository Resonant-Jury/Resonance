import { wobRect } from './wobRect';

/**
 * A chat bubble's outline — the recipe the thread draws with on the web, in
 * the Android app (MessageBubbleShape) and on iOS, so the three agree to the
 * point: its wobble follows its own size — radius min(18, h·0.42), swing
 * min(2.6, h·0.05), a turn per 80 px across (2–6) and per 52 px down (1–8),
 * bow 1.3, corner jitter 1.6, corners pulled in 4% of the short side.
 */

/** A bubble's full corner radius (a one-line bubble takes h·0.42 of it: nearly a pill). */
export const BUBBLE_RADIUS = 18;
/** The radius of a corner that faces its neighbour in a run (the others keep the full one). */
export const TUCKED_RADIUS = 4;
/** The quoted message over a reply: one shape on its own, a little rounder-cornered than a bubble is tall. */
export const QUOTE_RADIUS = 16;

/**
 * Where a bubble sits in a run of one person's messages (lib/chat/rows'
 * RunPosition): which of its corners on the sender's side are tucked.
 */
export type BubbleRun = 'single' | 'first' | 'middle' | 'last';

export interface BubbleShapeOptions {
  /** The viewer's own message: its run tucks on the right; theirs on the left. */
  own?: boolean;
  run?: BubbleRun;
  /** The radius a corner takes at most ({@link BUBBLE_RADIUS}; the quote's is {@link QUOTE_RADIUS}). */
  maxRadius?: number;
}

/**
 * The four corner radii, clockwise from the top left, of a bubble `h` tall —
 * or undefined for a bubble alone (all four the full radius). In a run the
 * corners facing a neighbour are tucked, on the sender's side: the first
 * tucks its bottom one, a middle one both, the last its top one.
 */
export function bubbleCorners(h: number, opts: BubbleShapeOptions = {}): [number, number, number, number] | undefined {
  const run = opts.run ?? 'single';
  if (run === 'single') return undefined;
  const radius = Math.min(opts.maxRadius ?? BUBBLE_RADIUS, h * 0.42);
  const tucked = Math.min(TUCKED_RADIUS, radius);
  const top = run === 'middle' || run === 'last' ? tucked : radius;
  const bottom = run === 'middle' || run === 'first' ? tucked : radius;
  return opts.own ? [radius, top, bottom, radius] : [top, radius, radius, bottom];
}

/** The bubble's wobbly outline as an SVG path, `w`×`h`, seeded per message. */
export function bubblePath(w: number, h: number, seed: number, opts: BubbleShapeOptions = {}): string {
  const across = Math.min(6, Math.max(2, Math.round(w / 80)));
  const down = Math.min(8, Math.max(1, Math.round(h / 52)));
  return wobRect(w, h, Math.min(opts.maxRadius ?? BUBBLE_RADIUS, h * 0.42), seed, Math.min(2.6, h * 0.05), {
    curve: 1.3,
    cornerJitter: 1.6,
    cornerOffset: Math.min(w, h) * 0.04,
    segmentsH: across,
    segmentsV: down,
    cornerRadii: bubbleCorners(h, opts),
  });
}

/**
 * A message's wobble seed from its key: a Java-style string hash over UTF-16
 * units (wrapping at 32 bits), folded into 1…9973. Bubbles start from 7, the
 * quote over a reply from 19 — the twin of the apps' `seedFromId`, so a
 * message wobbles the same everywhere ("m1" → 183).
 */
export function seedFromId(id: string, start = 7): number {
  let h = start;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return Math.abs(h % 9973) + 1;
}

/**
 * The bubble's stand-in corners as CSS `border-radius` (top-left, top-right,
 * bottom-right, bottom-left), for the moment before it is measured — the
 * same tucks, on a plain rounded box.
 */
export function bubbleStandInRadius(opts: BubbleShapeOptions = {}): string {
  const corners = bubbleCorners(Infinity, opts) ?? [BUBBLE_RADIUS, BUBBLE_RADIUS, BUBBLE_RADIUS, BUBBLE_RADIUS];
  return corners.map((r) => `${Math.min(r, opts.maxRadius ?? BUBBLE_RADIUS)}px`).join(' ');
}
