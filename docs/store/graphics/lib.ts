/**
 * Shared plumbing for the store-graphics pipeline: paths, tokens, embedded web
 * fonts, and a headless-Chrome runner.
 *
 * Nothing here touches the network except Google Fonts (cached under
 * build/_cache after the first run), and nothing touches Firebase / R2 / stores.
 */
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const ROOT = path.resolve(__dirname, '../../..');
export const GFX = __dirname;
export const BUILD = path.join(GFX, 'build');
export const OUT = path.join(GFX, 'out');
/** Raw captures live in raw/; STORE_RAW_DIR points the renderer somewhere else (used for layout tests). */
export const RAW = process.env.STORE_RAW_DIR ? path.resolve(process.env.STORE_RAW_DIR) : path.join(GFX, 'raw');
export const CHROME =
  process.env.CHROME_BIN ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

// A private profile so a headless run never attaches to (or opens a window in)
// the Chrome you are using.
const PROFILE = path.join(os.tmpdir(), 'resonance-store-graphics-chrome');

/* ── languages ────────────────────────────────────────────────────────── */

/** The store listings we make graphics for: zh-TW (the original sets) and en (en-US). */
export type Lang = 'zh-TW' | 'en';
export const LANGS: readonly Lang[] = ['zh-TW', 'en'];

/**
 * The language(s) picked by `--lang=zh-TW`, `--lang=en` or `--lang=both` (the default when the flag is absent).
 * Used by render.ts and contact-sheet.ts so both read the flag the same way.
 */
export function parseLangs(argv: string[]): Lang[] {
  const arg = argv.find((a) => a.startsWith('--lang='));
  if (!arg) return [...LANGS];
  const v = arg.slice('--lang='.length).toLowerCase();
  if (v === 'both' || v === 'all') return [...LANGS];
  if (v === 'en') return ['en'];
  if (v === 'zh-tw' || v === 'zh') return ['zh-TW'];
  throw new Error(`unknown ${arg}: use --lang=zh-TW, --lang=en or --lang=both`);
}

/**
 * Folder name of a platform's raw captures / rendered slides in a language: the Chinese sets keep the bare
 * platform name (raw/ios → out/ios), the English ones add "-en" (raw/ios-en → out/ios-en).
 */
export const variantDir = (platform: string, lang: Lang) => (lang === 'en' ? `${platform}-en` : platform);

export const mkdirp = (p: string) => fs.mkdirSync(p, { recursive: true });
export const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/* ── design tokens (read from the real tokens.css) ────────────────────── */

export type Tokens = Record<string, string>;

export function readTokens(): Tokens {
  const css = fs.readFileSync(path.join(ROOT, 'src/styles/tokens.css'), 'utf8');
  const out: Tokens = {};
  for (const m of css.matchAll(/--color-([a-z-]+):\s*(oklch\([^)]*\))/g)) out[m[1]] = m[2];
  return out;
}

export function parseOklch(s: string): { l: number; c: number; h: number } {
  const m = s.match(/oklch\(\s*([\d.]+)%\s+([\d.]+)\s+([\d.]+)/);
  if (!m) throw new Error(`not an oklch() colour: ${s}`);
  return { l: +m[1], c: +m[2], h: +m[3] };
}

export const oklch = (l: number, c: number, h: number, a?: number) =>
  `oklch(${l}% ${c} ${h}${a != null ? ` / ${a}` : ''})`;

/* ── image helpers ────────────────────────────────────────────────────── */

export function imageSize(file: string): { w: number; h: number } {
  const out = execFileSync('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', file], {
    encoding: 'utf8',
  });
  const w = +(out.match(/pixelWidth:\s*(\d+)/)?.[1] ?? 0);
  const h = +(out.match(/pixelHeight:\s*(\d+)/)?.[1] ?? 0);
  if (!w || !h) throw new Error(`cannot read size of ${file}`);
  return { w, h };
}

/** PNG → flattened JPEG (no alpha), quality 92, via sips. */
export function toJpeg(png: string, jpg: string, quality = 92) {
  mkdirp(path.dirname(jpg));
  execFileSync(
    'sips',
    ['-s', 'format', 'jpeg', '-s', 'formatOptions', String(quality), png, '--out', jpg],
    { stdio: 'ignore' },
  );
}

export function assertSize(file: string, w: number, h: number) {
  const s = imageSize(file);
  if (s.w !== w || s.h !== h) {
    throw new Error(`${file} is ${s.w}x${s.h}, expected ${w}x${h}`);
  }
}

