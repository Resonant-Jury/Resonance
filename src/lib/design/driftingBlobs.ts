/**
 * The landing hero's drifting blobs: a few soft coloured shapes that wander
 * slowly across the page, change shape as they go, leave by one side while
 * new ones come in by the other, and melt into one when two of them meet.
 *
 * Each blob is a little cluster of metaballs — a core and four lobes that
 * orbit and sway at their own slow pace, which is what keeps its outline
 * moving. The page draws the union of every lobe's field (one iso-line,
 * traced here by marching squares), so two blobs that come close grow a
 * neck between them on their own; once touching they are drawn together,
 * their colours blend from the point of contact, and when their centres all
 * but meet they become one blob of both their areas.
 *
 * Pure and DOM-free: `DriftingBlobs` runs it on a canvas, the tests run it in
 * node. Positions and sizes are CSS pixels, time is seconds.
 */
import { makePrng } from './prng';

/** The field value the outline is drawn at. */
export const ISO = 0.25;
/** How far a lobe's field reaches, in multiples of its own radius (where it alone meets ISO). */
const REACH = 1 / Math.sqrt(1 - Math.sqrt(ISO));
/** Two blobs start to merge once their centres are this close, in multiples of R₁ + R₂. */
const CONTACT = 1.02;
/** …and are one blob once this close. */
const FUSE = 0.1;
/** How fast a merging pair closes in: the gap shrinks by e every 1/APPROACH seconds. */
const APPROACH = 0.15;
/** Seconds a lobe takes to fade in or out (a fused blob trading its old lobes for new ones). */
const LOBE_FADE = 7;
/** The largest a merged blob grows to (on a wide page). */
const MAX_FUSED = 200;
/** Seconds for the hover darkening to come and go. */
const HOVER_EASE = 0.35;

export type Oklab = readonly [number, number, number];

/** A blob's colour: its ink, and how strongly it shows on the paper (the old blobs' opacity). */
export interface Paint {
  ink: Oklab;
  alpha: number;
}

export interface Lobe {
  /** Distance from the blob's centre and the angle it sits at (t = 0). */
  dist: number;
  angle: number;
  /** Radians per second it orbits at. */
  spin: number;
  /** How far, as a fraction of `dist`, it sways in and out, and over how many seconds. */
  sway: number;
  swayPeriod: number;
  phase: number;
  /** Its radius (where its field alone meets ISO). */
  r: number;
  /** 0–1, and which way it is fading: +1 in, −1 out, 0 settled. */
  w: number;
  fade: number;
  /** An offset from the centre that dies away — a fused blob's lobes start where they were. */
  sx: number;
  sy: number;
}

export interface Blob {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Its size: about the radius it shows, and √(its area / π) for merging. */
  R: number;
  paint: Paint;
  hover: number;
  lobes: Lobe[];
  /** The velocity it drifts at, and a slow up-and-down meander on top. */
  aim: { vx: number; vy: number };
  meander: { amp: number; period: number; phase: number };
}

interface Pair {
  a: number;
  b: number;
  /** Centre distance when they touched (their colour blend runs from here to FUSE). */
  contact: number;
}

export interface World {
  width: number;
  height: number;
  t: number;
  blobs: Blob[];
  pairs: Pair[];
  palette: Paint[];
  paper: Oklab;
  rand: () => number;
  nextId: number;
  /** How many blobs it keeps on the page (3 or 4, picked again after each arrival), and when the next may come. */
  population: number;
  spawnAt: number;
  retryAt: number;
  lastPaint: number;
  /** Ids of the blobs the pointer is over (a merging pair counts as one). */
  hovered: Set<number>;
}

export interface SeedBlob {
  x: number;
  y: number;
  R: number;
  paint: Paint;
  /** Direction of drift (any length); its speed is the world's. */
  drift: readonly [number, number];
}

export interface WorldOptions {
  width: number;
  height: number;
  seed: number;
  palette: Paint[];
  paper: Oklab;
  blobs?: SeedBlob[];
}

const TAU = Math.PI * 2;

