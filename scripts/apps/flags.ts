/**
 * The web's square flags (public/flags/*.svg, the ones SquareFlag crops) →
 * PNGs for the native apps' SquareFlag, so the three draw the same art.
 * 96px squares: the apps show them at 16–20pt, 3× at most. Run it when a
 * flag is added to public/flags (rarely; not part of `apps:generate`).
 *
 *   npx tsx scripts/apps/flags.ts
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import sharp from 'sharp';

const root = resolve(__dirname, '../..');
const source = resolve(root, 'public/flags');
const ios = resolve(root, 'apps/ios/Packages/DesignSystem/Sources/DesignSystem/Resources/Flags');
const android = resolve(root, 'apps/android/core/design/src/main/res/drawable-nodpi');
const SIZE = 96;

async function main() {
  mkdirSync(ios, { recursive: true });
  mkdirSync(android, { recursive: true });
  const codes = readdirSync(source)
    .filter((f) => /^[a-z]{2}\.svg$/.test(f))
    .map((f) => f.slice(0, 2))
    .sort();
  for (const code of codes) {
    // The vendored art reads its colours from CSS variables with fallbacks; a rasteriser has no CSS.
    const svg = readFileSync(resolve(source, `${code}.svg`), 'utf8').replace(/var\(--[\w-]+,\s*(#[0-9a-fA-F]{3,8})\)/g, '$1');
    const png = await sharp(Buffer.from(svg), { density: (72 * SIZE) / 512 })
      .resize(SIZE, SIZE)
      .png({ compressionLevel: 9 })
      .toBuffer();
    writeFileSync(resolve(ios, `flag-${code}.png`), png);
    writeFileSync(resolve(android, `flag_${code}.png`), png);
  }
  console.log(`${codes.length} flags → Swift + Kotlin (${codes.join(', ')})`);
}

void main();
