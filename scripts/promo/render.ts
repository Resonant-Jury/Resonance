/**
 * Renders the promo animation (scripts/promo/page) to MP4, frame by frame.
 *
 *   npx tsx scripts/promo/render.ts [--locale zh-TW|en|all] [--fps 60] [--workers 4]
 *                                   [--out docs/media] [--from 0] [--to <end>]
 *                                   [--stills 1.5,8,20 [--stills-dir <dir>]] [--preview [--poster-at 4.6]]
 *
 * The page is a pure function of time (`window.__promo.renderAt(t)`), so every
 * frame is set, screenshotted and piped to ffmpeg — no clock, no dropped
 * frames. It talks to a headless Chrome over the DevTools protocol (Node's
 * own WebSocket), so it needs no browser library: only Chrome (CHROME_PATH,
 * else the usual install) and ffmpeg on PATH (with libx264, and libsvtav1 for
 * --preview).
 * The workers render consecutive slices into segments of one encoding, which
 * ffmpeg then joins without re-encoding.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { cpus, tmpdir } from 'node:os';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const PAGE_DIR = join(ROOT, 'scripts/promo/page');
const WIDTH = 1920;
const HEIGHT = 1080;
const LOCALES = ['zh-TW', 'en'] as const;
type Locale = (typeof LOCALES)[number];

interface Options {
  locales: Locale[];
  fps: number;
  workers: number;
  out: string;
  from: number;
  to: number | null;
  stills: number[] | null;
  stillsDir: string;
  preview: boolean;
  posterAt: number;
}

function parseArgs(argv: string[]): Options {
  const get = (name: string) => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const locale = get('locale') ?? 'all';
  if (locale !== 'all' && !LOCALES.includes(locale as Locale)) throw new Error(`Unknown --locale ${locale}`);
  const stills = get('stills');
  return {
    locales: locale === 'all' ? [...LOCALES] : [locale as Locale],
    fps: Number(get('fps') ?? 60),
    workers: Number(get('workers') ?? Math.max(1, Math.min(4, Math.floor(cpus().length / 2)))),
    out: resolve(ROOT, get('out') ?? 'docs/media'),
    from: Number(get('from') ?? 0),
    to: get('to') != null ? Number(get('to')) : null,
    stills: stills ? stills.split(',').map(Number) : null,
    stillsDir: resolve(ROOT, get('stills-dir') ?? join(tmpdir(), 'resonance-promo-stills')),
    preview: argv.includes('--preview'),
    posterAt: Number(get('poster-at') ?? 4.6),
  };
}

// ── The page ──────────────────────────────────────────────────────────

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.ttf': 'font/ttf',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

/** Bundles the page and serves it, with the apps' fonts and the store badges, on a free local port. */
async function servePage(): Promise<{ server: Server; origin: string }> {
  const bundle = await build({
    entryPoints: [join(PAGE_DIR, 'main.ts')],
    bundle: true,
    format: 'iife',
    target: 'chrome120',
    write: false,
    tsconfig: join(ROOT, 'tsconfig.json'),
    logLevel: 'warning',
  });
  const js = bundle.outputFiles[0].text;
  // The site's own tokens, with the handwriting face read from the apps' copy instead of a CDN.
  const tokens = readFileSync(join(ROOT, 'src/styles/tokens.css'), 'utf8').replace(
    /url\('https:\/\/cdn\.jsdelivr\.net[^']*'\)/,
    "url('/fonts/ChenYuluoyanThin.ttf')",
  );
  const css = readFileSync(join(PAGE_DIR, 'promo.css'), 'utf8');
  const html = `<!doctype html><html><head><meta charset="utf-8">
<style>${tokens}</style><style>${css}</style></head>
<body><div id="stage"></div><script src="/main.js"></script></body></html>`;

  const files: Record<string, string> = {
    '/fonts/': join(ROOT, 'apps/shared/fonts'),
    '/badges/': join(ROOT, 'public/badges'),
  };
  const server = createServer((req, res) => {
    const path = decodeURIComponent((req.url ?? '/').split('?')[0]);
    if (path === '/' || path === '/index.html') {
      res.writeHead(200, { 'content-type': MIME['.html'] }).end(html);
      return;
    }
    if (path === '/main.js') {
      res.writeHead(200, { 'content-type': MIME['.js'] }).end(js);
      return;
    }
    for (const [prefix, dir] of Object.entries(files)) {
      if (!path.startsWith(prefix)) continue;
      const file = join(dir, path.slice(prefix.length));
      if (file.startsWith(dir) && existsSync(file) && statSync(file).isFile()) {
        res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
        res.end(readFileSync(file));
        return;
      }
    }
    res.writeHead(404).end();
  });
  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No port');
  return { server, origin: `http://127.0.0.1:${address.port}` };
}

// ── Chrome over the DevTools protocol ─────────────────────────────────