/** Sizes and speeds shrink on a narrow page (a phone), down to 60 %. */
function scaleOf(width: number): number {
  return Math.min(1, Math.max(0.6, width / 1200));
}

function speedOf(world: World): number {
  return (9 + world.rand() * 7) * scaleOf(world.width);
}

function layout(R: number, rand: () => number, fadeIn: boolean): Lobe[] {
  const w = fadeIn ? 0 : 1;
  const fade = fadeIn ? 1 : 0;
  const lobes: Lobe[] = [
    { dist: 0, angle: 0, spin: 0, sway: 0, swayPeriod: 20, phase: rand() * TAU, r: 0.81 * R, w, fade, sx: 0, sy: 0 },
  ];
  const base = rand() * TAU;
  const turn = (rand() < 0.5 ? -1 : 1) * (0.025 + rand() * 0.03);
  for (let k = 0; k < 4; k++) {
    lobes.push({
      dist: R * (0.39 + rand() * 0.07),
      angle: base + (k * TAU) / 4 + (rand() - 0.5) * 0.6,
      spin: turn * (0.6 + rand() * 0.8),
      sway: 0.12 + rand() * 0.12,
      swayPeriod: 16 + rand() * 14,
      phase: rand() * TAU,
      r: R * (0.53 + rand() * 0.09),
      w,
      fade,
      sx: 0,
      sy: 0,
    });
  }
  return lobes;
}

function bounds(world: World, R: number): [number, number] {
  const { height: H } = world;
  // The page's next section starts straight below the hero, so a blob keeps
  // its body above that line; above, it may slip under the top of the page.
  const yMax = H - 1.05 * R - 0.05 * H;
  return [Math.min(0.1 * H, yMax), yMax];
}

function makeBlob(world: World, x: number, y: number, R: number, paint: Paint, aim: { vx: number; vy: number }): Blob {
  const r = world.rand;
  return {
    id: world.nextId++,
    x,
    y,
    vx: aim.vx,
    vy: aim.vy,
    R,
    paint,
    hover: 0,
    lobes: layout(R, r, false),
    aim,
    meander: { amp: 2 + r() * 2, period: 30 + r() * 30, phase: r() * TAU },
  };
}

export function createWorld(opts: WorldOptions): World {
  const world: World = {
    width: opts.width,
    height: opts.height,
    t: 0,
    blobs: [],
    pairs: [],
    palette: opts.palette,
    paper: opts.paper,
    rand: makePrng(opts.seed),
    nextId: 1,
    population: 4,
    spawnAt: 6,
    retryAt: 0,
    lastPaint: -1,
    hovered: new Set(),
  };
  for (const s of opts.blobs ?? []) {
    const len = Math.hypot(s.drift[0], s.drift[1]) || 1;
    const speed = speedOf(world);
    world.blobs.push(
      makeBlob(world, s.x, s.y, s.R, s.paint, { vx: (s.drift[0] / len) * speed, vy: (s.drift[1] / len) * speed }),
    );
  }
  return world;
}

/** Where a lobe is now, with its radius and weight. */
export function lobeAt(blob: Blob, l: Lobe, t: number): { x: number; y: number; r: number; w: number } {
  const a = l.angle + l.spin * t;
  const d = l.dist * (1 + l.sway * Math.sin((TAU * t) / l.swayPeriod + l.phase));
  const r = l.r * (1 + 0.035 * Math.sin((TAU * t) / (l.swayPeriod * 1.3) + l.phase * 1.7));
  const w = l.w * l.w * (3 - 2 * l.w);
  return { x: blob.x + l.sx + Math.cos(a) * d, y: blob.y + l.sy + Math.sin(a) * d, r, w };
}

function kernel(dx: number, dy: number, r: number, w: number): number {
  const rho = r * REACH;
  const u = (dx * dx + dy * dy) / (rho * rho);
  if (u >= 1) return 0;
  return w * (1 - u) * (1 - u);
}

function smoothstep(x: number): number {
  const c = Math.min(1, Math.max(0, x));
  return c * c * (3 - 2 * c);
}

