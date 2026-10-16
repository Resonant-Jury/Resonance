/**
 * The promo's drawing kit: the site's own pieces — story card, tag pill,
 * avatar, buttons, segmented bar, modal sheet, bubble, toggle — redrawn from
 * the same geometry (src/lib/design) and tokens (src/styles/tokens.css) at
 * the web's own 1× sizes. A scene sets them at video size with CSS `zoom`,
 * so text and pen lines stay crisp.
 *
 * Every builder measures its content once (fonts are loaded before any
 * scene is built) and returns the element plus handles a scene's update()
 * drives per frame.
 */
import { wobRect, type WobRectOpts } from '@/lib/design/wobRect';
import { wobCircle } from '@/lib/design/wobCircle';
import { wavyLine } from '@/lib/design/wavyPath';
import { makePrng } from '@/lib/design/prng';
import { autoCurve, autoMag, autoSegments } from '@/lib/design/wobAuto';
import { bubblePath, QUOTE_RADIUS, seedFromId, type BubbleRun } from '@/lib/design/bubble';
import { INK, INK_LIGHT, INK_STRONG } from '@/lib/design/strokes';
import { STORY_GRAIN } from '@/lib/design/grain';
import { css, drawable, html, place, svg } from './dom';

export { INK, INK_LIGHT, INK_STRONG, wobRect, wobCircle, wavyLine, makePrng, bubblePath, seedFromId, QUOTE_RADIUS };
export type { BubbleRun };

let uidCounter = 0;
/** A page-unique id for clip paths. */
export const uid = (prefix: string) => `${prefix}-${++uidCounter}`;

// ── Colour ────────────────────────────────────────────────────────────

/** The tokens, by their CSS variables (tokens.css is on the page). */
export const C = {
  cream: 'var(--color-cream)',
  creamDark: 'var(--color-cream-dark)',
  cardBg: 'var(--color-card-bg)',
  terracotta: 'var(--color-terracotta)',
  terracottaLight: 'var(--color-terracotta-light)',
  lavender: 'var(--color-lavender)',
  sage: 'var(--color-sage)',
  yellow: 'var(--color-yellow)',
  sky: 'var(--color-sky)',
  text: 'var(--color-text)',
  muted: 'var(--color-text-muted)',
  buttonFill: 'var(--button-fill)',
  buttonTonal: 'var(--button-tonal)',
  onTonal: 'var(--button-on-tonal)',
  bubbleMine: 'var(--bubble-mine)',
  bubbleTheirs: 'var(--bubble-theirs)',
  bubbleQuote: 'var(--bubble-quote)',
  fieldBorder: 'var(--field-border)',
  /** The pen that outlines avatars and sketches. */
  pen: 'oklch(36% 0.06 60 / 0.55)',
  penSoft: 'oklch(36% 0.06 60 / 0.35)',
  /** A modal's outline. */
  sheetPen: 'oklch(40% 0.06 60)',
} as const;

/** The six card families (CARD_HUES): terracotta, lavender, sage, straw, sky, blush. */
export const HUES = [55, 290, 140, 88, 215, 18] as const;
const FILL_L = [90, 94, 93, 92, 92, 89];
const FILL_C = [0.065, 0.032, 0.042, 0.075, 0.033, 0.047];
const BORDER = ['oklch(52% 0.13 55)', 'oklch(54% 0.10 290)', 'oklch(50% 0.12 140)', 'oklch(58% 0.14 88)', 'oklch(50% 0.10 215)', 'oklch(52% 0.09 18)'];

export const family = (i: number) => {
  const k = ((i % 6) + 6) % 6;
  const hue = HUES[k];
  return {
    hue,
    /** The cover / accent fill (CARD_FILLS). */
    fill: `oklch(${FILL_L[k]}% ${FILL_C[k]} ${hue})`,
    /** The pen line (CARD_BORDERS[i][0]). */
    border: BORDER[k],
    /** The card's paper. */
    interior: `oklch(97.5% 0.012 ${hue})`,
    /** The hovered / chosen paper. */
    wash: `oklch(92.5% 0.024 ${hue})`,
    tag: `oklch(${FILL_L[k] - 5}% ${FILL_C[k]} ${hue})`,
    stripe: `oklch(${FILL_L[k] - 7}% ${FILL_C[k]} ${hue})`,
    separator: `oklch(55% 0.04 ${hue} / 0.4)`,
  };
};

// ── Filters ───────────────────────────────────────────────────────────

let defs: SVGDefsElement | null = null;
const defined = new Set<string>();

/** The page's one <defs>, where every filter is declared once. */
export function initDefs(stage: HTMLElement) {
  const host = svg('svg', { width: 0, height: 0, style: 'position:absolute' });
  defs = svg('defs');
  host.append(defs);
  stage.append(host);
}

function define(id: string, build: () => SVGElement) {
  if (defined.has(id)) return;
  if (!defs) throw new Error('initDefs first');
  defined.add(id);
  defs.append(build());
}

/** HandDrawnBorder's chalk: warm fractal noise multiplied into a fill, kept inside it. */
export function chalk(seed: number): string {
  const id = `chalk-${seed}`;
  define(id, () =>
    svg('filter', { id, x: '0%', y: '0%', width: '100%', height: '100%', 'color-interpolation-filters': 'sRGB' }, [
      svg('feTurbulence', { type: 'fractalNoise', baseFrequency: `${0.5 + (seed % 6) * 0.018} ${0.38 + (seed % 6) * 0.012}`, numOctaves: 4, seed: seed + 30 }),
      svg('feColorMatrix', { type: 'matrix', values: '0 0 0 0 0.99  0 0 0 0 0.94  0 0 0 0 0.88  0 0 0 0.09 0', result: 'warmNoise' }),
      svg('feBlend', { in: 'SourceGraphic', in2: 'warmNoise', mode: 'multiply', result: 'blended' }),
      svg('feComposite', { in: 'blended', in2: 'SourceGraphic', operator: 'in' }),
    ]),
  );
  return `url(#${id})`;
}

