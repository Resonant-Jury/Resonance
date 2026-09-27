/**
 * SVG `feTurbulence`, ported from the reference implementation in the SVG 1.1
 * specification (§15.25), so native grain uses the *same* noise the browser
 * draws — not a look-alike. Includes stitchTiles and the fractalNoise /
 * turbulence modes, and returns RGBA exactly as the filter primitive does
 * (straight alpha, 0–255, values in the filter's working color space).
 */

const BSize = 0x100;
const BM = 0xff;
const PerlinN = 0x1000;
const RAND_m = 2147483647;
const RAND_a = 16807;
const RAND_q = 127773;
const RAND_r = 2836;

function setupSeed(seed: number): number {
  let s = seed;
  if (s <= 0) s = -(s % (RAND_m - 1)) + 1;
  if (s > RAND_m - 1) s = RAND_m - 1;
  return s;
}

function random(seed: number): number {
  // C `long` arithmetic; every intermediate fits a JS double exactly.
  let result = RAND_a * (seed % RAND_q) - RAND_r * Math.trunc(seed / RAND_q);
  if (result <= 0) result += RAND_m;
  return result;
}

interface Lattice {
  selector: Int32Array;
  gradient: Float64Array[][]; // [channel][index] → [gx, gy]
}

function init(seedIn: number): Lattice {
  const selector = new Int32Array(BSize + BSize + 2);
  const gradient: Float64Array[][] = Array.from({ length: 4 }, () =>
    Array.from({ length: BSize + BSize + 2 }, () => new Float64Array(2)),
  );
  let seed = setupSeed(seedIn);
  let i = 0;
  for (let k = 0; k < 4; k++) {
    for (i = 0; i < BSize; i++) {
      selector[i] = i;
      for (let j = 0; j < 2; j++) {
        seed = random(seed);
        gradient[k][i][j] = ((seed % (BSize + BSize)) - BSize) / BSize;
      }
      const g = gradient[k][i];
      const s = Math.sqrt(g[0] * g[0] + g[1] * g[1]);
      g[0] /= s;
      g[1] /= s;
    }
  }
  while (--i) {
    const k = selector[i];
    seed = random(seed);
    const j = seed % BSize;
    selector[i] = selector[j];
    selector[j] = k;
  }
  for (i = 0; i < BSize + 2; i++) {
    selector[BSize + i] = selector[i];
    for (let k = 0; k < 4; k++) {
      gradient[k][BSize + i][0] = gradient[k][i][0];
      gradient[k][BSize + i][1] = gradient[k][i][1];
    }
  }
  return { selector, gradient };
}

interface Stitch {
  width: number;
  height: number;
  wrapX: number;
  wrapY: number;
}

const sCurve = (t: number) => t * t * (3 - 2 * t);
const lerp = (t: number, a: number, b: number) => a + t * (b - a);

function noise2(L: Lattice, channel: number, vx: number, vy: number, stitch: Stitch | null): number {
  // The spec's sample code masks the lattice index *before* the stitch test,
  // which makes stitching a no-op (a known erratum); browsers (Skia, Gecko)
  // test the unmasked index, and so do we.
  let t = vx + PerlinN;
  let bx0 = Math.trunc(t);
  let bx1 = bx0 + 1;
  const rx0 = t - Math.trunc(t);
  const rx1 = rx0 - 1;
  t = vy + PerlinN;
  let by0 = Math.trunc(t);
  let by1 = by0 + 1;
  const ry0 = t - Math.trunc(t);
  const ry1 = ry0 - 1;
  if (stitch) {
    if (bx0 >= stitch.wrapX) bx0 -= stitch.width;
    if (bx1 >= stitch.wrapX) bx1 -= stitch.width;
    if (by0 >= stitch.wrapY) by0 -= stitch.height;
    if (by1 >= stitch.wrapY) by1 -= stitch.height;
  }
  bx0 &= BM;
  bx1 &= BM;
  by0 &= BM;
  by1 &= BM;
  const i = L.selector[bx0];
  const j = L.selector[bx1];
  const b00 = L.selector[i + by0];
  const b10 = L.selector[j + by0];
  const b01 = L.selector[i + by1];
  const b11 = L.selector[j + by1];
  const sx = sCurve(rx0);
  const sy = sCurve(ry0);
  const G = L.gradient[channel];
  let q = G[b00];
  let u = rx0 * q[0] + ry0 * q[1];
  q = G[b10];
  let v = rx1 * q[0] + ry0 * q[1];
  const a = lerp(sx, u, v);
  q = G[b01];
  u = rx0 * q[0] + ry1 * q[1];
  q = G[b11];
  v = rx1 * q[0] + ry1 * q[1];
  const b = lerp(sx, u, v);
  return lerp(sy, a, b);
}

