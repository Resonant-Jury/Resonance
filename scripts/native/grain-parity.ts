/**
 * Compare the GPU grain probes (GrainParity on iOS / Android) with the TS
 * feTurbulence reference at the same parameters — ShapeGrain on a card:
 * frequency 0.85, 2 octaves, seed 3, a 128 × 128 pt/dp region at the
 * device's scale, sampled at device-pixel centres.
 *
 *   npx tsx scripts/native/grain-parity.ts <dir with grain-probe-2.png, grain-probe-3.png> [--scale 2.625]
 */
import { resolve } from 'node:path';
import sharp from 'sharp';
import { toSrgb, turbulence } from './turbulence';

const scaleArg = process.argv.indexOf('--scale');
const SCALE = scaleArg > 0 ? Number(process.argv[scaleArg + 1]) : 3;
const PX = Math.round(128 * SCALE);

async function main() {
  const dir = process.argv[2];
  if (!dir) throw new Error('usage: grain-parity.ts <dir>');
  const ref = turbulence({
    width: PX,
    height: PX,
    baseFrequencyX: 0.85 / SCALE,
    numOctaves: 2,
    seed: 3,
    type: 'fractalNoise',
    stitchTiles: true,
    tileX: 0.5, // pixel centres, in device pixels
    tileY: 0.5,
  });
  const expected = {
    2: (i: number) => {
      const lum = (0.2126 * ref[i] + 0.7152 * ref[i + 1] + 0.0722 * ref[i + 2]) / 255;
      return toSrgb(lum) * 255;
    },
    3: (i: number) => ref[i + 3],
  } as const;
  for (const mode of [2, 3] as const) {
    const { data, info } = await sharp(resolve(dir, `grain-probe-${mode}.png`)).raw().toBuffer({ resolveWithObject: true });
    if (info.width !== PX || info.height !== PX) throw new Error(`probe ${mode} is ${info.width}×${info.height}, want ${PX}²`);
    const hist = new Map<number, number>();
    let max = 0;
    let sum = 0;
    for (let p = 0; p < PX * PX; p++) {
      const got = data[p * info.channels];
      const want = expected[mode](p * 4);
      const d = Math.abs(got - want);
      const bucket = Math.min(3, Math.round(d));
      hist.set(bucket, (hist.get(bucket) ?? 0) + 1);
      max = Math.max(max, d);
      sum += d;
    }
    const pct = (b: number) => (((hist.get(b) ?? 0) / (PX * PX)) * 100).toFixed(2);
    console.log(
      `${mode === 2 ? 'luminance' : 'alpha    '}  mean |Δ| ${(sum / (PX * PX)).toFixed(3)}  max ${max.toFixed(2)}  ` +
        `(≈0: ${pct(0)}%  1: ${pct(1)}%  2: ${pct(2)}%  ≥3: ${pct(3)}% of pixels, in 8-bit levels)`,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
