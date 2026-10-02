/**
 * Store graphics for Resonance (共振): App Store / Play screenshots, the Play
 * feature graphic and the Play icon, in Traditional Chinese (zh-TW) and English (en-US).
 *
 *   npx tsx docs/store/graphics/render.ts                 # everything, both languages
 *   npx tsx docs/store/graphics/render.ts ios             # one target: ios | android | play
 *   npx tsx docs/store/graphics/render.ts ios --only=feed,card
 *   npx tsx docs/store/graphics/render.ts --lang=en       # one language: --lang=zh-TW | --lang=en (default: both)
 *   npx tsx docs/store/graphics/render.ts ios android --lang=en --check
 *   npx tsx docs/store/graphics/render.ts --check         # also measure text / fonts in Chrome
 *   npx tsx docs/store/graphics/render.ts --regen-placeholders
 *
 * Reads   raw/ios/<key>.png          (simulator captures, zh-TW app)  → out/ios/<nn>-<key>.jpg          1320×2868
 *         raw/android/<key>.png      (emulator captures, zh-TW app)   → out/android/<nn>-<key>.jpg      1080×1920
 *         raw/ios-en/<key>.png       (the same, app set to English)   → out/ios-en/<nn>-<key>.jpg       1320×2868
 *         raw/android-en/<key>.png                                    → out/android-en/<nn>-<key>.jpg   1080×1920
 * Writes  out/play/feature-graphic.jpg (1024×500, zh-TW), out/play/feature-graphic.en.jpg (the en-US
 *         listing's) and out/play/icon-512.png. --lang picks which feature graphic is made (the icon always is).
 * iOS and Android are built ONLY from their own raw folder (the stores reject a
 * screenshot from the other platform). A missing raw file falls back to a
 * clearly-marked placeholder and logs a warning.
 * English slides set the headline in Playfair Display 700 and the subline in DM Sans 500 (Chinese: Noto
 * Serif TC / Noto Sans TC); --check requires exactly those fonts for each language.
 *
 * The shapes come from the app's real design utils (same seeds → same shapes),
 * the colours from src/styles/tokens.css, the pen weights from strokes.ts.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { makePrng } from '../../../src/lib/design/prng';
import { INK, INK_LIGHT } from '../../../src/lib/design/strokes';
import { wavyLine } from '../../../src/lib/design/wavyPath';
import { wobCircle } from '../../../src/lib/design/wobCircle';
import { wobRect } from '../../../src/lib/design/wobRect';
import {
  BUILD,
  OUT,
  RAW,
  ROOT,
  assertSize,
  dumpDom,
  embeddedFonts,
  esc,
  imageSize,
  mkdirp,
  oklch,
  parseLangs,
  parseOklch,
  readTokens,
  screenshot,
  toJpeg,
  variantDir,
  type Lang,
  type Tokens,
} from './lib';
import { KEYS, ensurePlaceholder, type Key, type Platform } from './placeholders';

/* ── what to make ─────────────────────────────────────────────────────── */

const CANVAS: Record<Platform, { w: number; h: number }> = {
  ios: { w: 1320, h: 2868 }, // App Store, 6.9" iPhone
  android: { w: 1080, h: 1920 }, // Play phone, 9:16
};
const FEATURE = { w: 1024, h: 500 };

/**
 * Crop this fraction off the very bottom of a raw capture. 0 = show it all. This one value also fixes the phone
 * frame's proportions, so every slide of a platform gets the same phone (see Slide.cropBottom for deeper cuts).
 * android 0.019 (2424 → 2378 px): drops the gesture bar and the half-visible line under it, but keeps the
 *   tab bar (ends ~2352), the message composer and the zoom controls whole. Any deeper and the tab bar is cut.
 * ios 0.014 (2868 → 2828 px): the app draws no home indicator; this only trims the last few pixels so the
 *   Write shot keeps its icons whole (~2818) without a sliver of the labels below them (~2850).
 * Re-check both against a new capture.
 */
const CROP_BOTTOM: Record<Platform, number> = { ios: 0.014, android: 0.019 };
/** Clear paper kept between the subline and the top of the big background blob, as a fraction of the canvas width. */
const BLOB_CLEAR = 0.03;
/** Screen corner radius as a fraction of the screenshot width (the raw captures are square). */
const SCREEN_RADIUS: Record<Platform, number> = { ios: 0.13, android: 0.1 };

type AccentName = 'terracotta' | 'sage' | 'yellow' | 'lavender' | 'sky' | 'peach';

interface Copy {
  headline: string;
  em: string; // the part of the headline set in the accent colour and underlined; must occur exactly once
  subline: string;
}

interface Slide {
  key: Key;
  copy: Record<Lang, Copy>; // one line each at the slide's size (--check fails on a wrap or a shrunk font)
  accent: AccentName;
  side: 1 | -1; // which side the big blob leans to
  seed: number;
  /**
   * Cut more off the bottom of THIS capture than CROP_BOTTOM does, where the default cut lands inside a line
   * of text or on a floating control. The phone frame keeps its size: the sides are trimmed by the same ratio,
   * so every slide of a platform has the same phone. Never less than CROP_BOTTOM.
   */
  cropBottom?: Partial<Record<Platform, number>>;
}