export interface TurbulenceOptions {
  width: number;
  height: number;
  baseFrequencyX: number;
  baseFrequencyY?: number;
  numOctaves: number;
  seed: number;
  type: 'fractalNoise' | 'turbulence';
  stitchTiles: boolean;
  /** Tile origin (the filter region's x/y in user space). */
  tileX?: number;
  tileY?: number;
}

/** RGBA bytes, straight alpha, row-major — what feTurbulence produces per pixel center. */
export function turbulence(o: TurbulenceOptions): Uint8ClampedArray {
  const L = init(Math.round(o.seed));
  const out = new Uint8ClampedArray(o.width * o.height * 4);
  let fx = o.baseFrequencyX;
  let fy = o.baseFrequencyY ?? o.baseFrequencyX;
  const tileX = o.tileX ?? 0;
  const tileY = o.tileY ?? 0;
  const W = o.width;
  const H = o.height;
  let stitchBase: Stitch | null = null;
  if (o.stitchTiles) {
    if (fx !== 0) {
      const lo = Math.floor(W * fx) / W;
      const hi = Math.ceil(W * fx) / W;
      fx = fx / lo < hi / fx ? lo : hi;
    }
    if (fy !== 0) {
      const lo = Math.floor(H * fy) / H;
      const hi = Math.ceil(H * fy) / H;
      fy = fy / lo < hi / fy ? lo : hi;
    }
    const width = Math.trunc(W * fx + 0.5);
    const height = Math.trunc(H * fy + 0.5);
    stitchBase = {
      width,
      height,
      wrapX: Math.trunc(tileX * fx + PerlinN + width),
      wrapY: Math.trunc(tileY * fy + PerlinN + height),
    };
  }
  const fractal = o.type === 'fractalNoise';
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      // Sample at the pixel's position in user space (the filter region origin + pixel).
      const px = tileX + x;
      const py = tileY + y;
      for (let ch = 0; ch < 4; ch++) {
        const stitch = stitchBase ? { ...stitchBase } : null;
        let vx = px * fx;
        let vy = py * fy;
        let ratio = 1;
        let sum = 0;
        for (let oct = 0; oct < o.numOctaves; oct++) {
          const n = noise2(L, ch, vx, vy, stitch);
          sum += fractal ? n / ratio : Math.abs(n) / ratio;
          vx *= 2;
          vy *= 2;
          ratio *= 2;
          if (stitch) {
            stitch.width *= 2;
            stitch.wrapX = 2 * stitch.wrapX - PerlinN;
            stitch.height *= 2;
            stitch.wrapY = 2 * stitch.wrapY - PerlinN;
          }
        }
        const v = fractal ? (sum * 255 + 255) / 2 : sum * 255;
        out[(y * W + x) * 4 + ch] = Math.max(0, Math.min(255, v));
      }
    }
  }
  return out;
}

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toSrgb = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

/**
 * The ShapeGrain pipeline after feTurbulence: saturate(0) in linearRGB (the
 * default color-interpolation-filters), then back to sRGB for display.
 * Returns a gray+alpha tile (straight alpha); feFuncA's slope is applied by
 * the caller as layer opacity.
 */
export function grainTile(o: TurbulenceOptions): Uint8ClampedArray {
  const rgba = turbulence(o);
  const out = new Uint8ClampedArray(rgba.length);
  for (let i = 0; i < rgba.length; i += 4) {
    // The noise values are *already* linearRGB (they are generated in the
    // filter's working space), so no toLinear on them.
    const r = rgba[i] / 255;
    const g = rgba[i + 1] / 255;
    const b = rgba[i + 2] / 255;
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const gray = Math.round(toSrgb(lum) * 255);
    out[i] = out[i + 1] = out[i + 2] = gray;
    out[i + 3] = rgba[i + 3];
  }
  return out;
}

/**
 * GrainOverlay's output: black ink whose alpha is 1 − luminance of the noise
 * (computed on the linearRGB noise, as the filter does). Alpha is not a
 * colour, so no sRGB conversion; draw the tile at 2 × the overlay opacity.
 */
export function overlayTile(o: TurbulenceOptions): Uint8ClampedArray {
  const rgba = turbulence(o);
  const out = new Uint8ClampedArray(rgba.length);
  for (let i = 0; i < rgba.length; i += 4) {
    const lum = (0.2126 * rgba[i] + 0.7152 * rgba[i + 1] + 0.0722 * rgba[i + 2]) / 255;
    out[i + 3] = Math.round((1 - lum) * 255);
  }
  return out;
}

export { toLinear, toSrgb };