/* ── headless Chrome ──────────────────────────────────────────────────── */

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function baseArgs(w: number, h: number): string[] {
  return [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--force-device-scale-factor=1',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--disable-background-networking',
    `--user-data-dir=${PROFILE}`,
    `--window-size=${w},${h}`,
    '--virtual-time-budget=8000',
  ];
}

/**
 * Headless Chrome writes its output and then often just sits there, so we do
 * not wait for it to exit: wait for the output to settle, then kill its group.
 */
async function runChrome(args: string[], done: () => boolean, timeoutMs = 120_000) {
  const child = spawn(CHROME, args, { stdio: 'ignore', detached: true });
  const t0 = Date.now();
  let exited = false;
  child.on('exit', () => (exited = true));
  try {
    while (Date.now() - t0 < timeoutMs) {
      if (done()) {
        await sleep(150); // let the write finish
        if (done()) return;
      }
      if (exited && !done()) throw new Error('Chrome exited without producing output');
      await sleep(120);
    }
    throw new Error(`Chrome timed out after ${timeoutMs}ms`);
  } finally {
    try {
      process.kill(-child.pid!, 'SIGKILL');
    } catch {
      /* already gone */
    }
    spawnSync('pkill', ['-f', PROFILE], { stdio: 'ignore' });
  }
}

/** Render `html` to an exact-size PNG. */
export async function screenshot(html: string, png: string, w: number, h: number) {
  mkdirp(path.dirname(png));
  fs.rmSync(png, { force: true });
  let last = -1;
  await runChrome([...baseArgs(w, h), `--screenshot=${png}`, `file://${html}`], () => {
    if (!fs.existsSync(png)) return false;
    const size = fs.statSync(png).size;
    const stable = size > 0 && size === last;
    last = size;
    return stable;
  });
  assertSize(png, w, h);
}

/** Load `html` and return the DOM after scripts ran (used for the checks). */
export async function dumpDom(html: string, w: number, h: number): Promise<string> {
  const out = path.join(BUILD, '_cache', `dom-${crypto.randomBytes(4).toString('hex')}.html`);
  mkdirp(path.dirname(out));
  fs.writeFileSync(out, '');
  const fd = fs.openSync(out, 'w');
  const child = spawn(CHROME, [...baseArgs(w, h), '--dump-dom', `file://${html}`], {
    stdio: ['ignore', fd, 'ignore'],
    detached: true,
  });
  const t0 = Date.now();
  try {
    while (Date.now() - t0 < 60_000) {
      if (fs.readFileSync(out, 'utf8').includes('</html>')) break;
      await sleep(150);
    }
  } finally {
    try {
      process.kill(-child.pid!, 'SIGKILL');
    } catch {
      /* gone */
    }
    spawnSync('pkill', ['-f', PROFILE], { stdio: 'ignore' });
    fs.closeSync(fd);
  }
  const dom = fs.readFileSync(out, 'utf8');
  fs.rmSync(out, { force: true });
  return dom;
}

/* ── web fonts, embedded so the HTML is self-contained ────────────────── */

export interface FontSpec {
  family: string; // Google Fonts family name, e.g. 'Noto Serif TC'
  weights: number[];
  text: string; // only these glyphs are fetched (keeps CJK fonts tiny)
}

const CHROME_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

async function cachedFetch(url: string, ext: string, headers?: Record<string, string>) {
  const dir = path.join(BUILD, '_cache', 'fonts');
  mkdirp(dir);
  const file = path.join(dir, crypto.createHash('sha1').update(url).digest('hex') + ext);
  if (fs.existsSync(file)) return fs.readFileSync(file);
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(file, buf);
  return buf;
}

export async function embeddedFonts(specs: FontSpec[]): Promise<string> {
  const blocks: string[] = [];
  for (const spec of specs) {
    const glyphs = [...new Set([...spec.text])].sort().join('');
    const family = spec.family.replace(/ /g, '+');
    const url =
      `https://fonts.googleapis.com/css2?family=${family}:wght@${spec.weights.join(';')}` +
      `&text=${encodeURIComponent(glyphs)}&display=block`;
    try {
      let css = (await cachedFetch(url, '.css', { 'User-Agent': CHROME_UA })).toString('utf8');
      const urls = [...css.matchAll(/url\((https:[^)]+)\)/g)].map((m) => m[1]);
      for (const u of new Set(urls)) {
        const data = await cachedFetch(u, '.woff2');
        css = css.split(u).join(`data:font/woff2;base64,${data.toString('base64')}`);
      }
      blocks.push(css);
    } catch (err) {
      console.warn(`  ! font ${spec.family} unavailable (${(err as Error).message}); using a system fallback`);
    }
  }
  return blocks.join('\n');
}