function chromePath(): string {
  const candidates = [
    process.env.CHROME_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
  ].filter((p): p is string => !!p);
  const found = candidates.find((p) => existsSync(p));
  if (!found) throw new Error('Chrome not found: set CHROME_PATH');
  return found;
}

type Pending = { ok: (v: unknown) => void; fail: (e: Error) => void };

class Cdp {
  private next = 1;
  private pending = new Map<number, Pending>();
  private constructor(private ws: WebSocket) {
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(String(ev.data)) as { id?: number; result?: unknown; error?: { message: string } };
      if (msg.id == null) return;
      const p = this.pending.get(msg.id);
      if (!p) return;
      this.pending.delete(msg.id);
      if (msg.error) p.fail(new Error(msg.error.message));
      else p.ok(msg.result);
    });
  }

  static async connect(url: string): Promise<Cdp> {
    const ws = new WebSocket(url);
    await new Promise<void>((ok, fail) => {
      ws.addEventListener('open', () => ok(), { once: true });
      ws.addEventListener('error', () => fail(new Error('DevTools socket failed')), { once: true });
    });
    return new Cdp(ws);
  }

  send<T = unknown>(method: string, params: object = {}, sessionId?: string): Promise<T> {
    const id = this.next++;
    this.ws.send(JSON.stringify({ id, method, params, sessionId }));
    return new Promise<T>((ok, fail) => this.pending.set(id, { ok: ok as (v: unknown) => void, fail }));
  }

  close() {
    this.ws.close();
  }
}

