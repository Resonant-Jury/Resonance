import { describe, expect, it } from 'vitest';
import {
  type Oklab,
  type Paint,
  type World,
  blend,
  blobColours,
  blobsAt,
  createWorld,
  makeGrid,
  parseOklch,
  sampleField,
  step,
  traceContours,
} from './driftingBlobs';

const PAPER = parseOklch('oklch(96.5% 0.015 75)')!;
const LAVENDER: Paint = { ink: parseOklch('oklch(80% 0.07 290)')!, alpha: 0.25 };
const SAGE: Paint = { ink: parseOklch('oklch(78% 0.07 140)')!, alpha: 0.25 };
const W = 1440;
const H = 900;

function outline(world: World) {
  const g = makeGrid(world.width, world.height, 6);
  sampleField(world, g);
  return traceContours(g);
}

function area(loops: number[][]): number {
  let sum = 0;
  for (const l of loops) {
    let a = 0;
    for (let i = 0; i < l.length; i += 2) {
      const j = (i + 2) % l.length;
      a += l[i] * l[j + 1] - l[j] * l[i + 1];
    }
    sum += Math.abs(a / 2);
  }
  return sum;
}

function run(world: World, seconds: number, each?: (w: World) => void) {
  for (let s = 0; s < seconds; s += 0.1) {
    step(world, 0.1);
    each?.(world);
  }
}

function chroma(c: Oklab): number {
  return Math.hypot(c[1], c[2]);
}

describe('drifting blobs', () => {
  it('draws a lone blob as one closed outline about its size, whose shape keeps changing', () => {
    const world = createWorld({
      width: W, height: H, seed: 3, palette: [SAGE], paper: PAPER,
      blobs: [{ x: 500, y: 450, R: 150, paint: SAGE, drift: [1, 0] }],
    });
    world.population = 1;
    const first = outline(world);
    expect(first).toHaveLength(1);
    const b = world.blobs[0];
    const radii = (loop: number[]) =>
      Array.from({ length: loop.length / 2 }, (_, i) => Math.hypot(loop[2 * i] - b.x, loop[2 * i + 1] - b.y));
    for (const r of radii(first[0])) {
      expect(r).toBeGreaterThan(0.75 * 150);
      expect(r).toBeLessThan(1.2 * 150);
    }
    // Its area is that of a disc of radius R, give or take.
    expect(Math.sqrt(area(first) / Math.PI)).toBeCloseTo(150, -1);

    run(world, 15);
    const later = outline(world);
    expect(later).toHaveLength(1);
    const spread = (loop: number[]) => {
      const r = radii(loop);
      return Math.max(...r) - Math.min(...r);
    };
    // Same blob, a different silhouette.
    expect(Math.abs(spread(later[0]) - spread(first[0])) + Math.abs(area(later) - area(first))).toBeGreaterThan(1);
  });

  it('melts two blobs that meet into one, joined by a neck first, keeping their area and their colour', () => {
    const world = createWorld({
      width: W, height: H, seed: 11, palette: [LAVENDER], paper: PAPER,
      blobs: [
        { x: 420, y: 450, R: 120, paint: LAVENDER, drift: [1, 0] },
        { x: 1020, y: 450, R: 100, paint: SAGE, drift: [-1, 0] },
      ],
    });
    world.population = 2;
    world.spawnAt = Infinity;
    world.retryAt = Infinity;
    const [a, b] = world.blobs.map((x) => x.id);
    expect(outline(world)).toHaveLength(2);

    let joined = false;
    let lastArea = area(outline(world));
    let fusedAt = -1;
    run(world, 120, (w) => {
      const loops = outline(w);
      if (w.blobs.length === 2 && w.pairs.length && loops.length === 1) joined = true;
      const now = area(loops);
      if (fusedAt < 0 && w.blobs.length === 1) {
        fusedAt = w.t;
        // Becoming one blob is seamless: the outline doesn't jump.
        expect(Math.abs(now - lastArea) / lastArea).toBeLessThan(0.03);
      }
      lastArea = now;
    });
    expect(joined).toBe(true);
    expect(fusedAt).toBeGreaterThan(0);

    const [merged] = world.blobs;
    expect([a, b]).not.toContain(merged.id);
    expect(merged.R).toBeCloseTo(Math.hypot(120, 100), 5);
    // Settled, it shows the area of both.
    expect(Math.sqrt(area(outline(world)) / Math.PI)).toBeGreaterThan(0.9 * merged.R);
    // Lavender and sage make a colour, not grey.
    expect(chroma(merged.paint.ink)).toBeGreaterThan(0.06);
    expect(merged.lobes.every((l) => l.fade >= 0)).toBe(true);
  });

  it('blends colours round the hue circle instead of through grey', () => {
    const mid = blend([LAVENDER.ink, SAGE.ink], [1, 1]);
    expect(chroma(mid)).toBeCloseTo(0.07, 5);
    expect(mid[0]).toBeCloseTo(0.79, 5);
    const colours = blobColours(
      createWorld({ width: W, height: H, seed: 1, palette: [SAGE], paper: PAPER, blobs: [{ x: 700, y: 400, R: 100, paint: SAGE, drift: [1, 0] }] }),
    );
    // A blob is its ink laid on the paper at its alpha.
    expect([...colours.values()][0][0]).toBeCloseTo(PAPER[0] + (SAGE.ink[0] - PAPER[0]) * 0.25, 5);
  });

  it('keeps three or four blobs about, sending them off one side and new ones in, inside the hero', () => {
    const world = createWorld({
      width: W, height: H, seed: 29, palette: [LAVENDER, SAGE], paper: PAPER,
      blobs: [
        { x: 200, y: 260, R: 160, paint: LAVENDER, drift: [1, 0.1] },
        { x: 1200, y: 600, R: 120, paint: SAGE, drift: [-1, 0] },
      ],
    });
    let most = 0;
    let lowest = 0;
    const seen = new Set<number>();
    run(world, 900, (w) => {
      most = Math.max(most, w.blobs.length);
      for (const b of w.blobs) {
        seen.add(b.id);
        if (b.x > 0 && b.x < W) lowest = Math.max(lowest, b.y + 0.95 * b.R);
      }
    });
    expect(most).toBeLessThanOrEqual(4);
    expect(world.blobs.length).toBeGreaterThanOrEqual(2);
    expect(seen.size).toBeGreaterThan(8);
    expect(world.blobs.some((b) => b.id <= 2)).toBe(false);
    // A blob's body never crosses the hero's bottom into the next section.
    expect(lowest).toBeLessThanOrEqual(H - 0.05 * H);
  });

  it('finds the blob under the pointer, with whatever it is melting into', () => {
    const world = createWorld({
      width: W, height: H, seed: 5, palette: [SAGE], paper: PAPER,
      blobs: [
        { x: 300, y: 400, R: 100, paint: SAGE, drift: [1, 0] },
        { x: 480, y: 400, R: 100, paint: LAVENDER, drift: [-1, 0] },
        { x: 1100, y: 400, R: 100, paint: SAGE, drift: [1, 0] },
      ],
    });
    expect([...blobsAt(world, 1100, 400)]).toEqual([world.blobs[2].id]);
    expect(blobsAt(world, 800, 150).size).toBe(0);
    step(world, 0.1);
    expect([...blobsAt(world, 300, 400)].sort()).toEqual([world.blobs[0].id, world.blobs[1].id].sort());
  });
});