const SLIDES: Slide[] = [
  {
    key: 'feed', accent: 'terracotta', side: 1, seed: 11,
    copy: {
      'zh-TW': { headline: '用故事回應故事', em: '回應', subline: '讀到觸動你的卡片，寫下你自己的經歷' },
      en: { headline: 'Answer stories with stories', em: 'Answer', subline: 'When a card moves you, write your own' },
    },
  },
  {
    key: 'card', accent: 'sage', side: -1, seed: 23, cropBottom: { ios: 0.028 },
    copy: {
      'zh-TW': { headline: '每張卡片都是一段人生', em: '人生', subline: '標題、故事、照片，慢慢讀' },
      en: { headline: 'Every card is a life', em: 'a life', subline: 'A title, a story, a photo — read slowly' },
    },
  },
  {
    key: 'write', accent: 'yellow', side: 1, seed: 37, cropBottom: { ios: 0.017, android: 0.0756 },
    copy: {
      'zh-TW': { headline: '寫下你的故事', em: '故事', subline: '在手繪紙張上，決定給誰看' },
      en: { headline: 'Write your story', em: 'your story', subline: 'On hand-drawn paper, shared as you choose' },
    },
  },
  {
    key: 'resonance', accent: 'lavender', side: -1, seed: 41, cropBottom: { ios: 0.0377 },
    copy: {
      'zh-TW': { headline: '不按讚，而是共振', em: '共振', subline: '兩張卡片連在一起，你們也是' },
      en: { headline: 'Don’t just like — resonate', em: 'resonate', subline: 'Two cards linked, and so are the two of you' },
    },
  },
  {
    key: 'messages', accent: 'sky', side: 1, seed: 53,
    copy: {
      'zh-TW': { headline: '因故事相遇，繼續聊', em: '相遇', subline: '連結之間的私訊' },
      en: { headline: 'Meet through a story', em: 'a story', subline: 'Private messages between connections' },
    },
  },
  {
    key: 'thoughtmap', accent: 'peach', side: -1, seed: 67, cropBottom: { ios: 0.0237 },
    copy: {
      'zh-TW': { headline: '看見想法怎麼長出來', em: '長出來', subline: '把卡片排在點點紙上，畫出它們的關係' },
      en: { headline: 'Watch your thinking grow', em: 'grow', subline: 'Lay out your cards and draw how they relate' },
    },
  },
];

/**
 * Type per language, as fractions of the canvas width. A Latin letter is about half as wide as a CJK character,
 * so the English headline is set smaller than the Chinese one (0.068 vs 0.076: the longest English headline then
 * fills ~85% of the width, like the longest Chinese ones do) but in the same one-pen weight family; the subline
 * keeps the Chinese size. Latin needs none of the CJK letter-spacing.
 */
const TYPE: Record<Lang, { h: number; s: number; hWeight: number; hTrack: string; sWeight: number; sTrack: string; uline: string }> = {
  'zh-TW': { h: 0.076, s: 0.0375, hWeight: 900, hTrack: '.02em', sWeight: 500, sTrack: '.05em', uline: '-.15em' },
  // The wave sits lower under Latin: the descenders of y / g reach below the baseline, where CJK has none.
  en: { h: 0.068, s: 0.0375, hWeight: 700, hTrack: '0', sWeight: 500, sTrack: '.01em', uline: '-.26em' },
};
/** The CSS font stacks (the web fonts are embedded; see main()). */
const FAMILIES: Record<Lang, { serif: string; sans: string }> = {
  'zh-TW': {
    serif: "'Noto Serif TC','Playfair Display','Songti TC',serif",
    sans: "'Noto Sans TC','DM Sans','PingFang TC',system-ui,sans-serif",
  },
  en: {
    serif: "'Playfair Display',Georgia,serif",
    sans: "'DM Sans','Helvetica Neue',Arial,system-ui,sans-serif",
  },
};
/** Fonts --check requires each language's screenshot slides to have loaded (a family counts once any weight did). */
const SLIDE_FONTS: Record<Lang, string[]> = {
  'zh-TW': ['Noto Serif TC', 'Noto Sans TC'],
  en: ['Playfair Display', 'DM Sans'],
};

/**
 * How many wave units the underline under the emphasised phrase gets (one per em of width). A CJK character is
 * one em wide; a Latin letter about 0.55 em.
 */
const waveUnits = (em: string, lang: Lang) => (lang === 'en' ? Math.max(2, Math.round(em.length * 0.55)) : [...em].length);

for (const s of SLIDES) {
  for (const lang of Object.keys(s.copy) as Lang[]) {
    const { headline, em } = s.copy[lang];
    if (headline.split(em).length !== 2) throw new Error(`${s.key} (${lang}): "${em}" must occur exactly once in "${headline}"`);
  }
}

const TAGLINE = { text: '讓生命影響生命', em: '影響' };
const BRAND = { latin: 'Resonance', cjk: '共振' };
/** The en-US listing's feature graphic: the brand alone, the tagline in English. */
const TAGLINE_EN = { text: 'Let lives touch lives', em: 'touch' };

/* ── colour ───────────────────────────────────────────────────────────── */

interface Accent {
  tone: string; // soft pastel for blobs (a palette token)
  mid: string; // line colour for doodles / underline
  ink: string; // emphasised headline text
  companion: string; // second pastel in the same slide
}

