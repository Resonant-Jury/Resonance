import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { ALL_BADGES, badgeArt, badgeGeometry } from './badges';

const file = (src: string) => readFileSync(join(__dirname, '../../../../public', src));

// The badges as Apple and Google publish them (SHA-256). Neither store allows
// the art to be changed — not recoloured, re-encoded or optimised — so a new
// version replaces the file whole and updates its line here.
const PUBLISHED: Record<string, string> = {
  '/badges/appstore-en-us.svg': 'a26fc5b38380272c92e9019a2eb8b45542a66814b3e2b203772db8904b9fb99f',
  '/badges/appstore-zh-tw.svg': '0371becc5be192db830e225aabc55ee94d270c0810e453fd40842a12f24d8e80',
  '/badges/googleplay-en.png': 'f72611e2df8e88204009fd896d05d5e8e83c77009c63943bbffa169559934849',
  '/badges/googleplay-zh-tw.png': '34685db3a09db09c58ba7d9018153c30cfba4e51f561026378090bf783394a55',
};

describe('the store badges', () => {
  it('are the official files, unmodified', () => {
    expect(ALL_BADGES.map((a) => a.src).sort()).toEqual(Object.keys(PUBLISHED).sort());
    for (const art of ALL_BADGES) {
      expect(createHash('sha256').update(file(art.src)).digest('hex'), art.src).toBe(PUBLISHED[art.src]);
    }
  });

  it('know each file’s size', async () => {
    for (const art of ALL_BADGES) {
      if (art.src.endsWith('.svg')) {
        const svg = file(art.src).toString('utf8');
        expect(svg, art.src).toMatch(new RegExp(`width="${art.width}" height="${art.height}"`));
      } else {
        const meta = await sharp(file(art.src)).metadata();
        expect([meta.width, meta.height], art.src).toEqual([art.width, art.height]);
      }
    }
  });

  // Google's PNGs carry transparent clear space; the box GetTheApp shows must
  // be exactly the opaque badge, or the two stores' badges stand at different heights.
  it('know where the badge sits inside each PNG', async () => {
    for (const art of ALL_BADGES.filter((a) => a.src.endsWith('.png'))) {
      const { data, info } = await sharp(file(art.src)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      let x0 = info.width, y0 = info.height, x1 = -1, y1 = -1;
      for (let y = 0; y < info.height; y++) {
        for (let x = 0; x < info.width; x++) {
          if (data[(y * info.width + x) * 4 + 3] === 0) continue;
          x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
        }
      }
      expect({ x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 }, art.src).toEqual({ x: art.x, y: art.y, w: art.w, h: art.h });
    }
  });

  it('stand at one height in either language, Google’s padding left outside its box', () => {
    for (const locale of ['en', 'zh-TW']) {
      const apple = badgeGeometry(badgeArt('appStore', locale));
      const play = badgeGeometry(badgeArt('googlePlay', locale));
      // Apple's file is its badge; the box is the whole file.
      expect(apple).toEqual({ boxWidth: apple.imageWidth, imageWidth: apple.imageWidth, imageHeight: 1, offsetX: 0, offsetY: 0 });
      // Google's file is taller than its badge by the padding above and below.
      const art = badgeArt('googlePlay', locale);
      expect(play.imageHeight).toBeCloseTo(art.height / art.h);
      expect(play.offsetY * art.h).toBe(art.y);
      expect(play.boxWidth).toBeCloseTo(art.w / art.h);
    }
  });

  it('fall back to the English art for a language without its own', () => {
    expect(badgeArt('appStore', 'ja').src).toBe('/badges/appstore-en-us.svg');
    expect(badgeArt('googlePlay', 'ja').src).toBe('/badges/googleplay-en.png');
  });
});
