/**
 * Golden fixtures for the native geometry ports (S1).
 *
 * Runs every procedural shape function in src/lib/design over a seeded spread
 * of inputs — plus the exact parameter sets real components use — and writes
 * the TypeScript output to native/fixtures/geometry.json. The Swift and Kotlin
 * test suites read that same file and must reproduce every path to within
 * half a hundredth of a point (the TS output is itself rounded to 0.01).
 *
 *   npx tsx scripts/native/geometry-fixtures.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { makePrng, seedFromString } from '../../src/lib/design/prng';
import { autoCurve, autoMag, autoSegments } from '../../src/lib/design/wobAuto';
import { wobRect, type WobRectOpts } from '../../src/lib/design/wobRect';
import { wobCircle, type WobCircleOpts } from '../../src/lib/design/wobCircle';
import { wobLoop, type WobLoopOpts } from '../../src/lib/design/wobLoop';
import { wobTabRect, type WobTabRectOpts } from '../../src/lib/design/wobTabRect';
import { penWave, pointsToBezier, wavyLine, wavyPoints, wavyVertical } from '../../src/lib/design/wavyPath';
import { arrowHeadPath, organicEdgePath, rectAnchor, type RectLike } from '../../src/lib/design/edgePath';
import { dividerPath, rowBoundary, rowRegion } from '../../src/lib/design/rowMenu';

const OUT = resolve(__dirname, '../../native/fixtures/geometry.json');

// The fixture inputs come from the same PRNG the shapes use, so the file is
// reproducible byte for byte.
const rnd = makePrng(20260927);
const range = (lo: number, hi: number, dp = 1) => +(lo + rnd() * (hi - lo)).toFixed(dp);
const int = (lo: number, hi: number) => lo + Math.floor(rnd() * (hi - lo + 1));

type Case = { args: unknown[]; out: unknown };
const clean = <T extends object>(o: T): T =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;

// --- prng --------------------------------------------------------------------
const prngSeeds = [0, 1, 2, 3, 7, 42, 100, 999, 9973, 12345, 233279, 233280, 987654, -5, -10, -99999];
const prng: Case[] = prngSeeds.map((seed) => {
  const r = makePrng(seed);
  return { args: [seed], out: Array.from({ length: 12 }, () => r()) };
});

const strings = [
  '',
  'a',
  'resonance',
  'https://pub.example.r2.dev/image/alice/2026-09/1f0c3b9e.avif',
  '一場雨後的散步',
  '念誠',
  'emoji 🌧️🚶‍♀️ mixed',
  'x'.repeat(500),
  'card-embed:/card/first-coffee',
  'tw',
  'gb',
];
const seedFromStringCases: Case[] = strings.map((s) => ({ args: [s], out: seedFromString(s) }));

// --- wobAuto -----------------------------------------------------------------
const autoCases: Case[] = [];
for (let i = 0; i < 60; i++) {
  const w = range(8, 1200);
  const h = range(8, 900);
  autoCases.push({ args: [w, h], out: { segments: autoSegments(w), mag: autoMag(w, h), curve: autoCurve(w, h) } });
}

// --- wobRect -----------------------------------------------------------------
const wobRectCases: Case[] = [];
const addRect = (W: number, H: number, R: number, seed: number, mag?: number, opts?: WobRectOpts) =>
  wobRectCases.push({ args: [W, H, R, seed, mag ?? null, opts ?? null], out: wobRect(W, H, R, seed, mag, opts) });

// Real component parameter sets.
for (const [w, h] of [[150, 48], [212, 52], [96, 38]] as const) {
  addRect(w, h, 16, 3, Math.min(w, h) * 0.04, {
    segmentsH: [2, 3], segmentsV: 1, curve: 1.3, cornerJitter: 1.3, cornerOffset: Math.min(w, h) * 0.03,
  }); // OrganicButton
}
addRect(50, 28, 14, 9, 1.1, { curve: 1.5, segmentsH: [1, 2], segmentsV: [3, 4], cornerJitter: 0.6 }); // ToggleSwitch (before round 4)
// ToggleSwitch: the track for the seeds the apps use — publish 57, report 91,
// the notification switches 83 and 89, the default 9.
for (const seed of [9, 57, 83, 89, 91]) {
  addRect(50, 28, 12.5, seed, 2.4, { curve: 2.8, segmentsH: 2, segmentsV: 1, cornerJitter: 2, cornerOffset: 1.4 });
}
for (const [w, h, seed] of [[320, 420, 42], [680, 240, 7], [1080, 360, 11]] as const) {
  addRect(w, h, 22, seed, autoMag(w, h), { segmentsH: autoSegments(w), segmentsV: autoSegments(h), curve: autoCurve(w, h) }); // HandDrawnBorder
}
addRect(96, 96, 96 * 0.4, 70, 96 * 0.022, { segmentsH: 2, segmentsV: 2, curve: 1.2 }); // HandDrawnAvatar (approx.)
addRect(44, 44, 12, 21, 1.8, { segmentsH: 2, segmentsV: 2, curve: 1.3, cornerJitter: 1.4 }); // ThoughtMap handle
// Chat bubbles in a run: the corners facing a neighbour tucked, on the sender's side (cornerRadii, clockwise from top left).
for (const [w, h, radii, seed] of [
  [180, 44, [16, 16, 4, 16], 183], // your own, first of a run
  [240, 44, [16, 4, 4, 16], 512], // your own, middle
  [120, 44, [16, 4, 16, 16], 77], // your own, last
  [260, 96, [4, 16, 16, 4], 9001], // theirs, middle, two lines
] as const) {
  addRect(w, h, 16, seed, Math.min(2.6, h * 0.05), {
    curve: 1.3, cornerJitter: 1.6, cornerOffset: Math.min(w, h) * 0.04, segmentsH: 3, segmentsV: 1, cornerRadii: [...radii],
  });
}

// Seeded spread.
for (let i = 0; i < 220; i++) {
  const W = range(12, 1100);
  const H = range(12, 700);
  const R = range(0, Math.min(W, H) / 2);
  const seed = int(1, 9999);
  const mag = rnd() < 0.3 ? undefined : range(0, 6, 2);
  const seg = (): WobRectOpts['segmentsH'] =>
    rnd() < 0.3 ? undefined : rnd() < 0.5 ? int(0, 9) : ([int(1, 3), int(3, 7)] as [number, number]);
  const opts: WobRectOpts | undefined =
    rnd() < 0.15
      ? undefined
      : clean({
          curve: rnd() < 0.5 ? range(0.3, 2.2, 2) : undefined,
          cornerJitter: rnd() < 0.5 ? range(0, 2, 2) : undefined,
          cornerOffset: rnd() < 0.4 ? range(0, 12, 2) : undefined,
          segmentsH: seg(),
          segmentsV: seg(),
        });
  addRect(W, H, R, seed, mag, opts);
}

// --- wobCircle ---------------------------------------------------------------
const wobCircleCases: Case[] = [];
wobCircleCases.push({ args: [10, 10, 10, 14, { segments: 8, mag: 0.5, cpJitter: 0.3 }], out: wobCircle(10, 10, 10, 14, { segments: 8, mag: 0.5, cpJitter: 0.3 }) });
// ToggleSwitch's knob (seed + 5).
for (const seed of [14, 62, 88, 94, 96]) {
  wobCircleCases.push({ args: [10, 10, 10, seed, { segments: 6, mag: 1, cpJitter: 0.5 }], out: wobCircle(10, 10, 10, seed, { segments: 6, mag: 1, cpJitter: 0.5 }) });
}
for (let i = 0; i < 80; i++) {
  const r = range(2, 200);
  const cx = range(-50, 300);
  const cy = range(-50, 300);
  const seed = int(1, 9999);
  const opts: WobCircleOpts | undefined =
    rnd() < 0.2 ? undefined : clean({ segments: rnd() < 0.7 ? int(3, 16) : undefined, mag: rnd() < 0.7 ? range(0, 4, 2) : undefined, cpJitter: rnd() < 0.7 ? range(0, 1, 2) : undefined });
  wobCircleCases.push({ args: [cx, cy, r, seed, opts ?? null], out: wobCircle(cx, cy, r, seed, opts) });
}

// --- wobLoop -----------------------------------------------------------------
const wobLoopCases: Case[] = [];
for (const size of [24, 64, 120]) {
  const c = size / 2;
  const opts = { segments: 9, mag: size * 0.03, cpJitter: 0.7 };
  wobLoopCases.push({ args: [c, c, size * 0.34, size * 0.27, 7, opts], out: wobLoop(c, c, size * 0.34, size * 0.27, 7, opts) }); // SketchLoader
}
for (let i = 0; i < 40; i++) {
  const rA = range(4, 120);
  const rB = range(4, 120);
  const seed = int(1, 9999);
  const opts: WobLoopOpts | undefined =
    rnd() < 0.2 ? undefined : clean({ segments: rnd() < 0.7 ? int(3, 14) : undefined, mag: rnd() < 0.7 ? range(0, 4, 2) : undefined, cpJitter: rnd() < 0.7 ? range(0, 1, 2) : undefined, blend: rnd() < 0.5 ? range(0.02, 0.3, 2) : undefined });
  wobLoopCases.push({ args: [60, 60, rA, rB, seed, opts ?? null], out: wobLoop(60, 60, rA, rB, seed, opts) });
}

// --- wobTabRect --------------------------------------------------------------
const wobTabRectCases: Case[] = [];
wobTabRectCases.push({ args: [220, 132, 18, 92, 22, 5, { R: 18, tabR: 9, mag: 2.4, curve: 1 }], out: wobTabRect(220, 132, 18, 92, 22, 5, { R: 18, tabR: 9, mag: 2.4, curve: 1 }) });
for (let i = 0; i < 60; i++) {
  const W = range(80, 600);
  const H = range(40, 400);
  const tabW = range(20, W * 0.8);
  const tabX = range(0, W - tabW);
  const tabH = range(8, 40);
  const seed = int(1, 9999);
  const opts: WobTabRectOpts | undefined =
    rnd() < 0.2 ? undefined : clean({ R: rnd() < 0.6 ? range(4, 30) : undefined, tabR: rnd() < 0.6 ? range(2, 14) : undefined, mag: rnd() < 0.6 ? range(0, 5, 2) : undefined, curve: rnd() < 0.6 ? range(0.4, 2, 2) : undefined });
  wobTabRectCases.push({ args: [W, H, tabX, tabW, tabH, seed, opts ?? null], out: wobTabRect(W, H, tabX, tabW, tabH, seed, opts) });
}

// --- wavy paths --------------------------------------------------------------
const wavyLineCases: Case[] = [];
const wavyVerticalCases: Case[] = [];
const wavyPointsCases: Case[] = [];
for (const [W, seed, amp, steps] of [[200, 17, 1.4, 7], [100, 3, 1.6, 5], [260, 53, 1.3, 7]] as const) {
  wavyLineCases.push({ args: [W, seed, amp, steps], out: wavyLine(W, seed, amp, steps) });
}
for (let i = 0; i < 40; i++) {
  const W = range(10, 1500);
  const seed = int(1, 9999);
  const amp = range(0, 6, 2);
  const steps = int(1, 16);
  wavyLineCases.push({ args: [W, seed, amp, steps], out: wavyLine(W, seed, amp, steps) });
  wavyVerticalCases.push({ args: [W, seed, amp, steps], out: wavyVertical(W, seed, amp, steps) });
  const y0 = range(0, 90);
  const pts = wavyPoints(W, y0, amp, seed, steps);
  wavyPointsCases.push({ args: [W, y0, amp, seed, steps], out: { points: pts, bezier: pointsToBezier(pts) } });
}

const penWaveCases: Case[] = [];
for (const [W, seed, amp, half] of [[120, 17, 1.2, 4.5], [34, 3, 1.2, 4.5], [260, 53, 1.4, 5]] as const) {
  penWaveCases.push({ args: [W, seed, amp, half], out: penWave(W, seed, amp, half) });
}
for (let i = 0; i < 30; i++) {
  const W = range(4, 600);
  const seed = int(1, 9999);
  const amp = range(0, 3, 2);
  const half = range(2, 9, 2);
  penWaveCases.push({ args: [W, seed, amp, half], out: penWave(W, seed, amp, half) });
}

// --- thought-map edges -------------------------------------------------------
const rect = (): RectLike => ({ x: range(-400, 800), y: range(-400, 800), w: range(0, 260), h: range(0, 180) });
const edgeCases: Case[] = [];
const anchorCases: Case[] = [];
const arrowCases: Case[] = [];
for (let i = 0; i < 60; i++) {
  const a = rect();
  const b = rect();
  const seed = int(1, 9999);
  edgeCases.push({ args: [a, b, seed], out: organicEdgePath(a, b, seed) });
  const toward = { x: range(-600, 900), y: range(-600, 900) };
  anchorCases.push({ args: [a, toward], out: rectAnchor(a, toward) });
  const tip = { x: range(-200, 600), y: range(-200, 600) };
  const angle = range(-Math.PI, Math.PI, 4);
  const size = range(4, 20);
  arrowCases.push({ args: [tip, angle, size, seed], out: arrowHeadPath(tip, angle, size, seed) });
}

// --- organic menu rows -------------------------------------------------------
const rowCases: Case[] = [];
for (let i = 0; i < 30; i++) {
  const w = range(120, 420);
  const count = int(1, 6);
  const rowH = range(36, 56);
  const h = rowH * count;
  const pad = range(0, 12);
  const amp = range(0, 4, 2);
  const seed = int(1, 9999);
  const boundaries = Array.from({ length: count - 1 }, (_, k) => rowBoundary(rowH * (k + 1), w, seed + k * 7, amp, pad));
  rowCases.push({
    args: [w, h, count, rowH, pad, amp, seed],
    out: {
      boundaries,
      dividers: boundaries.map(dividerPath),
      regions: Array.from({ length: count }, (_, k) => rowRegion(k, count, boundaries, w, h, pad)),
    },
  });
}

const fixtures = {
  generatedBy: 'scripts/native/geometry-fixtures.ts',
  tolerance: 0.0051,
  prng,
  seedFromString: seedFromStringCases,
  wobAuto: autoCases,
  wobRect: wobRectCases,
  wobCircle: wobCircleCases,
  wobLoop: wobLoopCases,
  wobTabRect: wobTabRectCases,
  wavyLine: wavyLineCases,
  penWave: penWaveCases,
  wavyVertical: wavyVerticalCases,
  wavyPoints: wavyPointsCases,
  rectAnchor: anchorCases,
  organicEdgePath: edgeCases,
  arrowHeadPath: arrowCases,
  rowMenu: rowCases,
};

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(fixtures) + '\n');
const total = Object.values(fixtures).reduce<number>((n, v) => n + (Array.isArray(v) ? v.length : 0), 0);
console.log(`Wrote ${total} geometry cases → ${OUT}`);