function accentsFrom(T: Tokens): Record<AccentName, Accent> {
  const hue = (tok: string) => parseOklch(T[tok]);
  const chroma = (tok: string, mul: number, lo: number, hi: number) =>
    Math.min(hi, Math.max(lo, parseOklch(T[tok]).c * mul));
  const from = (tok: string, midL: number, inkL: number, companion: string): Accent => ({
    tone: T[tok],
    mid: oklch(midL, chroma(tok, 1.7, 0.1, 0.16), hue(tok).h),
    ink: oklch(inkL, chroma(tok, 1.7, 0.1, 0.15), hue(tok).h),
    companion: T[companion],
  });
  return {
    terracotta: { tone: T['terracotta-light'], mid: T['terracotta'], ink: T['terracotta'], companion: T['lavender'] },
    sage: from('sage', 62, 42, 'terracotta-light'),
    yellow: from('yellow', 72, 50, 'sage'),
    lavender: from('lavender', 62, 46, 'yellow'),
    sky: from('sky', 62, 44, 'terracotta-light'),
    peach: from('terracotta-light', 68, 50, 'sky'),
  };
}

/* ── shared svg pieces ────────────────────────────────────────────────── */

const num = (n: number) => +n.toFixed(2);

/** Paper grain over the whole canvas (same recipe as atoms/GrainOverlay, sized for the canvas). */
function grainDefs(id: string, freq: number, seed = 1) {
  return (
    `<filter id="${id}" x="0" y="0" width="100%" height="100%">` +
    `<feTurbulence type="fractalNoise" baseFrequency="${num(freq)}" numOctaves="4" stitchTiles="stitch" seed="${seed}"/>` +
    `<feColorMatrix type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -0.2126 -0.7152 -0.0722 0 1"/></filter>`
  );
}

/** A soft pastel blob with the same speckle the app's OrganiBlob has. */
function blob(cx: number, cy: number, r: number, seed: number, fill: string, opacity: number, grainId: string) {
  const d = wobCircle(cx, cy, r, seed, { segments: 7, mag: r * 0.09, cpJitter: 0.9 });
  return (
    `<path d="${d}" fill="${fill}" opacity="${opacity}"/>` +
    `<path d="${d}" fill="#000" filter="url(#${grainId})"/>`
  );
}

const ring = (cx: number, cy: number, r: number, seed: number, stroke: string, sw: number) =>
  `<path d="${wobCircle(0, 0, r, seed, { segments: 8, mag: r * 0.07, cpJitter: 0.7 })}" transform="translate(${num(cx)} ${num(cy)})" fill="none" stroke="${stroke}" stroke-width="${num(sw)}" stroke-linecap="round"/>`;

const dot = (cx: number, cy: number, r: number, seed: number, fill: string) =>
  `<path d="${wobCircle(0, 0, r, seed, { segments: 6, mag: r * 0.12 })}" transform="translate(${num(cx)} ${num(cy)})" fill="${fill}"/>`;

const squiggle = (x: number, y: number, len: number, deg: number, seed: number, stroke: string, sw: number) =>
  `<path d="${wavyLine(len, seed, len * 0.07, 7)}" transform="translate(${num(x)} ${num(y)}) rotate(${deg})" fill="none" stroke="${stroke}" stroke-width="${num(sw)}" stroke-linecap="round"/>`;

/** A little hand-drawn four-point sparkle. */
function sparkle(cx: number, cy: number, r: number, seed: number, stroke: string, sw: number) {
  const rnd = makePrng(seed);
  const j = () => (rnd() - 0.5) * r * 0.18;
  const d =
    `M ${num(-r + j())},${num(j())} C ${num(-r * 0.3)},${num(j())} ${num(-j())},${num(-r * 0.3)} ${num(j())},${num(-r)} ` +
    `C ${num(j())},${num(-r * 0.3)} ${num(r * 0.3)},${num(j())} ${num(r + j())},${num(j())} ` +
    `C ${num(r * 0.3)},${num(j())} ${num(j())},${num(r * 0.3)} ${num(j())},${num(r)} ` +
    `C ${num(j())},${num(r * 0.3)} ${num(-r * 0.3)},${num(j())} ${num(-r + j())},${num(j())} Z`;
  return `<path d="${d}" transform="translate(${num(cx)} ${num(cy)})" fill="none" stroke="${stroke}" stroke-width="${num(sw)}" stroke-linejoin="round"/>`;
}

/** The wavy underline under the emphasised word (viewBox is 100 units per character). */
function underline(chars: number, seed: number, stroke: string) {
  const w = chars * 100;
  return (
    `<svg class="uline" viewBox="0 0 ${w} 30" preserveAspectRatio="none" aria-hidden="true">` +
    `<path d="${wavyLine(w, seed, 6, chars * 2 + 2)}" transform="translate(0 15)" fill="none" stroke="${stroke}" stroke-width="6.5" stroke-linecap="round"/></svg>`
  );
}

/* ── page scaffolding ─────────────────────────────────────────────────── */

function pageCss(T: Tokens, w: number, h: number, lang: Lang = 'zh-TW') {
  return `
  :root{--cream:${T['cream']};--cream-dark:${T['cream-dark']};--card:${T['card-bg']};--ink:${T['text']};--muted:${T['text-muted']};
    --serif:${FAMILIES[lang].serif};--sans:${FAMILIES[lang].sans}}
  *{box-sizing:border-box;margin:0;padding:0}
  html,body{width:${w}px;height:${h}px;overflow:hidden;background:var(--cream)}
  body{font-family:var(--sans);color:var(--ink);-webkit-font-smoothing:antialiased}
  .canvas{position:relative;width:${w}px;height:${h}px;overflow:hidden}
  .layer{position:absolute;left:0;top:0}
  .em{position:relative;display:inline-block}
  .uline{position:absolute;left:-1.5%;bottom:-.15em;width:103%;height:.3em;overflow:visible;pointer-events:none}
  .fitbox{display:inline-block;white-space:nowrap}`;
}