function mix(a: Oklab, b: Oklab, t: number): Oklab {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/**
 * Blends colours keeping their chroma: lightness and chroma are averaged,
 * the hue as a direction. A plain Oklab mix of two far-apart hues (lavender
 * and sage) cancels to grey; this one passes round the hue circle instead.
 */
export function blend(colours: readonly Oklab[], weights: readonly number[]): Oklab {
  let sw = 0;
  let L = 0;
  let C = 0;
  let a = 0;
  let b = 0;
  for (let i = 0; i < colours.length; i++) {
    const w = weights[i];
    const [l, ca, cb] = colours[i];
    const c = Math.hypot(ca, cb);
    sw += w;
    L += w * l;
    C += w * c;
    if (c > 1e-6) {
      a += (w * ca) / c;
      b += (w * cb) / c;
    }
  }
  if (sw <= 0) return colours[0];
  const len = Math.hypot(a, b);
  if (len < 1e-9) return [L / sw, 0, 0];
  const chroma = C / sw;
  return [L / sw, (a / len) * chroma, (b / len) * chroma];
}

function mixHue(x: Oklab, y: Oklab, t: number): Oklab {
  return blend([x, y], [1 - t, t]);
}

function mass(b: Blob): number {
  return b.R * b.R;
}

function byId(world: World, id: number): Blob | undefined {
  return world.blobs.find((b) => b.id === id);
}

function fuse(world: World, A: Blob, B: Blob): Blob {
  const mA = mass(A);
  const mB = mass(B);
  const k = mB / (mA + mB);
  // Both their areas, but never a giant parked behind the page's words.
  const R = Math.max(Math.max(A.R, B.R) * 1.05, Math.min(Math.sqrt(mA + mB), MAX_FUSED * scaleOf(world.width)));
  const x = A.x + (B.x - A.x) * k;
  const y = A.y + (B.y - A.y) * k;
  // The old lobes stay where they are and fade out; a fresh set the size of
  // both fades in round the new centre — the merged shape settles and swells
  // to the area of the two.
  const lobes: Lobe[] = [];
  for (const src of [A, B]) {
    for (const l of src.lobes) {
      lobes.push({ ...l, sx: l.sx + src.x - x, sy: l.sy + src.y - y, fade: -1 });
    }
  }
  lobes.push(...layout(R, world.rand, true));
  const aim = { vx: A.aim.vx + (B.aim.vx - A.aim.vx) * k, vy: A.aim.vy + (B.aim.vy - A.aim.vy) * k };
  // Never left standing still: it keeps drifting the way it was going, to leave in time.
  const minVx = 5 * scaleOf(world.width);
  if (Math.abs(aim.vx) < minVx) aim.vx = (aim.vx < 0 ? -1 : aim.vx > 0 ? 1 : x < world.width / 2 ? -1 : 1) * minVx;
  return {
    id: world.nextId++,
    x,
    y,
    vx: A.vx + (B.vx - A.vx) * k,
    vy: A.vy + (B.vy - A.vy) * k,
    R,
    paint: { ink: mixHue(A.paint.ink, B.paint.ink, k), alpha: A.paint.alpha + (B.paint.alpha - A.paint.alpha) * k },
    hover: Math.max(A.hover, B.hover),
    lobes,
    aim,
    meander: A.meander,
  };
}

function spawn(world: World): boolean {
  const { width: W, rand: r } = world;
  const scale = scaleOf(W);
  const R = (70 + r() * 95) * scale;
  const left = world.blobs.filter((b) => b.x < W / 2).length;
  const right = world.blobs.length - left;
  const fromLeft = left === right ? r() < 0.5 : left < right;
  const x = fromLeft ? -R * 1.1 : W + R * 1.1;
  const [yMin, yMax] = bounds(world, R);
  const y = yMin + r() * (yMax - yMin);
  for (const b of world.blobs) {
    if (Math.hypot(b.x - x, b.y - y) < (b.R + R) * 1.15) return false;
  }
  // Headed for somewhere in the middle of the page, so it crosses it.
  const tx = W * (0.35 + r() * 0.3);
  const ty = yMin + r() * (yMax - yMin);
  const len = Math.hypot(tx - x, ty - y) || 1;
  const speed = speedOf(world);
  let pick = Math.floor(r() * world.palette.length);
  if (pick === world.lastPaint && world.palette.length > 1) pick = (pick + 1) % world.palette.length;
  world.lastPaint = pick;
  const paint = world.palette[pick];
  world.blobs.push(makeBlob(world, x, y, R, paint, { vx: ((tx - x) / len) * speed, vy: ((ty - y) / len) * speed }));
  return true;
}

function gone(world: World, b: Blob): boolean {
  const margin = b.R * 1.3;
  if (b.x < -3 * b.R - margin || b.x > world.width + 3 * b.R + margin) return true;
  return (b.aim.vx < 0 && b.x < -margin) || (b.aim.vx > 0 && b.x > world.width + margin);
}

/** Moves the world on by `dt` seconds (a long gap — a tab coming back — counts as a tenth). */
export function step(world: World, dt: number): void {
  dt = Math.min(Math.max(dt, 0), 0.1);
  world.t += dt;
  const t = world.t;

  for (const b of world.blobs) {
    for (const l of b.lobes) {
      if (l.fade) l.w = Math.min(1, Math.max(0, l.w + (l.fade * dt) / LOBE_FADE));
      if (l.fade > 0 && l.w >= 1) l.fade = 0;
      const decay = Math.exp(-dt / 3);
      l.sx *= decay;
      l.sy *= decay;
    }
    b.lobes = b.lobes.filter((l) => !(l.fade < 0 && l.w <= 0));

    // Past a bound it turns back: its drift is reflected and it is drawn in.
    const [yMin, yMax] = bounds(world, b.R);
    if (b.y > yMax) b.aim.vy = -Math.abs(b.aim.vy);
    else if (b.y < yMin) b.aim.vy = Math.abs(b.aim.vy);
    const dvx = b.aim.vx;
    let dvy = b.aim.vy + b.meander.amp * Math.sin((TAU * t) / b.meander.period + b.meander.phase);
    if (b.y > yMax - 0.1 * b.R) dvy -= (b.y - yMax + 0.1 * b.R) * 0.2;
    else if (b.y < yMin) dvy += (yMin - b.y) * 0.2;
    const ease = 1 - Math.exp(-dt / 4);
    b.vx += (dvx - b.vx) * ease;
    b.vy += (dvy - b.vy) * ease;

    const target = world.hovered.has(b.id) ? 1 : 0;
    b.hover += (target - b.hover) * (1 - Math.exp(-dt / HOVER_EASE));
  }

  // Blobs that touch start to merge, and from then on move as one.
  const blobs = world.blobs;
  for (let i = 0; i < blobs.length; i++) {
    for (let j = i + 1; j < blobs.length; j++) {
      const A = blobs[i];
      const B = blobs[j];
      if (world.pairs.some((p) => (p.a === A.id && p.b === B.id) || (p.a === B.id && p.b === A.id))) continue;
      const d = Math.hypot(B.x - A.x, B.y - A.y);
      if (d < CONTACT * (A.R + B.R)) {
        world.pairs.push({ a: A.id, b: B.id, contact: d });
        const k = mass(B) / (mass(A) + mass(B));
        const aim = { vx: A.aim.vx + (B.aim.vx - A.aim.vx) * k, vy: A.aim.vy + (B.aim.vy - A.aim.vy) * k };
        A.aim = aim;
        B.aim = { ...aim };
        B.meander = A.meander;
      }
    }
  }
  for (const p of world.pairs) {
    const A = byId(world, p.a);
    const B = byId(world, p.b);
    if (!A || !B) continue;
    const mA = mass(A);
    const mB = mass(B);
    const k = mB / (mA + mB);
    const vx = A.vx + (B.vx - A.vx) * k;
    const vy = A.vy + (B.vy - A.vy) * k;
    const ease = 1 - Math.exp(-dt / 2);
    A.vx += (vx - A.vx) * ease;
    A.vy += (vy - A.vy) * ease;
    B.vx += (vx - B.vx) * ease;
    B.vy += (vy - B.vy) * ease;
    const dx = B.x - A.x;
    const dy = B.y - A.y;
    const close = 1 - Math.exp(-APPROACH * dt);
    A.x += dx * close * k;
    A.y += dy * close * k;
    B.x -= dx * close * (1 - k);
    B.y -= dy * close * (1 - k);
  }

  for (const b of blobs) {
    b.x += b.vx * dt;
    b.y += b.vy * dt;
  }

  for (const p of [...world.pairs]) {
    const A = byId(world, p.a);
    const B = byId(world, p.b);
    if (!A || !B) continue;
    if (Math.hypot(B.x - A.x, B.y - A.y) >= FUSE * (A.R + B.R)) continue;
    const C = fuse(world, A, B);
    world.blobs = world.blobs.filter((b) => b !== A && b !== B);
    world.blobs.push(C);
    if (world.hovered.has(A.id) || world.hovered.has(B.id)) world.hovered.add(C.id);
    const pairs: Pair[] = [];
    for (const q of world.pairs) {
      if (q === p) continue;
      const a = q.a === A.id || q.a === B.id ? C.id : q.a;
      const b = q.b === A.id || q.b === B.id ? C.id : q.b;
      if (a === b || pairs.some((o) => (o.a === a && o.b === b) || (o.a === b && o.b === a))) continue;
      const other = byId(world, a === C.id ? b : a);
      const d = other ? Math.hypot(other.x - C.x, other.y - C.y) : 0;
      pairs.push({ a, b, contact: Math.max(q.contact, d + 1) });
    }
    world.pairs = pairs;
  }

  const before = world.blobs.length;
  world.blobs = world.blobs.filter((b) => !gone(world, b));
  if (world.blobs.length !== before) {
    const ids = new Set(world.blobs.map((b) => b.id));
    world.pairs = world.pairs.filter((p) => ids.has(p.a) && ids.has(p.b));
  }
  // Below three a newcomer is sent at once (as soon as there is room at an
  // edge); a fourth waits its turn.
  const n = world.blobs.length;
  if (n < world.population && (t >= world.spawnAt || (n < 3 && t >= world.retryAt))) {
    if (spawn(world)) {
      world.spawnAt = t + 6 + world.rand() * 10;
      world.population = world.rand() < 0.5 ? 3 : 4;
    } else {
      world.retryAt = t + 1;
    }
  }
}

/** The blob under a point (inside the drawn outline), with the ones it is merging with; empty when none. */
export function blobsAt(world: World, x: number, y: number): Set<number> {
  let total = 0;
  let best: Blob | null = null;
  let bestF = 0;
  for (const b of world.blobs) {
    let f = 0;
    for (const l of b.lobes) {
      const p = lobeAt(b, l, world.t);
      f += kernel(x - p.x, y - p.y, p.r, p.w);
    }
    total += f;
    if (f > bestF) {
      bestF = f;
      best = b;
    }
  }
  const out = new Set<number>();
  if (!best || total < ISO) return out;
  out.add(best.id);
  // A merging pair reads as one shape, so it darkens as one.
  for (let grew = true; grew; ) {
    grew = false;
    for (const p of world.pairs) {
      if (out.has(p.a) !== out.has(p.b)) {
        out.add(p.a);
        out.add(p.b);
        grew = true;
      }
    }
  }
  return out;
}

// ── the field and its outline ──────────────────────────────────────────

export interface Grid {
  cell: number;
  /** Position of the first sample (one cell outside the page, so every outline closes off-page). */
  x0: number;
  y0: number;
  nx: number;
  ny: number;
  v: Float32Array;
}

export function makeGrid(width: number, height: number, cell: number): Grid {
  const nx = Math.ceil((width + 2 * cell) / cell) + 1;
  const ny = Math.ceil((height + 2 * cell) / cell) + 1;
  return { cell, x0: -cell, y0: -cell, nx, ny, v: new Float32Array(nx * ny) };
}

/** Sums every lobe's field into the grid; the outer ring of samples stays 0. */
export function sampleField(world: World, g: Grid): void {
  const { v, nx, ny, cell, x0, y0 } = g;
  v.fill(0);
  for (const b of world.blobs) {
    for (const l of b.lobes) {
      const p = lobeAt(b, l, world.t);
      if (p.w <= 0) continue;
      const rho = p.r * REACH;
      const i0 = Math.max(1, Math.ceil((p.x - rho - x0) / cell));
      const i1 = Math.min(nx - 2, Math.floor((p.x + rho - x0) / cell));
      const j0 = Math.max(1, Math.ceil((p.y - rho - y0) / cell));
      const j1 = Math.min(ny - 2, Math.floor((p.y + rho - y0) / cell));
      const inv = 1 / (rho * rho);
      for (let j = j0; j <= j1; j++) {
        const dy = y0 + j * cell - p.y;
        const dy2 = dy * dy;
        const row = j * nx;
        for (let i = i0; i <= i1; i++) {
          const dx = x0 + i * cell - p.x;
          const u = (dx * dx + dy2) * inv;
          if (u < 1) v[row + i] += p.w * (1 - u) * (1 - u);
        }
      }
    }
  }
}

/**
 * The outline at `iso`, as closed loops of points ([x0, y0, x1, y1, …]),
 * by marching squares with each crossing interpolated along its cell edge.
 */
export function traceContours(g: Grid, iso = ISO): number[][] {
  const { v, nx, ny, cell, x0, y0 } = g;
  // Edge ids: 2·(j·nx + i) runs right from sample (i, j), +1 runs down from it.
  const links = new Int32Array(nx * ny * 4).fill(-1);
  const link = (a: number, b: number) => {
    links[a * 2 + (links[a * 2] === -1 ? 0 : 1)] = b;
    links[b * 2 + (links[b * 2] === -1 ? 0 : 1)] = a;
  };
  let any = false;
  for (let j = 0; j < ny - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const tl = v[j * nx + i];
      const tr = v[j * nx + i + 1];
      const br = v[(j + 1) * nx + i + 1];
      const bl = v[(j + 1) * nx + i];
      const code = (tl >= iso ? 1 : 0) | (tr >= iso ? 2 : 0) | (br >= iso ? 4 : 0) | (bl >= iso ? 8 : 0);
      if (code === 0 || code === 15) continue;
      any = true;
      const T = (j * nx + i) * 2;
      const B = ((j + 1) * nx + i) * 2;
      const L = (j * nx + i) * 2 + 1;
      const R = (j * nx + i + 1) * 2 + 1;
      switch (code) {
        case 1: case 14: link(L, T); break;
        case 2: case 13: link(T, R); break;
        case 3: case 12: link(L, R); break;
        case 4: case 11: link(R, B); break;
        case 6: case 9: link(T, B); break;
        case 7: case 8: link(L, B); break;
        case 5:
          if ((tl + tr + br + bl) / 4 >= iso) { link(T, R); link(B, L); } else { link(L, T); link(R, B); }
          break;
        case 10:
          if ((tl + tr + br + bl) / 4 >= iso) { link(L, T); link(R, B); } else { link(T, R); link(B, L); }
          break;
      }
    }
  }
  if (!any) return [];
  const point = (e: number, out: number[]) => {
    const s = e >> 1;
    const i = s % nx;
    const j = (s - i) / nx;
    const a = v[s];
    const down = e & 1;
    const b = down ? v[s + nx] : v[s + 1];
    const f = b === a ? 0.5 : (iso - a) / (b - a);
    out.push(x0 + (i + (down ? 0 : f)) * cell, y0 + (j + (down ? f : 0)) * cell);
  };
  const seen = new Uint8Array(nx * ny * 2);
  const loops: number[][] = [];
  for (let e = 0; e < nx * ny * 2; e++) {
    if (links[e * 2] === -1 || seen[e]) continue;
    const loop: number[] = [];
    let prev = -1;
    let cur = e;
    while (cur !== -1 && !seen[cur]) {
      seen[cur] = 1;
      point(cur, loop);
      const n0 = links[cur * 2];
      const next = n0 !== prev ? n0 : links[cur * 2 + 1];
      prev = cur;
      cur = next;
    }
    if (loop.length >= 6) loops.push(loop);
  }
  return loops;
}