/** ShapeGrain: black specks whose alpha follows fractal noise, inside the shape. */
export function shapeGrain(opacity: number, frequency: number, seed = 1): string {
  const id = `grain-${Math.round(opacity * 1000)}-${Math.round(frequency * 1000)}-${seed}`;
  define(id, () =>
    svg('filter', { id, x: '0%', y: '0%', width: '100%', height: '100%' }, [
      svg('feTurbulence', { type: 'fractalNoise', baseFrequency: frequency, numOctaves: 2, stitchTiles: 'stitch', seed }),
      svg('feColorMatrix', { type: 'saturate', values: 0 }),
      svg('feComponentTransfer', {}, [svg('feFuncA', { type: 'linear', slope: opacity })]),
      svg('feComposite', { in2: 'SourceGraphic', operator: 'in' }),
    ]),
  );
  return `url(#${id})`;
}

// ── Icons ─────────────────────────────────────────────────────────────

/** The app's icons (src/components/atoms/Icon/icons), 24×24, drawn at INK_STRONG like <Icon>. */
export const ICONS = {
  wave: {
    d: [
      'M3.4,8.2 C5.4,5.9 7.3,5.8 9.2,8.0 C11.1,10.2 13.0,10.3 15.0,8.1 C16.9,6.0 18.8,5.9 20.7,8.1',
      'M3.0,12.1 C5.1,9.7 7.1,9.8 9.0,12.0 C10.9,14.2 12.9,14.3 14.9,12.1 C16.8,9.9 18.8,9.8 20.9,12.0',
      'M3.5,16.0 C5.4,13.8 7.4,13.7 9.3,15.9 C11.2,18.1 13.1,18.2 15.1,16.0 C17.0,13.9 18.9,13.8 20.8,16.0',
    ],
  },
  globe: {
    d: [
      'M11.9,3.5 C16.4,3.7 20.4,7.6 20.4,12.1 C20.5,16.7 16.5,20.4 12.0,20.4 C7.4,20.5 3.5,16.4 3.5,11.9 C3.6,7.4 7.6,3.6 11.9,3.5 Z',
      'M3.7,12.1 C8.0,13.5 15.7,10.6 20.3,12.0',
      'M12.0,3.6 C9.4,6.5 8.9,17.4 12.1,20.4 C15.2,17.7 14.9,6.4 12.0,3.6 Z',
    ],
  },
  lock: {
    d: [
      'M4.6,11.6 C8.4,10.8 15.7,11.0 19.3,11.4 C19.7,14.0 19.6,17.0 19.4,19.4 C15.4,20.1 8.6,19.8 4.7,19.3 C4.1,16.9 4.8,13.9 4.6,11.6 Z',
      'M7.6,11.5 C6.9,9.2 7.7,6.4 9.6,5.3 C11.5,4.2 13.7,4.5 15.0,5.9 C16.5,7.4 16.7,9.5 16.3,11.5',
    ],
    filled: ['M11.6,14.3 C12.4,14.0 13.1,14.7 12.8,15.5 C12.6,16.0 12.6,16.6 12.4,17.0 C12.0,17.0 11.7,16.4 11.5,15.8 C11.3,15.2 11.2,14.6 11.6,14.3 Z'],
  },
  users: {
    d: [
      'M15.4,7.8 C16.7,7.4 18.2,8.0 18.6,9.4 C19.0,10.7 18.4,12.1 17.2,12.5 C16.0,12.9 14.6,12.3 14.3,11.0 C14.0,9.7 14.4,8.3 15.4,7.8 Z',
      'M14.6,14.7 C16.0,14.0 18.3,14.4 19.6,15.7 C20.6,16.7 20.9,17.9 21.0,18.4',
      'M7.5,6.3 C9.4,5.7 11.6,6.6 12.1,8.5 C12.5,10.3 11.5,12.3 9.7,12.7 C7.9,13.1 6.0,12.0 5.7,10.2 C5.5,8.5 6.2,6.8 7.5,6.3 Z',
      'M3.1,18.9 C3.9,16.5 5.7,14.7 9.1,14.5 C12.4,14.3 14.5,16.3 15.1,18.9',
    ],
  },
  user: {
    d: [
      'M11.2,4.4 C13.5,3.6 16.0,5.2 15.9,7.9 C15.8,10.1 14.1,11.7 11.8,11.5 C9.6,11.4 8.0,9.8 8.2,7.5 C8.4,5.5 10.0,4.0 12.1,4.1 C12.9,4.2 13.5,4.6 13.9,5.2',
      'M4.7,19.9 C4.3,17.6 5.6,15.8 7.6,14.9 C9.0,14.3 10.5,14.1 12.3,14.2 C15.4,14.3 18.4,15.7 19.1,18.6 C19.2,19.2 19.3,19.7 19.0,20.2',
    ],
  },
  'user-check': {
    d: [
      'M8.3,4.6 C10.2,4.0 12.4,4.9 12.9,6.8 C13.3,8.6 12.3,10.6 10.5,11.0 C8.7,11.4 6.8,10.3 6.5,8.5 C6.3,6.8 7.0,5.1 8.3,4.6 Z',
      'M3.4,19.3 C4.2,16.6 6.1,14.8 9.6,14.6 C11.6,14.5 13.2,15.1 14.3,16.1',
      'M15.2,17.4 C16.2,17.6 17.0,18.6 17.9,19.9 C19.3,17.8 20.8,15.9 22.5,14.3',
    ],
  },
  note: {
    d: [
      'M3.6,6.4 C9.2,6.1 14.9,6.1 20.4,6.3 C20.7,10.1 20.6,14.0 20.4,17.7 C14.8,18.0 9.1,17.9 3.7,17.6 C3.4,13.9 3.4,10.1 3.6,6.4 Z',
      'M3.9,6.9 C6.6,9.2 9.3,11.4 12.1,13.4 C14.8,11.3 17.5,9.1 20.1,6.8',
    ],
  },
  send: {
    d: [
      'M3.0,12.4 C7.2,9.3 13.9,6.3 20.2,3.5 C18.7,8.8 16.4,15.2 12.9,21.3 C11.8,19.0 10.9,16.7 9.7,14.5 C7.2,13.7 4.2,12.3 1.7,11.0',
      'M19.6,4.2 C16.3,6.3 14.2,9.4 11.4,12.1',
    ],
  },
  bookmark: {
    d: ['M6.6,3.9 C10.1,3.6 13.8,3.6 17.3,3.8 C17.6,9.2 17.5,14.7 17.4,20.1 C15.6,18.6 13.8,17.1 12.0,15.7 C10.2,17.2 8.4,18.6 6.6,20.0 C6.4,14.7 6.4,9.3 6.6,3.9 Z'],
  },
  pen: {
    d: [
      'M15.6,3.7 C16.4,2.9 17.7,2.9 18.5,3.7 L20.3,5.5 C21.1,6.3 21.1,7.6 20.3,8.4 L9.6,19.1 C9.4,19.3 9.1,19.5 8.8,19.6 L5.0,20.9 C4.4,21.1 3.9,20.6 4.1,20.0 L5.4,16.2 C5.5,15.9 5.7,15.6 5.9,15.4 Z',
      'M5.3,16.4 C6.6,16.9 7.9,18.2 8.5,19.6',
      'M14.0,5.3 L18.7,10.0',
    ],
  },
  eye: {
    d: [
      'M2.6,12.2 C5.5,8.0 8.7,5.8 12.1,5.8 C15.4,5.8 18.8,8.2 21.3,11.9 C18.6,16.0 15.5,18.2 12.0,18.2 C8.6,18.2 5.2,16.0 2.6,12.2 Z',
      'M10.0,10.4 C11.2,9.4 13.1,9.5 14.0,10.7 C14.9,12.0 14.5,13.7 13.3,14.4 C11.9,15.2 10.0,14.5 9.4,13.0 C8.9,12.0 9.3,11.0 10.0,10.4 Z',
    ],
    filled: ['M13.1,10.9 C13.4,10.8 13.7,11.0 13.6,11.3 C13.5,11.6 13.0,11.6 12.9,11.3 C12.8,11.1 12.9,11.0 13.1,10.9 Z'],
  },
  sparkle: {
    d: [
      'M12.4,3.5 C12.9,7.0 12.0,10.2 13.6,11.7 C15.2,13.1 18.6,12.4 20.4,12.6 C17.0,13.4 14.6,12.5 13.3,14.0 C11.9,15.6 12.7,18.7 12.2,20.6 C11.5,17.4 12.0,14.2 10.6,12.9 C9.0,11.5 5.7,12.4 3.6,12.0 C7.0,11.4 10.2,12.0 11.4,10.5 C12.7,8.8 11.6,5.4 12.4,3.5 Z',
      'M18.4,5.4 C18.7,6.3 18.4,6.9 19.4,7.0 C18.5,7.2 18.8,7.9 18.4,8.5 C18.2,7.7 17.4,7.4 16.8,7.1 C17.6,6.9 18.2,6.3 18.4,5.4 Z',
      'M5.5,17.2 C5.8,17.8 5.7,18.4 6.4,18.5 C5.8,18.7 5.8,19.3 5.5,19.8 C5.3,19.1 4.8,18.9 4.3,18.5 C4.8,18.4 5.2,17.9 5.5,17.2 Z',
    ],
  },
  chat: {
    d: [
      'M4.2,5.9 C9.4,5.5 14.9,5.5 20.0,5.9 C20.4,9.2 20.3,12.5 20.0,15.7 C16.3,16.1 12.5,16.2 8.8,16.0 C7.4,17.5 5.9,18.9 4.4,20.2 C4.3,15.4 4.1,10.7 4.2,5.9 Z',
      'M8.3,9.8 C10.9,9.6 13.5,9.6 16.0,9.8',
      'M8.4,12.4 C10.3,12.3 12.2,12.3 14.1,12.4',
    ],
  },
  cards: {
    d: [
      'M9.0,4.6 C12.3,4.1 16.4,4.3 19.2,4.9 C19.7,7.9 19.5,11.4 19.2,14.2',
      'M4.6,8.2 C8.0,7.6 12.0,7.8 15.2,8.4 C15.7,11.4 15.5,15.6 15.1,19.3 C11.5,19.9 7.6,19.7 4.7,19.3 C4.2,15.8 4.9,11.6 4.6,8.2 Z',
      'M6.8,11.8 C8.6,11.5 11.0,11.6 12.9,11.9',
      'M6.9,14.7 C8.4,14.5 10.2,14.5 11.6,14.7',
    ],
  },
  link: {
    d: [
      'M10.6,13.4 C9.4,12.0 9.6,10.0 10.9,8.7 C11.8,7.8 12.7,6.9 13.6,6.0 C15.0,4.6 17.3,4.7 18.6,6.0 C20.0,7.4 19.9,9.6 18.5,11.0 C18.0,11.5 17.5,12.0 17.0,12.4',
      'M13.4,10.7 C14.6,12.0 14.4,14.0 13.1,15.3 C12.2,16.2 11.3,17.1 10.4,18.0 C9.0,19.4 6.7,19.3 5.4,18.0 C4.0,16.6 4.1,14.4 5.5,13.0 C6.0,12.5 6.5,12.0 7.0,11.6',
    ],
  },
  check: { d: ['M4.3,12.7 C6.4,13.1 8.1,15.1 10.2,17.8 C13.1,13.5 16.2,9.6 19.7,6.4'] },
  plus: { d: ['M12.1,4.3 C10.6,8.7 13.4,14.6 11.9,19.6', 'M4.4,11.8 C8.7,13.3 14.9,10.7 19.6,12.2'] },
  'arrow-right': { d: ['M3.9,11.8 C8.2,13.7 14.8,10.2 19.2,12.3', 'M12.9,6.2 C15.4,8.0 17.8,10.4 19.2,12.2 C18.2,13.5 16.7,15.1 13.0,17.7'] },
  trash: {
    d: [
      'M4.3,7.4 C6.5,6.6 9.1,7.0 11.5,6.6 C14.1,6.2 16.9,6.5 19.6,7.0',
      'M9.3,6.8 C9.0,5.6 9.7,4.4 11.3,4.3 C12.7,4.2 14.1,4.4 14.6,5.5 C14.8,5.9 14.8,6.3 14.7,6.6',
      'M5.9,7.7 C6.6,10.5 6.3,13.6 6.9,16.4 C7.1,17.6 7.3,18.7 8.0,19.4 C10.5,20.1 13.6,20.0 16.1,19.4 C16.9,18.4 16.8,16.9 17.1,15.4 C17.5,12.7 17.4,10.1 18.0,7.5',
      'M10.0,10.2 C10.5,12.3 9.9,14.5 10.5,16.8',
      'M14.0,10.1 C13.5,12.1 14.1,14.4 13.5,16.7',
    ],
  },
  frame: {
    d: [
      'M4.2,4.6 C7.1,4.1 10.4,4.4 12.9,4.2',
      'M16.8,4.3 C18.2,4.2 19.5,4.5 19.7,5.9 C19.8,7 19.6,8.4 19.7,9.6',
      'M19.8,13.4 C19.9,15.4 19.6,17.6 19.7,19.4 C17.7,19.7 15.4,19.4 13.4,19.6',
      'M9.6,19.7 C8,19.6 6,19.9 4.7,19.5 C4.1,19.3 4.3,17.7 4.3,16.6',
      'M4.3,12.8 C4.2,11.1 4.4,7.9 4.3,8.2',
      'M8.6,9.4 C10.7,9 13.5,9.3 15.3,9.2 C15.6,11 15.3,13.2 15.4,14.9 C13.3,15.2 10.7,14.9 8.7,15.1 C8.5,13.2 8.7,11.2 8.6,9.4 Z',
    ],
  },
} as const satisfies Record<string, { d: readonly string[]; filled?: readonly string[] }>;