async function launchChrome(): Promise<{ proc: ChildProcess; cdp: Cdp; profile: string }> {
  const profile = mkdtempSync(join(tmpdir(), 'resonance-promo-chrome-'));
  const proc = spawn(
    chromePath(),
    [
      '--headless=new',
      '--remote-debugging-port=0',
      `--user-data-dir=${profile}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--hide-scrollbars',
      '--mute-audio',
      '--force-color-profile=srgb',
      '--font-render-hinting=none',
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
      '--disable-backgrounding-occluded-windows',
      `--window-size=${WIDTH},${HEIGHT}`,
      'about:blank',
    ],
    { stdio: ['ignore', 'ignore', 'pipe'] },
  );
  const url = await new Promise<string>((ok, fail) => {
    let err = '';
    proc.stderr!.on('data', (chunk: Buffer) => {
      err += chunk.toString();
      const m = err.match(/DevTools listening on (ws:\/\/\S+)/);
      if (m) ok(m[1]);
    });
    proc.on('exit', (code) => fail(new Error(`Chrome exited (${code}): ${err.slice(-500)}`)));
  });
  return { proc, cdp: await Cdp.connect(url), profile };
}

interface Page {
  session: string;
  eval<T>(expression: string): Promise<T>;
  frame(t: number): Promise<Buffer>;
}

async function openPage(cdp: Cdp, url: string): Promise<Page> {
  const { targetId } = await cdp.send<{ targetId: string }>('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await cdp.send<{ sessionId: string }>('Target.attachToTarget', { targetId, flatten: true });
  const send = <T>(method: string, params: object = {}) => cdp.send<T>(method, params, sessionId);
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: WIDTH, height: HEIGHT, deviceScaleFactor: 1, mobile: false });
  await send('Emulation.setFocusEmulationEnabled', { enabled: true });
  await send('Page.navigate', { url });

  const evaluate = async <T>(expression: string): Promise<T> => {
    const r = await send<{ result: { value: T }; exceptionDetails?: { text: string; exception?: { description?: string } } }>(
      'Runtime.evaluate',
      { expression, awaitPromise: true, returnByValue: true },
    );
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    return r.result.value;
  };

  // Wait for the bundle to define the API, then for its fonts and pictures.
  for (let i = 0; i < 200; i++) {
    if (await evaluate<boolean>('typeof window.__promo === "object"')) break;
    await new Promise((r) => setTimeout(r, 50));
  }
  await evaluate('window.__promo.ready');

  return {
    session: sessionId,
    eval: evaluate,
    async frame(t: number) {
      // Set the frame, then let the page lay it out and paint once before the shot.
      await evaluate(`(window.__promo.renderAt(${t}), new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))))`);
      const { data } = await send<{ data: string }>('Page.captureScreenshot', { format: 'png', optimizeForSpeed: true });
      return Buffer.from(data, 'base64');
    },
  };
}

// ── Encoding ──────────────────────────────────────────────────────────

const X264 = [
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '20', '-tune', 'animation',
  '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-x264-params', 'colorprim=bt709:transfer=bt709:colormatrix=bt709',
  '-vf', 'scale=out_color_matrix=bt709:out_range=tv',
  '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709', '-color_range', 'tv',
];

function run(cmd: string, args: string[], stdin?: 'pipe'): ChildProcess {
  const proc = spawn(cmd, args, { stdio: [stdin ?? 'ignore', 'ignore', 'pipe'] });
  let err = '';
  proc.stderr!.on('data', (c: Buffer) => (err = (err + c.toString()).slice(-4000)));
  proc.on('exit', (code) => {
    if (code) console.error(`${cmd} exited ${code}:\n${err}`);
  });
  return proc;
}

function done(proc: ChildProcess): Promise<void> {
  return new Promise((ok, fail) => {
    if (proc.exitCode != null) return proc.exitCode ? fail(new Error(`exit ${proc.exitCode}`)) : ok();
    proc.on('exit', (code) => (code ? fail(new Error(`exit ${code}`)) : ok()));
  });
}

async function write(proc: ChildProcess, buf: Buffer) {
  if (!proc.stdin!.write(buf)) await new Promise((r) => proc.stdin!.once('drain', r));
}

// ── Main ──────────────────────────────────────────────────────────────

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const { server, origin } = await servePage();
  const { proc: chrome, cdp, profile } = await launchChrome();
  try {
    for (const locale of opts.locales) {
      const url = `${origin}/?locale=${encodeURIComponent(locale)}`;

      if (opts.stills) {
        mkdirSync(opts.stillsDir, { recursive: true });
        const page = await openPage(cdp, url);
        for (const t of opts.stills) {
          const file = join(opts.stillsDir, `${locale}-${t.toFixed(2)}.png`);
          writeFileSync(file, await page.frame(t));
          console.log(file);
        }
        continue;
      }

      const probe = await openPage(cdp, url);
      const duration = await probe.eval<number>('window.__promo.duration');
      const end = Math.min(opts.to ?? duration, duration);
      const first = Math.round(opts.from * opts.fps);
      const last = Math.round(end * opts.fps); // exclusive
      const total = last - first;
      const workers = Math.max(1, Math.min(opts.workers, Math.ceil(total / 60)));
      const per = Math.ceil(total / workers);
      const tmp = mkdtempSync(join(tmpdir(), 'resonance-promo-'));
      console.log(`${locale}: ${total} frames at ${opts.fps} fps, ${workers} workers`);

      const pages = [probe, ...(await Promise.all(Array.from({ length: workers - 1 }, () => openPage(cdp, url))))];
      let rendered = 0;
      const started = Date.now();
      const segments = await Promise.all(
        pages.map(async (page, w) => {
          const a = first + w * per;
          const b = Math.min(last, a + per);
          const file = join(tmp, `segment-${w}.mp4`);
          const ff = run(
            'ffmpeg',
            ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(opts.fps), '-c:v', 'png', '-i', '-',
              ...X264, '-r', String(opts.fps), '-an', file],
            'pipe',
          );
          for (let f = a; f < b; f++) {
            await write(ff, await page.frame(f / opts.fps));
            rendered++;
            if (rendered % 120 === 0) {
              const s = (Date.now() - started) / 1000;
              console.log(`  ${rendered}/${total} frames, ${(rendered / s).toFixed(1)} fps`);
            }
          }
          ff.stdin!.end();
          await done(ff);
          return file;
        }),
      );

      mkdirSync(opts.out, { recursive: true });
      const list = join(tmp, 'segments.txt');
      writeFileSync(list, segments.map((s) => `file '${s}'`).join('\n'));
      const mp4 = join(opts.out, `resonance-intro.${locale}.mp4`);
      await done(run('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', '-movflags', '+faststart', mp4]));
      console.log(`${mp4} (${(statSync(mp4).size / 1e6).toFixed(1)} MB)`);

      if (opts.preview) await preview(mp4, join(opts.out, `resonance-intro.${locale}`), opts.posterAt);
      rmSync(tmp, { recursive: true, force: true });
    }
  } finally {
    cdp.close();
    const exited = new Promise((r) => chrome.once('exit', r));
    chrome.kill();
    await exited;
    server.close();
    rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
}

/**
 * For places that can't play an MP4 inline (a GitHub README): a looping animated AVIF at 1280 px and
 * 30 fps (a real video codec, so a fade leaves nothing behind, at a fraction of a GIF's size) and a
 * JPEG still of the moment `posterAt` for anything that shows no AVIF.
 */
async function preview(mp4: string, out: string, posterAt: number) {
  const avif = `${out}.avif`;
  const jpg = `${out}.jpg`;
  await done(run('ffmpeg', ['-y', '-loglevel', 'error', '-i', mp4, '-vf', 'fps=30,scale=1280:-2:flags=lanczos,format=yuv420p',
    '-c:v', 'libsvtav1', '-crf', '34', '-preset', '5', '-g', '120', '-an', '-loop', '0', '-f', 'avif', avif]));
  await done(run('ffmpeg', ['-y', '-loglevel', 'error', '-ss', String(posterAt), '-i', mp4, '-frames:v', '1', '-vf', 'scale=1280:-2:flags=lanczos', '-q:v', '3', jpg]));
  for (const f of [avif, jpg]) console.log(`${f} (${(statSync(f).size / 1e6).toFixed(1)} MB)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