// ── colour ─────────────────────────────────────────────────────────────

/** `oklch(78% 0.07 140)` (as tokens.css writes them) → Oklab, or null. */
export function parseOklch(css: string): Oklab | null {
  const m = /oklch\(\s*([\d.]+)(%?)\s+([\d.]+)\s+([\d.]+)/.exec(css);
  if (!m) return null;
  const L = Number(m[1]) / (m[2] ? 100 : 1);
  const C = Number(m[3]);
  const h = (Number(m[4]) * Math.PI) / 180;
  return [L, C * Math.cos(h), C * Math.sin(h)];
}

/** Oklab → sRGB, 0–255 each (clamped). */
export function oklabToRgb([L, a, b]: Oklab): [number, number, number] {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const lin = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  return lin.map((c) => {
    const x = Math.min(1, Math.max(0, c));
    return Math.round(255 * (x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055));
  }) as [number, number, number];
}

/**
 * Each blob's colour as drawn now: its ink laid on the paper at its alpha,
 * a little deeper while hovered, and — while merging — already part way to
 * the colour the two will share.
 */
export function blobColours(world: World): Map<number, Oklab> {
  const paints = new Map<number, Paint>();
  for (const b of world.blobs) paints.set(b.id, b.paint);
  for (const p of world.pairs) {
    const A = byId(world, p.a);
    const B = byId(world, p.b);
    if (!A || !B) continue;
    const k = mass(B) / (mass(A) + mass(B));
    const fuseAt = FUSE * (A.R + B.R);
    const s = smoothstep((p.contact - Math.hypot(B.x - A.x, B.y - A.y)) / Math.max(1, p.contact - fuseAt));
    const pa = paints.get(A.id)!;
    const pb = paints.get(B.id)!;
    const ink = mixHue(pa.ink, pb.ink, k);
    const alpha = pa.alpha + (pb.alpha - pa.alpha) * k;
    paints.set(A.id, { ink: mixHue(pa.ink, ink, s), alpha: pa.alpha + (alpha - pa.alpha) * s });
    paints.set(B.id, { ink: mixHue(pb.ink, ink, s), alpha: pb.alpha + (alpha - pb.alpha) * s });
  }
  const out = new Map<number, Oklab>();
  for (const b of world.blobs) {
    const p = paints.get(b.id)!;
    const alpha = Math.min(1, p.alpha * (1 + 0.45 * b.hover));
    const lab = mix(world.paper, p.ink, alpha);
    out.set(b.id, [lab[0] - 0.025 * b.hover, lab[1], lab[2]]);
  }
  return out;
}

/**
 * Paints the colour of the page at each sample of a coarse grid into `rgba`
 * (row-major, `g.nx × g.ny`): every blob's colour, weighted by how near it
 * is, so one blob is one flat colour and two meeting ones blend across the
 * neck between them. Drawn smoothed and clipped to the outline.
 */
export function paintColours(world: World, g: Grid, rgba: Uint8ClampedArray): void {
  const colours = blobColours(world);
  const list = world.blobs.map((b) => ({ x: b.x, y: b.y, R2: b.R * b.R, c: colours.get(b.id)! }));
  const cs = list.map((b) => b.c);
  const ws = list.map(() => 0);
  for (let j = 0; j < g.ny; j++) {
    const y = g.y0 + j * g.cell;
    for (let i = 0; i < g.nx; i++) {
      const x = g.x0 + i * g.cell;
      for (let n = 0; n < list.length; n++) {
        const b = list[n];
        const q = b.R2 / ((x - b.x) ** 2 + (y - b.y) ** 2 + 1e-3 * b.R2);
        ws[n] = q * q * q;
      }
      const o = (j * g.nx + i) * 4;
      if (list.length) {
        const [r, gr, bl] = oklabToRgb(list.length === 1 ? cs[0] : blend(cs, ws));
        rgba[o] = r;
        rgba[o + 1] = gr;
        rgba[o + 2] = bl;
      }
      rgba[o + 3] = 255;
    }
  }
}
