/**
 * One review image of everything that goes to the stores in a language: the
 * iOS row, the Android row, then the Play feature graphic and icon.
 *
 *   npx tsx docs/store/graphics/contact-sheet.ts                 → out/contact-sheet.jpg and out/contact-sheet.en.jpg
 *   npx tsx docs/store/graphics/contact-sheet.ts --lang=zh-TW    → out/contact-sheet.jpg (ios, android, feature-graphic.jpg)
 *   npx tsx docs/store/graphics/contact-sheet.ts --lang=en       → out/contact-sheet.en.jpg (ios-en, android-en, feature-graphic.en.jpg)
 *
 * Reads out/ (run render.ts first). With no --lang a language whose slides were not rendered yet is
 * skipped; asking for one with --lang fails instead. Review only — this file is not uploaded.
 */
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { OUT, parseLangs, variantDir, type Lang } from './lib';

const KEYS = ['feed', 'card', 'write', 'resonance', 'messages', 'thoughtmap'] as const;
const GAP = 28;
const LABEL = 44;
const ROW_H = 460;
const BG = '#e9e2d6';

const shot = (platform: 'ios' | 'android', lang: Lang, i: number, key: string) =>
  path.join(OUT, variantDir(platform, lang), `${String(i + 1).padStart(2, '0')}-${key}.jpg`);
const featureFile = (lang: Lang) => path.join(OUT, 'play', lang === 'en' ? 'feature-graphic.en.jpg' : 'feature-graphic.jpg');
const sheetFile = (lang: Lang) => path.join(OUT, lang === 'en' ? 'contact-sheet.en.jpg' : 'contact-sheet.jpg');

async function thumb(file: string, height: number): Promise<{ buf: Buffer; w: number; h: number }> {
  const { data, info } = await sharp(file).resize({ height }).jpeg({ quality: 88 }).toBuffer({ resolveWithObject: true });
  return { buf: data, w: info.width, h: info.height };
}

const label = (text: string, w: number) =>
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${LABEL}">` +
      `<text x="0" y="30" font-family="Helvetica, Arial, sans-serif" font-size="22" fill="#4a3f36">${text}</text></svg>`,
  );

async function sheet(lang: Lang) {
  const ios = await Promise.all(KEYS.map((k, i) => thumb(shot('ios', lang, i, k), ROW_H)));
  const android = await Promise.all(KEYS.map((k, i) => thumb(shot('android', lang, i, k), ROW_H)));
  const feature = await thumb(featureFile(lang), 340);
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

  const tag = lang === 'en' ? 'en-US' : 'zh-TW';
  row(`iOS ${tag}  1320 x 2868  (raw/${variantDir('ios', lang)} captures)`, ios);
  row(`Android ${tag}  1080 x 1920  (raw/${variantDir('android', lang)} captures)`, android);

  layers.push({ input: label(`Play ${tag}  feature graphic 1024 x 500  +  icon 512 x 512`, width - GAP * 2), left: GAP, top: y });
  y += LABEL;
  layers.push({ input: feature.buf, left: GAP, top: y });
  layers.push({ input: icon, left: GAP + feature.w + GAP, top: y });

  const out = sheetFile(lang);
  fs.mkdirSync(OUT, { recursive: true });
  await sharp({ create: { width, height, channels: 3, background: BG } })
    .composite(layers)
    .jpeg({ quality: 88 })
    .toFile(out);
  console.log(`${path.relative(process.cwd(), out)}  ${width}x${height}`);
}

/** Every file a language's sheet reads. */
const inputs = (lang: Lang) => [
  ...(['ios', 'android'] as const).flatMap((p) => KEYS.map((k, i) => shot(p, lang, i, k))),
  featureFile(lang),
  path.join(OUT, 'play', 'icon-512.png'),
];

async function main() {
  const argv = process.argv.slice(2);
  const explicit = argv.some((a) => a.startsWith('--lang='));
  let made = 0;
  for (const lang of parseLangs(argv)) {
    const missing = inputs(lang).filter((f) => !fs.existsSync(f));
    if (missing.length) {
      const msg = `${lang}: ${missing.length} rendered file(s) missing (first: ${path.relative(OUT, missing[0])}); run render.ts${lang === 'en' ? ' --lang=en' : ''} first`;
      if (explicit) throw new Error(msg);
      console.warn(`skipped ${msg}`);
      continue;
    }
    await sheet(lang);
    made++;
  }
  if (!made) throw new Error('nothing to show: render the slides first');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
