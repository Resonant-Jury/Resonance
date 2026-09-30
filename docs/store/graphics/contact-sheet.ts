/**
 * One review image of everything that goes to the stores: the iOS row, the
 * Android row, then the Play feature graphic and icon.
 *
 *   npx tsx docs/store/graphics/contact-sheet.ts      → out/contact-sheet.jpg
 *
 * Reads out/ (run render.ts first). Review only — this file is not uploaded.
 */
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { OUT } from './lib';

const KEYS = ['feed', 'card', 'write', 'resonance', 'messages', 'thoughtmap'] as const;
const GAP = 28;
const LABEL = 44;
const ROW_H = 460;
const BG = '#e9e2d6';

const shot = (platform: 'ios' | 'android', i: number, key: string) =>
  path.join(OUT, platform, `${String(i + 1).padStart(2, '0')}-${key}.jpg`);

async function thumb(file: string, height: number): Promise<{ buf: Buffer; w: number; h: number }> {
  const { data, info } = await sharp(file).resize({ height }).jpeg({ quality: 88 }).toBuffer({ resolveWithObject: true });
  return { buf: data, w: info.width, h: info.height };
}

const label = (text: string, w: number) =>
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${LABEL}">` +
      `<text x="0" y="30" font-family="Helvetica, Arial, sans-serif" font-size="22" fill="#4a3f36">${text}</text></svg>`,
  );

async function main() {
  const ios = await Promise.all(KEYS.map((k, i) => thumb(shot('ios', i, k), ROW_H)));
  const android = await Promise.all(KEYS.map((k, i) => thumb(shot('android', i, k), ROW_H)));
  const feature = await thumb(path.join(OUT, 'play', 'feature-graphic.jpg'), 340);
  const icon = await sharp(path.join(OUT, 'play', 'icon-512.png'))
    .resize(200, 200)
    .flatten({ background: BG })
    .jpeg({ quality: 90 })
    .toBuffer();

  const rowW = (r: { w: number }[]) => r.reduce((s, t) => s + t.w, 0) + GAP * (r.length - 1);
  const width = GAP * 2 + Math.max(rowW(ios), rowW(android), feature.w + GAP + 200);
  const height = GAP + (LABEL + ROW_H + GAP) * 2 + LABEL + feature.h + GAP;

  const layers: sharp.OverlayOptions[] = [];
  let y = GAP;

  const row = (title: string, thumbs: { buf: Buffer; w: number }[]) => {
    layers.push({ input: label(title, width - GAP * 2), left: GAP, top: y });
    y += LABEL;
    let x = GAP;
    for (const t of thumbs) {
      layers.push({ input: t.buf, left: x, top: y });
      x += t.w + GAP;
    }
    y += ROW_H + GAP;
  };

  row('iOS  1320 x 2868  (raw/ios captures)', ios);
  row('Android  1080 x 1920  (raw/android captures)', android);

  layers.push({ input: label('Play  feature graphic 1024 x 500  +  icon 512 x 512', width - GAP * 2), left: GAP, top: y });
  y += LABEL;
  layers.push({ input: feature.buf, left: GAP, top: y });
  layers.push({ input: icon, left: GAP + feature.w + GAP, top: y });

  const out = path.join(OUT, 'contact-sheet.jpg');
  fs.mkdirSync(OUT, { recursive: true });
  await sharp({ create: { width, height, channels: 3, background: BG } })
    .composite(layers)
    .jpeg({ quality: 88 })
    .toFile(out);
  console.log(`${path.relative(process.cwd(), out)}  ${width}x${height}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
