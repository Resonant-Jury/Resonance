/**
 * Grain tiles for the native apps, rendered with the spec feTurbulence port
 * (./turbulence.ts) at the exact parameters the web uses, so native grain is
 * the same noise field — not a look-alike.
 *
 * Each tile covers TILE_PT × TILE_PT points and is rendered at 3× (device
 * pixels), sampling the noise in *point* space exactly like a browser at
 * devicePixelRatio 3 — the features keep their size instead of being
 * upscaled blocks. Stitched, so it repeats seamlessly.
 *
 *   npx tsx scripts/native/grain-tiles.ts
 */
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import sharp from 'sharp';
import { grainTile, overlayTile } from './turbulence';

const TILE_PT = 128;
const SCALE = 3;
const OUT = resolve(__dirname, '../../native/fixtures/grain');

const tiles = [
  // ShapeGrain on StoryCard fills: frequency 0.85, 2 octaves (opacity 0.3 applied at draw time).
  { name: 'grain-card', baseFrequency: 0.85, numOctaves: 2, seed: 3 },
  // ShapeGrain default / OrganicButton: frequency 1.1 (button) and 0.9 (default), 2 octaves.
  { name: 'grain-button', baseFrequency: 1.1, numOctaves: 2, seed: 3 },
  // GrainOverlay (card images, mobile card chrome): frequency 0.72, 4 octaves, seed 0.
  { name: 'grain-overlay', baseFrequency: 0.72, numOctaves: 4, seed: 0, overlay: true },
];

async function main() {
  mkdirSync(OUT, { recursive: true });
  for (const t of tiles) {
    const px = TILE_PT * SCALE;
    // Sampling point space at 1/SCALE steps == baseFrequency / SCALE per device pixel,
    // with the stitch tile still TILE_PT points wide.
    const render = 'overlay' in t ? overlayTile : grainTile;
    const rgba = render({
      width: px,
      height: px,
      baseFrequencyX: t.baseFrequency / SCALE,
      numOctaves: t.numOctaves,
      seed: t.seed,
      type: 'fractalNoise',
      stitchTiles: true,
    });
    const file = resolve(OUT, `${t.name}@${SCALE}x.png`);
    await sharp(Buffer.from(rgba.buffer), { raw: { width: px, height: px, channels: 4 } }).png().toFile(file);
    console.log(`${t.name}: ${px}×${px}px (${TILE_PT}pt @${SCALE}x) → ${file}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