export type IconName = keyof typeof ICONS;

export interface IconHandle {
  el: SVGSVGElement;
  /** The stroked paths, for drawing the icon on with a pen. */
  paths: SVGPathElement[];
}

export function icon(name: IconName, size: number, color: string = 'currentColor', strokeWidth: number = INK_STRONG): IconHandle {
  const def: { d: readonly string[]; filled?: readonly string[] } = ICONS[name];
  const paths = def.d.map((d) => svg('path', { d }));
  const el = svg(
    'svg',
    { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: color, 'stroke-width': strokeWidth, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', style: 'display:block;flex-shrink:0;overflow:visible' },
    [...paths, ...(def.filled ?? []).map((d) => svg('path', { d, fill: color, stroke: 'none' }))],
  );
  return { el, paths };
}

// ── Measuring ─────────────────────────────────────────────────────────

let measureRoot: HTMLElement | null = null;

export function initMeasure(stage: HTMLElement) {
  measureRoot = html('div', { class: 'abs', style: { left: 0, top: 0, visibility: 'hidden', width: 1920 } });
  stage.append(measureRoot);
}

/** The element's laid-out size at 1× (it is left attached until a scene places it). */
export function measure(el: HTMLElement): { w: number; h: number } {
  if (!el.isConnected) measureRoot!.append(el);
  const r = el.getBoundingClientRect();
  return { w: r.width, h: r.height };
}

// ── Shapes ────────────────────────────────────────────────────────────

/** An absolutely placed SVG over a w × h box, drawing past its edges. */
export function shapeSvg(w: number, h: number, children: SVGElement[] = [], z = 0): SVGSVGElement {
  return svg('svg', { width: w, height: h, viewBox: `0 0 ${w} ${h}`, class: 'abs', style: `left:0;top:0;overflow:visible;pointer-events:none;z-index:${z}` }, children);
}

export interface FaceOpts {
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  chalkSeed?: number;
  grain?: { opacity: number; frequency: number; seed?: number };
}

/** A filled wobble: fill (with chalk), grain over it, pen line on top — HandDrawnBorder + ShapeGrain. */
export function face(d: string, w: number, h: number, o: FaceOpts) {
  const fill = o.fill ? svg('path', { d, fill: o.fill, filter: o.chalkSeed != null ? chalk(o.chalkSeed) : undefined }) : null;
  const grain = o.grain ? svg('path', { d, fill: 'black', filter: shapeGrain(o.grain.opacity, o.grain.frequency, o.grain.seed ?? 1) }) : null;
  const stroke = o.stroke
    ? svg('path', { d, fill: 'none', stroke: o.stroke, 'stroke-width': o.strokeWidth ?? INK, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' })
    : null;
  const el = shapeSvg(w, h, [fill, grain, stroke].filter((x): x is SVGPathElement => !!x));
  return { el, fill, grain, stroke, drawStroke: stroke ? drawable(stroke) : () => {} };
}

/** HandDrawnBorder's own defaults for a w × h box. */
export function autoRect(w: number, h: number, R: number, seed: number, opts: WobRectOpts & { mag?: number } = {}): string {
  return wobRect(w, h, R, seed, opts.mag ?? autoMag(w, h), {
    segmentsH: opts.segmentsH ?? autoSegments(w),
    segmentsV: opts.segmentsV ?? autoSegments(h),
    curve: opts.curve ?? autoCurve(w, h),
    cornerJitter: opts.cornerJitter ?? 1,
    cornerOffset: opts.cornerOffset ?? 0,
  });
}

// ── Atoms ─────────────────────────────────────────────────────────────

/** TagPill's seed for a label. */
export function tagSeed(text: string): number {
  let hash = 7;
  for (let i = 0; i < text.length; i++) hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
  return (Math.abs(hash) % 9973) + 1;
}

/** A TagPill (sm/md: a bare tinted fill, no outline). */
export function tagPill(text: string, fill: string, o: { fontSize?: number; padX?: number; padY?: number; uppercase?: boolean; color?: string; stroke?: string } = {}) {
  const el = html('span', {
    class: 'pill',
    style: {
      padding: `${o.padY ?? 4}px ${o.padX ?? 14}px`,
      fontSize: o.fontSize ?? 11,
      textTransform: o.uppercase === false ? 'none' : 'uppercase',
      color: o.color ?? C.text,
    },
  }, [html('span', { class: 'pill-label', text })]);
  const { w, h } = measure(el);
  const d = wobRect(w, h, h / 2, tagSeed(text), autoMag(w, h), { segmentsH: autoSegments(w), segmentsV: 2, curve: autoCurve(w, h), cornerJitter: 1, cornerOffset: 0 });
  const f = face(d, w, h, { fill, stroke: o.stroke, strokeWidth: INK });
  el.prepend(f.el);
  css(el, { width: w, height: h });
  return { el, w, h, face: f };
}

/** HandDrawnAvatar: a wobbly rounded square with the initials, or "·" for an anonymous author. */
export function avatar(size: number, initials: string, fill: string, seed = initials.charCodeAt(0) * 13) {
  const d = wobRect(size, size, size * 0.4, seed, size * 0.022, { segmentsH: 1, segmentsV: 1, curve: 1.3, cornerJitter: 3.2, cornerOffset: size * 0.06 });
  const ems = [...initials].reduce((n, ch) => n + (/[　-鿿＀-￯]/.test(ch) ? 1 : 0.62), 0) || 1;
  const f = face(d, size, size, { fill, stroke: C.pen, strokeWidth: INK });
  const label = html('span', { class: 'avatar-label', text: initials, style: { fontSize: size * Math.min(0.35, 0.56 / ems) } });
  const el = html('span', { class: 'avatar', style: { width: size, height: size } }, [f.el, label]);
  return { el, face: f, label };
}

export type ButtonVariant = 'solid' | 'tonal' | 'ctaLight' | 'ctaGhost' | 'paper';

const BUTTON: Record<ButtonVariant, { fill: string; color: string; seed: number }> = {
  solid: { fill: C.buttonFill, color: C.cream, seed: 3 },
  tonal: { fill: C.buttonTonal, color: C.onTonal, seed: 601 },
  ctaLight: { fill: C.cream, color: C.onTonal, seed: 801 },
  ctaGhost: { fill: 'color-mix(in oklch, var(--color-terracotta), black 18%)', color: C.cream, seed: 1001 },
  paper: { fill: C.cardBg, color: C.text, seed: 401 },
};

/** OrganicButton: a filled wobble with grain, never a pen line. */
export function button(label: string, variant: ButtonVariant, o: { size?: 'sm' | 'md'; icon?: IconName; iconSize?: number } = {}) {
  const v = BUTTON[variant];
  const sm = (o.size ?? 'sm') === 'sm';
  const ic = o.icon ? icon(o.icon, o.iconSize ?? (sm ? 15 : 16), v.color) : null;
  const text = html('span', { text: label });
  const el = html('span', {
    class: 'button',
    style: { padding: sm ? '9px 18px' : '14px 32px', fontSize: sm ? 14 : 15, color: v.color },
  }, [ic?.el, text]);
  const { w, h } = measure(el);
  const d = sm
    ? wobRect(w, h, 16, v.seed, Math.min(w, h) * 0.04, { segmentsH: [2, 3], segmentsV: 1, curve: 1.3, cornerJitter: 1.3, cornerOffset: Math.min(w, h) * 0.03 })
    : wobRect(w, h, h / 2, v.seed, Math.min(w, h) * 0.05, { segmentsH: [3, 4], segmentsV: 1, curve: 1.9, cornerJitter: 1.6, cornerOffset: Math.min(w, h) * 0.035 });
  const f = face(d, w, h, { fill: v.fill, grain: { opacity: 0.38, frequency: 1.1, seed: v.seed } });
  el.prepend(f.el);
  css(el, { width: w, height: h });
  return { el, w, h, face: f, label: text };
}

/** A wavy rule, as Divider and the card's separator draw it. */
export function wavyRule(w: number, seed: number, color: string, o: { amp?: number; steps?: number; width?: number } = {}) {
  const d = wavyLine(w, seed, o.amp ?? 1.4, o.steps ?? 7);
  const path = svg('path', { d, transform: 'translate(0,4)', fill: 'none', stroke: color, 'stroke-width': o.width ?? INK_LIGHT, 'stroke-linecap': 'round' });
  const el = svg('svg', { width: w, height: 8, viewBox: `0 0 ${w} 8`, style: 'display:block;overflow:visible' }, [path]);
  return { el, path, draw: drawable(path) };
}

/** How a story card says its read time; main.ts sets it from the locale's app.readMinutes. */
let readTime = (minutes: number) => `${minutes} min`;
export function setReadTime(format: (minutes: number) => string) {
  readTime = format;
}

// ── Story card ────────────────────────────────────────────────────────

export interface CardOpts {
  /** The card's place in its list: its colour family and seed. */
  index: number;
  /** The card's family, when it isn't `index`'s. */
  palette?: number;
  width?: number;
  title: string;
  excerpt: string;
  tags: readonly string[];
  /** The author, or null for an anonymous card. */
  author: { name: string; initials: string } | null;
  anonymousName?: string;
  minutes: number;
  /** Draws the cover's picture inside a cw × ch box (else the striped placeholder). */
  cover?: (cw: number, ch: number, fam: ReturnType<typeof family>) => SVGElement[];
  coverRatio?: number;
  /** Space under the author row (a card page's action bar, a caption). */
  footer?: HTMLElement;
}

/**
 * StoryCard (desktop): chalked paper in its family's colour, the cover clipped
 * to its own wobble, tags, title, excerpt, a wavy rule and the byline.
 */
export function storyCard(o: CardOpts) {
  const fam = family(o.palette ?? o.index);
  const seed = o.index * 77 + 13;
  const w = o.width ?? 340;
  const cw = w - 44;
  const ch = Math.round(cw * (o.coverRatio ?? 0.62));

  // Cover: clipped to its own wobble, bleeding past the box so the bulges land on paint.
  const coverD = wobRect(cw, ch, 18, seed + 5, Math.min(cw, ch) * 0.05, { segmentsH: [3, 4], segmentsV: [2, 3], curve: 0.4, cornerJitter: 1.1, cornerOffset: 6 });
  const clipId = uid('cover');
  const bleed = 22;
  const picture = o.cover
    ? o.cover(cw, ch, fam)
    : [
        svg('rect', { x: -bleed, y: -bleed, width: cw + bleed * 2, height: ch + bleed * 2, fill: fam.fill }),
        ...Array.from({ length: 22 }, (_, i) =>
          svg('line', { x1: ((i * 22 - 160) * cw) / 320, y1: 0, x2: ((i * 22 + 160) * cw) / 320, y2: ch, stroke: fam.stripe, 'stroke-width': 1.2, 'stroke-opacity': 0.28 }),
        ),
      ];
  const coverGroup = svg('g', { 'clip-path': `url(#${clipId})` }, picture);
  const cover = svg('svg', { width: cw, height: ch, viewBox: `0 0 ${cw} ${ch}`, style: 'display:block;overflow:visible' }, [
    svg('defs', {}, [svg('clipPath', { id: clipId }, [svg('path', { d: coverD })])]),
    coverGroup,
  ]);

  const tags = o.tags.slice(0, 4).map((t) => tagPill(t, fam.tag));
  const tagRow = html('div', { class: 'card-tags' }, tags.map((t) => t.el));
  const title = html('h3', { class: 'card-title', text: o.title });
  const excerpt = html('p', { class: 'card-excerpt', text: o.excerpt });
  const sep = wavyRule(cw, seed + 91, fam.separator, { amp: 1.2, steps: 6, width: INK_LIGHT });

  const anon = o.author == null;
  const av = anon ? avatar(30, '·', fam.fill, 31 * 7) : avatar(30, o.author!.initials, fam.fill);
  const name = html('div', { class: 'card-author', text: anon ? (o.anonymousName ?? '') : o.author!.name });
  const read = html('div', { class: 'card-read', text: readTime(o.minutes) });
  const arrow = icon('arrow-right', 18, C.text, INK);
  css(arrow.el, { opacity: 0.28 });
  const byline = html('div', { class: 'card-byline' }, [av.el, html('div', { style: { flex: 1, minWidth: 0 } }, [name, read]), arrow.el]);

  const content = html('div', { class: 'card-content', style: { width: w, padding: 22 } }, [cover, tagRow, title, excerpt, sep.el, byline, o.footer]);
  const el = html('div', { class: 'card', style: { width: w } }, [content]);
  const { h } = measure(el);

  const d = wobRect(w, h, 22, seed, Math.min(w, h) * 0.025, { segmentsH: [3, 4], segmentsV: [5, 6], curve: 0.55, cornerJitter: 0.7, cornerOffset: 4 });
  const paper = face(d, w, h, { fill: fam.interior, chalkSeed: o.index, grain: { opacity: STORY_GRAIN.paper, frequency: 0.85, seed } });
  const pen = face(d, w, h, { stroke: fam.border, strokeWidth: INK });
  css(paper.el, { zIndex: 0 });
  css(pen.el, { zIndex: 1 });
  el.prepend(paper.el, pen.el);
  css(el, { height: h });
  return { el, w, h, fam, seed, d, paper, pen, cover, coverGroup, tags, title, excerpt, sep, avatar: av, name, read, arrow: arrow.el, byline, content };
}

// ── Molecules ─────────────────────────────────────────────────────────

export interface SegmentSpec {
  /** The label, or its states (the segment is sized to the widest). */
  labels: string[];
  icons: IconName[];
  /** The icon alone (16 px a side), as the app's collapsible bookmark does when the row runs out of room. */
  iconOnly?: boolean;
}

function boundary(x: number, h: number, seed: number, pad: number): string {
  const rnd = makePrng(seed);
  const pts: [number, number][] = [[x, -pad], [x, 0], [x + (rnd() - 0.5) * 3.2, h / 3], [x + (rnd() - 0.5) * 3.2, (2 * h) / 3], [x, h], [x, h + pad]];
  return pts.map(([px, py], i) => `${i ? 'L' : 'M'} ${px.toFixed(2)},${py.toFixed(2)}`).join(' ');
}

/**
 * SegmentedActionBar: one filled wobble cut into segments by cream seams. As
 * the card page's actions (`mode: 'actions'`) the verb's segment is solid; as a
 * choice (`mode: 'choice'`, the publish panel) the track is cream-dark and the
 * chosen side tonal.
 */
export function segmentedBar(segments: SegmentSpec[], o: { mode?: 'actions' | 'choice'; seed?: number; fontSize?: number } = {}) {
  const mode = o.mode ?? 'actions';
  const seed = o.seed ?? 71;
  const segEls = segments.map((s) => {
    const states = s.labels.map((label, k) => {
      const ic = icon(s.icons[Math.min(k, s.icons.length - 1)], 16);
      const row = s.iconOnly
        ? html('span', { class: 'seg-state', style: { padding: '0 16px' }, attrs: { 'aria-label': label } }, [ic.el])
        : html('span', { class: 'seg-state' }, [ic.el, html('span', { text: label })]);
      return { row, icon: ic };
    });
    const el = html('span', { class: 'seg', style: { fontSize: o.fontSize ?? 15 } }, states.map((st) => st.row));
    return { el, states };
  });
  const row = html('div', { class: 'seg-row' }, segEls.map((s) => s.el));
  const el = html('div', { class: 'segbar' }, [row]);
  // Size every segment to its widest state (the states share one grid cell, each at its own width).
  measure(el);
  const widths = segEls.map((s) => Math.ceil(Math.max(...s.states.map((st) => st.row.getBoundingClientRect().width))));
  segEls.forEach((s, i) => css(s.el, { width: widths[i] }));
  const { w, h } = measure(el);
  const lefts = widths.map((_, i) => widths.slice(0, i).reduce((a, b) => a + b, 0));

  const outer = wobRect(w, h, 16, seed, Math.min(w, h) * 0.05, { segmentsH: [7, 9], segmentsV: [2, 3], curve: 1.2, cornerJitter: 1.2, cornerOffset: h * 0.04 });
  const clipId = uid('seg');
  const pad = Math.max(12, h * 0.3);
  const seams = lefts.slice(1).map((x, i) => boundary(x, h, seed + (i + 1) * 37 + 11, pad));
  const region = (i: number) => {
    const x0 = i === 0 ? -pad : lefts[i];
    const x1 = i === segments.length - 1 ? w + pad : lefts[i + 1];
    return `M ${x0},${-pad} L ${x1},${-pad} L ${x1},${h + pad} L ${x0},${h + pad} Z`;
  };
  const fills = segments.map((_, i) => svg('path', { d: region(i), fill: mode === 'actions' ? C.buttonFill : C.buttonTonal, opacity: 0 }));
  const shape = shapeSvg(w, h, [
    svg('defs', {}, [svg('clipPath', { id: clipId }, [svg('path', { d: outer })])]),
    svg('g', { 'clip-path': `url(#${clipId})` }, [
      svg('rect', { x: -pad, y: -pad, width: w + pad * 2, height: h + pad * 2, fill: mode === 'actions' ? C.buttonTonal : C.creamDark }),
      ...fills,
      ...seams.map((d) => svg('path', { d, fill: 'none', stroke: C.cream, 'stroke-width': INK, 'stroke-linecap': 'round' })),
      svg('path', { d: outer, fill: 'black', filter: shapeGrain(0.38, 1.1, seed) }),
    ]),
  ]);
  el.prepend(shape);
  css(el, { width: w, height: h });

  const ink = (filled: number) =>
    mode === 'actions'
      ? `color-mix(in oklch, ${C.cream} ${Math.round(filled * 100)}%, ${C.onTonal})`
      : `color-mix(in oklch, ${C.onTonal} ${Math.round(filled * 100)}%, color-mix(in oklch, ${C.muted}, black 10%))`;

  /** How filled each segment is, 0 → 1 (its fill and its label's ink follow). */
  const setFilled = (i: number, p: number) => {
    fills[i].setAttribute('opacity', p.toFixed(3));
    segEls[i].el.style.color = ink(p);
  };
  /** Cross-fades a segment between its label states (k may be fractional). */
  const setState = (i: number, k: number) => {
    segEls[i].states.forEach((st, j) => {
      const a = Math.max(0, 1 - Math.abs(k - j));
      st.row.style.opacity = a.toFixed(3);
      st.row.style.transform = `translateY(${((j - k) * 10).toFixed(2)}px)`;
    });
  };
  segments.forEach((_, i) => {
    setFilled(i, mode === 'actions' && i === 0 ? 1 : 0);
    setState(i, 0);
  });
  /** Each segment's centre, in the bar's own 1× coordinates. */
  const centre = (i: number) => ({ x: lefts[i] + widths[i] / 2, y: h / 2 });
  return { el, w, h, setFilled, setState, centre, segments: segEls };
}

/** Modal: a chalked card-bg sheet with grain and a pen outline; no ✕. */
export function modalSheet(width: number, content: HTMLElement[], o: { seed?: number; pad?: string } = {}) {
  const seed = o.seed ?? 29;
  const inner = html('div', { class: 'sheet-content', style: { width, padding: o.pad ?? '32px 28px' } }, content);
  const el = html('div', { class: 'sheet', style: { width } }, [inner]);
  const { h } = measure(el);
  const d = wobRect(width, h, 26, seed, Math.min(width, h) * 0.025, { segmentsH: [3, 4], segmentsV: [5, 6], curve: 0.6, cornerJitter: 0.9, cornerOffset: 5 });
  const paper = face(d, width, h, { fill: C.cardBg, chalkSeed: seed + 1, grain: { opacity: 0.3, frequency: 0.88, seed } });
  const pen = face(d, width, h, { stroke: C.sheetPen, strokeWidth: INK });
  el.prepend(paper.el, pen.el);
  css(el, { height: h });
  return { el, w: width, h, inner, paper, pen };
}

/**
 * The page dimmed behind a dialog, kept to the demonstration: a light warm
 * shade fading out from the sheet's centre (cx, cy) in an ellipse rx × ry, so
 * it has no edge against the narration or the header. `set(p)` fades it 0 → 1.
 * Visibility and notes share it, so the film's two dialogs dim the page alike.
 */
export function scrim(cx: number, cy: number, rx = 760, ry = 560) {
  const mask = `radial-gradient(ellipse ${rx}px ${ry}px at ${cx}px ${cy}px, #000 70%, transparent 100%)`;
  const el = html('div', {
    class: 'abs',
    style: { left: 0, top: 0, width: 1920, height: 1080, background: 'oklch(30% 0.02 75 / 0.16)', maskImage: mask, webkitMaskImage: mask, pointerEvents: 'none' },
  });
  const set = (p: number) => place(el, { opacity: p });
  set(0);
  return { el, set };
}

/** ToggleSwitch: a wobbly track and knob; `on` 0 → 1 slides the knob and fills the track terracotta. */
export function toggle(seed = 57) {
  const track = wobRect(50, 28, 12.5, seed, 2.4, { curve: 2.8, segmentsH: 2, segmentsV: 1, cornerJitter: 2, cornerOffset: 1.4 });
  const knobD = wobCircle(10, 10, 10, seed + 5, { segments: 6, mag: 1, cpJitter: 0.5 });
  const trackPath = svg('path', { d: track, 'stroke-width': INK_LIGHT, 'stroke-linejoin': 'round' });
  const grain = svg('path', { d: track, fill: 'black', filter: shapeGrain(0.38, 1.1, 3) });
  const knobPath = svg('path', { d: knobD, fill: C.cream, 'stroke-width': INK_LIGHT });
  const knob = svg('g', {}, [knobPath]);
  const el = html('span', { class: 'toggle', style: { width: 50, height: 28 } }, [shapeSvg(50, 28, [trackPath, grain, knob])]);
  const set = (on: number) => {
    const fill = `color-mix(in oklch, ${C.terracotta} ${Math.round(on * 100)}%, ${C.creamDark})`;
    const ink = `color-mix(in oklch, color-mix(in oklch, ${C.terracotta}, black 25%) ${Math.round(on * 100)}%, ${C.muted})`;
    trackPath.setAttribute('fill', fill);
    trackPath.setAttribute('stroke', ink);
    knobPath.setAttribute('stroke', ink);
    knob.setAttribute('transform', `translate(${(4 + 22 * on).toFixed(2)},4)`);
  };
  set(0);
  return { el, set };
}

/** A chat bubble: a filled wobble, no pen line (bubble.ts). */
export function bubble(text: string, o: { own: boolean; maxWidth?: number; seedKey?: string; run?: BubbleRun; fill?: string }) {
  const words = html('div', { class: 'bubble-words', text });
  const el = html('div', { class: 'bubble', style: { maxWidth: o.maxWidth ?? 360 } }, [words]);
  const { w, h } = measure(el);
  css(el, { width: Math.ceil(w), height: h });
  const d = bubblePath(Math.ceil(w), h, seedFromId(o.seedKey ?? text.slice(0, 12), 7), { own: o.own, run: o.run });
  const f = face(d, Math.ceil(w), h, { fill: o.fill ?? (o.own ? C.bubbleMine : C.bubbleTheirs) });
  el.prepend(f.el);
  return { el, w: Math.ceil(w), h, face: f, words };
}

/** The tap of a finger: a soft disc that presses down and rings out. `press` 0 → 1 → 0, `ring` 0 → 1. */
export function tapMark() {
  const disc = html('div', { class: 'tap-disc' });
  const ring = html('div', { class: 'tap-ring' });
  const el = html('div', { class: 'tap' }, [ring, disc]);
  const set = (o: { x: number; y: number; opacity: number; press?: number; ring?: number }) => {
    place(el, { x: o.x, y: o.y, opacity: o.opacity });
    const p = o.press ?? 0;
    disc.style.transform = `translate(-50%, -50%) scale(${(1 - 0.22 * p).toFixed(3)})`;
    const r = o.ring ?? 0;
    ring.style.transform = `translate(-50%, -50%) scale(${(0.6 + 1.4 * r).toFixed(3)})`;
    ring.style.opacity = r > 0 && r < 1 ? (0.6 * (1 - r)).toFixed(3) : '0';
  };
  return { el, set };
}
