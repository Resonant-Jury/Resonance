/**
 * One-off backfill: compute `accentHue` for existing cards that have a cover
 * image but no stored hue. Mirrors src/lib/design/dominantHue.ts (the .mjs
 * script can't import TS): dominant OKLCH hue of the image, chroma-weighted,
 * snapped to the designed card hue families.
 *
 * Usage: node scripts/backfill-accent-hue.mjs [--dry-run]
 */
import { readFileSync } from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import sharp from 'sharp';

const DRY_RUN = process.argv.includes('--dry-run');
const CARD_HUES = [55, 290, 140, 88, 215, 18];

// --- math mirrored from src/lib/design/dominantHue.ts ---
function rgbToOklch(r8, g8, b8) {
  const lin = (v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  const r = lin(r8), g = lin(g8), b = lin(b8);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const C = Math.hypot(a, bb);
  let h = (Math.atan2(bb, a) * 180) / Math.PI;
  if (h < 0) h += 360;
  return { L, C, h };
}

function dominantHue(pixels) {
  let x = 0, y = 0, weight = 0;
  for (let i = 0; i + 3 < pixels.length; i += 4) {
    if (pixels[i + 3] < 128) continue;
    const { L, C, h } = rgbToOklch(pixels[i], pixels[i + 1], pixels[i + 2]);
    if (C < 0.02 || L < 0.08 || L > 0.98) continue;
    const rad = (h * Math.PI) / 180;
    x += Math.cos(rad) * C;
    y += Math.sin(rad) * C;
    weight += C;
  }
  if (weight === 0) return null;
  let h = (Math.atan2(y, x) * 180) / Math.PI;
  if (h < 0) h += 360;
  return h;
}

function nearestCardHue(hue) {
  let best = CARD_HUES[0], bestD = Infinity;
  for (const c of CARD_HUES) {
    let d = Math.abs(hue - c) % 360;
    if (d > 180) d = 360 - d;
    if (d < bestD) { bestD = d; best = c; }
  }
  return best;
}

// --- firestore ---
const env = readFileSync(new URL('../.env', import.meta.url), 'utf8');
const get = (k) => {
  const m = env.match(new RegExp(`^${k}=(.*)$`, 'm'));
  if (!m) throw new Error(`missing ${k}`);
  let v = m[1].trim();
  if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
  return v.replace(/\\n/g, '\n');
};

initializeApp({
  credential: cert({
    projectId: get('NEXT_PUBLIC_FIREBASE_PROJECT_ID'),
    clientEmail: get('FIREBASE_CLIENT_EMAIL'),
    privateKey: get('FIREBASE_PRIVATE_KEY'),
  }),
});

const db = getFirestore();
const snap = await db.collection('cards').get();
let updated = 0, skippedNoImage = 0, skippedHasHue = 0, failed = 0;

for (const doc of snap.docs) {
  const data = doc.data();
  const url = data.media?.url;
  if (!url || data.media?.type !== 'image') { skippedNoImage++; continue; }
  if (typeof data.accentHue === 'number') { skippedHasHue++; continue; }
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    const { data: raw } = await sharp(buf)
      .resize(32, 32, { fit: 'fill' })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const hue = dominantHue(raw);
    const snapped = hue == null ? null : nearestCardHue(hue);
    console.log(`${doc.id}  hue=${hue == null ? '—' : hue.toFixed(1)} → ${snapped}  (${String(data.thoughtCore).slice(0, 20)})`);
    if (!DRY_RUN && snapped != null) {
      await doc.ref.update({ accentHue: snapped });
      updated++;
    }
  } catch (err) {
    failed++;
    console.warn(`${doc.id}  FAILED: ${err.message}`);
  }
}

console.log(`\ndone. updated=${updated} noImage=${skippedNoImage} hadHue=${skippedHasHue} failed=${failed} dryRun=${DRY_RUN}`);