/** Measures what matters, waits for fonts, shrinks any .fitbox that is too wide. */
const PAGE_SCRIPT = `
document.body.offsetHeight;
document.fonts.ready.then(function () {
  document.querySelectorAll('.fitbox').forEach(function (el) {
    var max = parseFloat(el.dataset.max), host = el.parentElement, fs = parseFloat(getComputedStyle(host).fontSize), n = 0;
    while (el.getBoundingClientRect().width > max && n++ < 40) { fs *= 0.97; host.style.fontSize = fs + 'px'; }
  });
  var items = [];
  document.querySelectorAll('[data-measure]').forEach(function (el) {
    var r = el.getBoundingClientRect(), cs = getComputedStyle(el.closest('h1,p,div') || el);
    items.push({ name: el.dataset.measure, safe: el.dataset.safe === '1', x: r.left, y: r.top, w: r.width, h: r.height, fs: parseFloat(cs.fontSize), fs0: parseFloat(el.dataset.fs || '0') });
  });
  var fonts = []; document.fonts.forEach(function (f) { if (f.status === 'loaded') fonts.push(f.family + ' ' + f.weight); });
  document.documentElement.setAttribute('data-metrics', JSON.stringify({ W: innerWidth, H: innerHeight, fonts: fonts, items: items }));
});`;

function htmlDoc(title: string, css: string, fonts: string, body: string, lang = 'zh-Hant-TW') {
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>${fonts}${css}</style></head><body>${body}<script>${PAGE_SCRIPT}</script></body></html>`;
}

/* ── one screenshot slide ─────────────────────────────────────────────── */

interface Geometry {
  W: number;
  H: number;
  s: number; // canvas width in "390-wide phone" units, so pen weights match the app's
  padTop: number;
  hFs: number;
  sFs: number;
  bezel: number;
  textBottom: number; // where the subline's box ends; background shapes keep clear of it
  x: number;
  y: number;
  outerW: number;
  outerH: number;
  innerW: number;
  innerH: number;
}

/** Lay the phone out under the text; the screenshot keeps its aspect ratio, nothing is squashed. */
function geometry(p: Platform, lang: Lang, rawW: number, rawH: number): Geometry {
  const { w: W, h: H } = CANVAS[p];
  const padTop = Math.round(W * 0.085);
  const hFs = Math.round(W * TYPE[lang].h);
  const sFs = Math.round(W * TYPE[lang].s);
  const textH = Math.round(hFs * 1.2 + hFs * 0.34 + sFs * 1.45);
  const gap = Math.round(W * 0.055);
  const top = padTop + textH + gap;
  const bottom = Math.round(W * 0.06);
  const bezel = Math.round(W * 0.022);
  const aspect = rawW / (rawH * (1 - CROP_BOTTOM[p]));

  let outerH = H - top - bottom;
  let innerH = outerH - 2 * bezel;
  let innerW = Math.round(innerH * aspect);
  let outerW = innerW + 2 * bezel;
  const maxW = Math.round(W * 0.86);
  if (outerW > maxW) {
    outerW = maxW;
    innerW = outerW - 2 * bezel;
    innerH = Math.round(innerW / aspect);
    outerH = innerH + 2 * bezel;
  }
  const y = top + Math.round((H - top - bottom - outerH) / 2);
  return { W, H, s: W / 390, padTop, hFs, sFs, bezel, textBottom: padTop + textH, x: Math.round((W - outerW) / 2), y, outerW, outerH, innerW, innerH };
}

function doodles(g: Geometry, slide: Slide, A: Accent) {
  const { W, H, s } = g;
  const sd = slide.side;
  const pen = INK * s;
  const rnd = makePrng(slide.seed);
  const margin = (W - g.outerW) / 2;
  const sideX = (k: number) => W / 2 + k * (g.outerW / 2 + margin / 2);
  const grainId = 'blobgrain';
  // The big blob sits behind the phone. Its top edge must never run through the headline or subline, so keep it
  // BLOB_CLEAR below them (1.12 covers how far the wobble can push the outline past the radius).
  const bigBlobR = W * 0.5;
  const bigBlobY = Math.max(g.y + g.outerH * 0.3, g.textBottom + W * BLOB_CLEAR + bigBlobR * 1.12);
  const parts: string[] = [
    `<defs><filter id="${grainId}" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="${num(0.9 / s)}" numOctaves="2" stitchTiles="stitch" seed="${slide.seed % 9}"/><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncA type="linear" slope="0.4"/></feComponentTransfer><feComposite in2="SourceGraphic" operator="in"/></filter></defs>`,
    blob(W / 2 + sd * W * 0.27, bigBlobY, bigBlobR, slide.seed, A.tone, 0.62, grainId),
    blob(W / 2 - sd * W * 0.44, g.y + g.outerH * 0.92, W * 0.3, slide.seed + 3, A.companion, 0.5, grainId),
    blob(W / 2 + sd * W * 0.55, g.padTop * 0.2, W * 0.2, slide.seed + 5, A.companion, 0.4, grainId),
    // top corners, clear of the (centred) headline
    ring(W / 2 - sd * W * 0.44, g.padTop * 0.62, W * 0.024, slide.seed + 1, A.mid, pen),
    squiggle(W / 2 + sd * W * 0.33, g.padTop * 0.5, W * 0.1, -8, slide.seed + 2, A.mid, pen),
    dot(W / 2 - sd * W * 0.36, g.padTop * 0.42, W * 0.008, slide.seed + 6, A.mid),
    // peeking out of the margins beside the phone
    squiggle(sideX(-sd), g.y + g.outerH * (0.36 + rnd() * 0.06), g.outerH * 0.13, 90, slide.seed + 7, A.mid, pen),
    sparkle(sideX(sd), g.y + g.outerH * 0.16, W * 0.028, slide.seed + 8, A.mid, pen * 0.85),
    ring(sideX(sd), g.y + g.outerH * 0.72, W * 0.02, slide.seed + 9, A.mid, pen),
    dot(sideX(-sd), g.y + g.outerH * 0.62, W * 0.009, slide.seed + 10, A.mid),
    dot(sideX(-sd) + W * 0.02, g.y + g.outerH * 0.64, W * 0.006, slide.seed + 11, A.mid),
  ];
  void H;
  return parts.join('');
}

async function slideHtml(
  T: Tokens,
  fonts: string,
  p: Platform,
  lang: Lang,
  slide: Slide,
  A: Accent,
  rawFile: string,
): Promise<{ html: string; g: Geometry }> {
  const raw = imageSize(rawFile);
  const g = geometry(p, lang, raw.w, raw.h);
  const { headline: headlineText, em, subline } = slide.copy[lang];
  const ty = TYPE[lang];
  const { W, H, s } = g;
  const pen = INK * s;
  const penLight = INK_LIGHT * s;

  // Keep the rows above the crop line; if this slide crops deeper than the platform default, trim the sides
  // (centred) by the same ratio so the picture still fits the one phone frame every slide shares.
  const cropBottom = slide.cropBottom?.[p] ?? CROP_BOTTOM[p];
  if (cropBottom < CROP_BOTTOM[p]) throw new Error(`${p}/${slide.key}: cropBottom ${cropBottom} is below the platform default ${CROP_BOTTOM[p]}`);
  const rows = Math.round(raw.h * (1 - cropBottom));
  const cols = Math.min(raw.w, Math.round(rows * (raw.w / (raw.h * (1 - CROP_BOTTOM[p])))));
  const left = Math.floor((raw.w - cols) / 2);

  // Resample once (lanczos) to the exact drawn size so Chrome doesn't rescale it again.
  const resized = await sharp(rawFile)
    .extract({ left, top: 0, width: cols, height: rows })
    .flatten({ background: '#faf2e9' })
    .resize({ width: g.innerW, height: g.innerH, fit: 'fill', kernel: 'lanczos3' })
    .png()
    .toBuffer({ resolveWithObject: true });
  const dataUri = `data:image/png;base64,${resized.data.toString('base64')}`;

  const R = Math.round(g.innerW * SCREEN_RADIUS[p]);
  const outerD = wobRect(g.outerW, g.outerH, R + g.bezel, slide.seed, W * 0.0045, { segmentsH: 3, segmentsV: 5 });
  const innerD = wobRect(g.innerW, g.innerH, R, slide.seed + 1, W * 0.0012, { cornerJitter: 0.25, segmentsH: 2, segmentsV: 2 });

  const [before, after] = headlineText.split(em);
  const headline = `${esc(before)}<span class="em" style="color:${A.ink}">${esc(em)}${underline(waveUnits(em, lang), slide.seed + 4, A.mid)}</span>${esc(after)}`;
  const padX = Math.round(W * 0.05);

  const css = `${pageCss(T, W, H, lang)}
  .canvas{background:linear-gradient(180deg,var(--cream) 0%,var(--cream) 38%,color-mix(in oklch,var(--cream) 84%,${A.tone} 16%) 100%)}
  .text{position:absolute;left:0;right:0;top:${g.padTop}px;text-align:center}
  h1{font:${ty.hWeight} ${g.hFs}px/1.2 var(--serif);letter-spacing:${ty.hTrack};color:var(--ink)}
  p{margin-top:${Math.round(g.hFs * 0.34)}px;font:${ty.sWeight} ${g.sFs}px/1.45 var(--sans);letter-spacing:${ty.sTrack};color:var(--muted)}${
    lang === 'en' ? `\n  .uline{bottom:${ty.uline}}` : ''
  }
  .phone{position:absolute;left:${g.x}px;top:${g.y}px;width:${g.outerW}px;height:${g.outerH}px;overflow:visible;
    filter:drop-shadow(0 ${Math.round(W * 0.034)}px ${Math.round(W * 0.05)}px oklch(20% 0.04 60 / 0.24)) drop-shadow(0 ${Math.round(W * 0.006)}px ${Math.round(W * 0.012)}px oklch(20% 0.04 60 / 0.18))}`;

  const body = `<div class="canvas" data-slide="${variantDir(p, lang)}-${slide.key}">
  <svg class="layer" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" aria-hidden="true">
    <defs>${grainDefs('grain', 0.72 / s, slide.seed)}</defs>
    ${doodles(g, slide, A)}
    <rect width="${W}" height="${H}" filter="url(#grain)" opacity="0.055"/>
  </svg>
  <div class="text">
    <h1><span class="fitbox" data-max="${W - 2 * padX}" data-fs="${g.hFs}" data-measure="headline">${headline}</span></h1>
    <p><span class="fitbox" data-max="${W - 2 * padX}" data-fs="${g.sFs}" data-measure="subline">${esc(subline)}</span></p>
  </div>
  <svg class="phone" data-measure="phone" viewBox="0 0 ${g.outerW} ${g.outerH}" aria-hidden="true">
    <defs><clipPath id="screen"><path d="${innerD}" transform="translate(${g.bezel} ${g.bezel})"/></clipPath></defs>
    <path d="${outerD}" fill="var(--card)" stroke="var(--ink)" stroke-width="${num(pen)}" stroke-linejoin="round"/>
    <image href="${dataUri}" x="${g.bezel}" y="${g.bezel}" width="${resized.info.width}" height="${resized.info.height}" clip-path="url(#screen)"/>
    <path d="${innerD}" transform="translate(${g.bezel} ${g.bezel})" fill="none" stroke="var(--ink)" stroke-opacity=".85" stroke-width="${num(penLight)}"/>
  </svg>
</div>`;

  return { html: htmlDoc(`${variantDir(p, lang)} ${slide.key}`, css, fonts, body, lang === 'en' ? 'en' : undefined), g };
}

/* ── play feature graphic ─────────────────────────────────────────────── */

function featureHtml(T: Tokens, fonts: string, A: Record<AccentName, Accent>, lang: Lang): string {
  const en = lang === 'en';
  const tagline = en ? TAGLINE_EN : TAGLINE;
  const { w: W, h: H } = FEATURE;
  const s = W / 390 / 1.6; // pen scale: keep strokes about as heavy as the app's, a touch finer
  const pen = INK * s * 1.6;
  const terra = A.terracotta;
  const tile = 104;
  const tileD = wobRect(tile, tile, 28, 7, 2.2, { segmentsH: 3, segmentsV: 3 });
  const [b1, b2] = tagline.text.split(tagline.em);
  // See waveUnits: the wave is sized in CJK characters; a Latin letter is about half as wide.
  const waves = waveUnits(tagline.em, lang);
  const grainId = 'blobgrain';
  const body = `<div class="canvas">
  <svg class="layer" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" aria-hidden="true">
    <defs>${grainDefs('grain', 0.72 / 2.6, 3)}
      <filter id="${grainId}" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.35" numOctaves="2" stitchTiles="stitch" seed="4"/><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncA type="linear" slope="0.4"/></feComponentTransfer><feComposite in2="SourceGraphic" operator="in"/></filter></defs>
    ${blob(70, 420, 215, 5, terra.tone, 0.62, grainId)}
    ${blob(985, 40, 185, 8, A.lavender.tone, 0.55, grainId)}
    ${blob(935, 455, 120, 12, A.sage.tone, 0.55, grainId)}
    ${blob(300, -30, 90, 15, A.yellow.tone, 0.4, grainId)}
    ${ring(64, 92, 16, 21, terra.mid, pen)}
    ${squiggle(58, 150, 62, 78, 22, terra.mid, pen)}
    ${sparkle(962, 232, 17, 23, A.lavender.mid, pen * 0.9)}
    ${squiggle(900, 390, 70, -12, 24, A.sage.mid, pen)}
    ${dot(112, 420, 6, 25, A.sage.mid)}${dot(130, 432, 4, 26, A.sage.mid)}
    <rect width="${W}" height="${H}" filter="url(#grain)" opacity="0.055"/>
  </svg>
  <div style="position:absolute;left:0;right:0;top:50%;transform:translateY(-50%);text-align:center">
    <div class="brand" data-measure="brand" data-safe="1">
      <svg width="${tile}" height="${tile}" viewBox="0 0 ${tile} ${tile}" style="overflow:visible;flex:none;filter:drop-shadow(0 6px 10px oklch(20% 0.04 60 / .16))">
        <path d="${tileD}" fill="var(--card)" stroke="${terra.mid}" stroke-width="${num(pen * 0.9)}" stroke-linejoin="round"/>
        <g transform="translate(20 20) scale(2.7)" fill="none" stroke="${terra.mid}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M3.4,8.2 C5.4,5.9 7.3,5.8 9.2,8.0 C11.1,10.2 13.0,10.3 15.0,8.1 C16.9,6.0 18.8,5.9 20.7,8.1"/>
          <path d="M3.0,12.1 C5.1,9.7 7.1,9.8 9.0,12.0 C10.9,14.2 12.9,14.3 14.9,12.1 C16.8,9.9 18.8,9.8 20.9,12.0"/>
          <path d="M3.5,16.0 C5.4,13.8 7.4,13.7 9.3,15.9 C11.2,18.1 13.1,18.2 15.1,16.0 C17.0,13.9 18.9,13.8 20.8,16.0"/></g></svg>
      <div class="name"><span class="lat">${esc(BRAND.latin)}</span>${en ? '' : ` <span class="cjk">${esc(BRAND.cjk)}</span>`}</div>
    </div>
    <div class="tagline"><span class="fitbox" data-max="640" data-measure="tagline" data-safe="1">${esc(b1)}<span class="em" style="color:${terra.ink}">${esc(tagline.em)}${underline(waves, 9, terra.mid)}</span>${esc(b2)}</span></div>
  </div>
</div>`;
  const css = `${pageCss(T, W, H)}
  .canvas{background:linear-gradient(180deg,var(--cream) 0%,color-mix(in oklch,var(--cream) 90%,${terra.tone} 10%) 100%)}
  .brand{display:inline-flex;align-items:center;gap:26px}
  .name{font-size:76px;line-height:1.1;color:var(--ink);white-space:nowrap}
  .name .lat{font-family:'Playfair Display','Noto Serif TC',serif;font-weight:700;letter-spacing:-.005em}
  .name .cjk{font-family:var(--serif);font-weight:900;color:${terra.ink};letter-spacing:.04em}
  .tagline{margin-top:34px;font:900 60px/1.2 var(--serif);letter-spacing:.06em;color:var(--ink)}${
    en ? `\n  .tagline{font:700 62px/1.2 'Playfair Display',serif;letter-spacing:0}` : ''
  }`;
  return htmlDoc('Resonance feature graphic', css, fonts, body, en ? 'en' : 'zh-Hant-TW');
}

/* ── driver ───────────────────────────────────────────────────────────── */

interface Metrics {
  W: number;
  H: number;
  fonts: string[];
  items: { name: string; safe: boolean; x: number; y: number; w: number; h: number; fs: number; fs0: number }[];
}

async function measure(html: string, w: number, h: number): Promise<Metrics | null> {
  const dom = await dumpDom(html, w, h);
  const m = dom.match(/data-metrics="([^"]*)"/);
  if (!m) return null;
  return JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&'));
}

const warnings: string[] = [];
const problems: string[] = [];

/** `need`: the font families this page must have loaded (so a missing web font cannot pass as a system fallback). */
function report(name: string, need: string[], m: Metrics | null, w: number, h: number, safe?: { l: number; t: number; r: number; b: number }) {
  if (!m) {
    problems.push(`${name}: no metrics (page script did not run)`);
    return;
  }
  const fonts = new Set(m.fonts.map((f) => f.split(' ')[0] + ' ' + f.split(' ').slice(1, -1).join(' ')));
  for (const n of need) if (![...m.fonts].some((f) => f.startsWith(n))) problems.push(`${name}: font "${n}" did not load`);
  const line = m.items
    .map((i) => `${i.name} ${Math.round(i.w)}x${Math.round(i.h)}@${Math.round(i.x)},${Math.round(i.y)}${i.fs ? ` ${Math.round(i.fs)}px` : ''}`)
    .join(' | ');
  console.log(`    check ${name}: ${line}`);
  void fonts;
  for (const i of m.items) {
    if (i.x < 0 || i.y < 0 || i.x + i.w > w + 0.5 || i.y + i.h > h + 0.5) problems.push(`${name}: ${i.name} leaves the canvas`);
    if (i.name === 'headline' || i.name === 'subline') {
      const lines = Math.round(i.h / (i.fs * (i.name === 'headline' ? 1.2 : 1.45)));
      if (lines !== 1) problems.push(`${name}: ${i.name} wraps to ${lines} lines`);
      if (i.fs0 && i.fs < i.fs0 - 0.5) problems.push(`${name}: ${i.name} was shrunk from ${i.fs0}px to ${Math.round(i.fs * 10) / 10}px to fit (too long for its size: shorten the copy)`);
      if (i.x < w * 0.04 || i.x + i.w > w * 0.96) problems.push(`${name}: ${i.name} is closer than 4% to the edge`);
    }
    if (safe && i.safe && (i.x < safe.l || i.y < safe.t || i.x + i.w > safe.r || i.y + i.h > safe.b)) {
      problems.push(`${name}: ${i.name} is inside the 15% edge zone`);
    }
  }
}

async function rawFor(p: Platform, lang: Lang, key: Key, regen: boolean) {
  const dir = variantDir(p, lang);
  for (const ext of ['png', 'jpg', 'jpeg']) {
    const f = path.join(RAW, dir, `${key}.${ext}`);
    if (fs.existsSync(f)) return { file: f, placeholder: false };
  }
  const msg = `raw/${dir}/${key}.png is missing, using a PLACEHOLDER`;
  console.warn(`  ! ${msg}`);
  warnings.push(`${dir}/${key}`);
  return { file: await ensurePlaceholder(p, key, regen, lang), placeholder: true };
}

async function renderScreens(p: Platform, lang: Lang, T: Tokens, fonts: string, only: string[] | null, check: boolean, regen: boolean) {
  const A = accentsFrom(T);
  const { w, h } = CANVAS[p];
  const dir = variantDir(p, lang);
  console.log(`\n${dir}  ${w}x${h}`);
  for (let i = 0; i < SLIDES.length; i++) {
    const slide = SLIDES[i];
    if (only && !only.includes(slide.key)) continue;
    const name = `${String(i + 1).padStart(2, '0')}-${slide.key}`;
    const raw = await rawFor(p, lang, slide.key, regen);
    const rawSize = imageSize(raw.file);
    const aspect = rawSize.w / rawSize.h;
    if (!raw.placeholder && (aspect < 0.4 || aspect > 0.62)) {
      console.warn(`  ! ${path.relative(ROOT, raw.file)} is ${rawSize.w}x${rawSize.h}: that is not a portrait phone capture`);
      warnings.push(`${dir}/${slide.key} (odd aspect ${aspect.toFixed(2)})`);
    }
    const { html, g } = await slideHtml(T, fonts, p, lang, slide, A[slide.accent], raw.file);
    const htmlPath = path.join(BUILD, dir, `${name}.html`);
    const png = path.join(BUILD, dir, `${name}.png`);
    const jpg = path.join(OUT, dir, `${name}.jpg`);
    mkdirp(path.dirname(htmlPath));
    fs.writeFileSync(htmlPath, html);
    await screenshot(htmlPath, png, w, h);
    toJpeg(png, jpg);
    assertSize(jpg, w, h);
    const kb = Math.round(fs.statSync(jpg).size / 1024);
    console.log(`  ${path.relative(ROOT, jpg)}  ${kb} KB  from ${rawSize.w}x${rawSize.h}, phone ${g.outerW}x${g.outerH}${raw.placeholder ? '  [PLACEHOLDER]' : ''}`);
    if (check) report(`${dir}/${name}`, SLIDE_FONTS[lang], await measure(htmlPath, w, h), w, h);
  }
}

async function renderPlay(T: Tokens, fonts: string, langs: Lang[], check: boolean) {
  console.log('\nplay');
  const A = accentsFrom(T);
  const { w, h } = FEATURE;
  for (const lang of langs) {
    const name = lang === 'en' ? 'feature-graphic.en' : 'feature-graphic';
    const htmlPath = path.join(BUILD, 'play', `${name}.html`);
    const png = path.join(BUILD, 'play', `${name}.png`);
    const jpg = path.join(OUT, 'play', `${name}.jpg`);
    mkdirp(path.dirname(htmlPath));
    fs.writeFileSync(htmlPath, featureHtml(T, fonts, A, lang));
    await screenshot(htmlPath, png, w, h);
    toJpeg(png, jpg);
    assertSize(jpg, w, h);
    console.log(`  ${path.relative(ROOT, jpg)}  ${Math.round(fs.statSync(jpg).size / 1024)} KB`);
    if (check) {
      report(`play/${name}`, lang === 'en' ? ['Playfair Display'] : ['Noto Serif TC', 'Playfair Display'], await measure(htmlPath, w, h), w, h, {
        l: w * 0.15,
        t: h * 0.15,
        r: w * 0.85,
        b: h * 0.85,
      });
    }
  }

  // The app's real icon, straight from the 1024 master (no redesign): resize only.
  const master = path.join(ROOT, 'apps/ios/Resonance/Resources/Assets.xcassets/AppIcon.appiconset/AppIcon-1024.png');
  const icon = path.join(OUT, 'play', 'icon-512.png');
  mkdirp(path.dirname(icon));
  execFileSync('sips', ['-z', '512', '512', master, '--out', icon], { stdio: 'ignore' });
  // Play wants 32-bit (RGBA) PNG: keep the alpha channel sips preserved, or add an opaque one.
  const meta = await sharp(icon).metadata();
  if (!meta.hasAlpha) {
    const buf = await sharp(icon).ensureAlpha().png().toBuffer();
    fs.writeFileSync(icon, buf);
  }
  assertSize(icon, 512, 512);
  console.log(`  ${path.relative(ROOT, icon)}  ${Math.round(fs.statSync(icon).size / 1024)} KB`);
}

async function main() {
  const argv = process.argv.slice(2);
  const targets = (['ios', 'android', 'play'] as const).filter((t) => argv.includes(t));
  const run = targets.length ? targets : (['ios', 'android', 'play'] as const);
  const only = argv.find((a) => a.startsWith('--only='))?.slice(7).split(',') ?? null;
  const check = argv.includes('--check');
  const regen = argv.includes('--regen-placeholders');
  const langs = parseLangs(argv);
  const screens = run.filter((t): t is Platform => t !== 'play');
  if (only) for (const k of only) if (!(KEYS as readonly string[]).includes(k)) throw new Error(`unknown key "${k}"`);

  mkdirp(BUILD);
  const T = readTokens();
  // The zh-TW screenshots and both feature graphics (the en one needs Playfair from this set).
  const copy = [
    ...SLIDES.flatMap((s) => [s.copy['zh-TW'].headline, s.copy['zh-TW'].subline]),
    TAGLINE.text,
    TAGLINE_EN.text,
    BRAND.latin,
    BRAND.cjk,
    ' 0123456789',
  ].join('');
  const fonts =
    langs.includes('zh-TW') || run.includes('play')
      ? await embeddedFonts([
          { family: 'Noto Serif TC', weights: [700, 900], text: copy },
          { family: 'Noto Sans TC', weights: [400, 500], text: copy },
          { family: 'Playfair Display', weights: [700], text: copy },
        ])
      : '';
  // The English screenshots: Playfair Display for the headline, DM Sans for the subline, Latin glyphs only.
  const copyEn = [...SLIDES.flatMap((s) => [s.copy.en.headline, s.copy.en.subline]), ' 0123456789'].join('');
  const fontsEn =
    langs.includes('en') && screens.length
      ? await embeddedFonts([
          { family: 'Playfair Display', weights: [700], text: copyEn },
          { family: 'DM Sans', weights: [400, 500], text: copyEn },
        ])
      : '';

  for (const t of run) {
    if (t === 'play') await renderPlay(T, fonts, langs, check);
    else {
      for (const lang of langs) await renderScreens(t, lang, T, lang === 'en' ? fontsEn : fonts, only, check, regen);
    }
  }

  console.log('');
  if (warnings.length) {
    console.warn(`WARNING: ${warnings.length} slide(s) need attention (placeholder or unusual capture): ${warnings.join(', ')}`);
    console.warn('         Capture raw/<platform>/<key>.png (raw/<platform>-en/ for English) and re-run before uploading anything.');
  }
  if (problems.length) {
    console.error(`CHECK FAILED:\n  - ${problems.join('\n  - ')}`);
    process.exitCode = 1;
  } else if (check) {
    console.log('checks passed');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
