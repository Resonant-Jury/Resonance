import { createHmac, hkdfSync, timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';
import sharp from 'sharp';
import { isInternalHostName, isPublicAddress } from './ip';
import { createMemo } from './memo';
import { IMAGE_MAX_BYTES, safeFetch as defaultFetch, SafeFetchError, type SafeFetchOptions, type SafeFetchResult } from './safeFetch';
import { LINK_MAX_LENGTH, normalizeLink } from './url';

/**
 * The picture of a link preview, served from our own origin.
 *
 * A preview card shows the page's `og:image`. Loading it straight from the
 * page's site would tell that site who is reading the chat (and when, and
 * from where), let it serve different pictures to different people, and
 * hand every client a stranger's file to decode. So the server fetches it
 * once (`safeFetch`, public addresses only), decodes it itself and sends our
 * own small WebP: no metadata, no animation, no format a client has to
 * trust.
 *
 * The route is public — `<img>` and the apps' image loaders carry no
 * credentials — so it must not become an open proxy. Every URL it will fetch
 * carries an HMAC, made here when a message is unfurled: only an address the
 * server itself chose to preview can be asked for, and nobody can mint a new
 * one without the key. The signature is checked before anything else
 * happens, in constant time.
 *
 * A signature stops strangers choosing the address, not someone who holds one
 * (every reader of the conversation does) from asking for it again and again,
 * past the CDN with a spelling of the URL it has not seen. So the work is
 * bounded here too: the outcome for an address is remembered for a while (a
 * failure too, and keyed by the address, not by how the request spelled it),
 * so it is fetched once however often it is asked for; only a few pictures
 * are decoded at a time; and a picture may not have more than PROXY_MAX_PIXELS
 * pixels.
 *
 * A failure is remembered by this instance alone, and only briefly when it
 * may pass (a slow or unreachable site, an error page): no browser, CDN or
 * app keeps a 404 from here, so the next view of the preview asks again and
 * gets the picture — a first try that failed once must not hide it for
 * minutes (as it did, held five minutes by every cache on the way).
 */

/** The longest side of the picture we send (a card shows it at most ~300 dp wide). */
export const PROXY_EDGE = 720;
export const PROXY_QUALITY = 80;
export const LINK_IMAGE_PATH = '/api/link-image';
/**
 * The most pixels a picture may decode to. Far above any preview image (a
 * social card is ~1.2 MP, a phone photo 12 MP) and well under what an upload
 * may be: this decodes strangers' files on request, a few at a time.
 */
export const PROXY_MAX_PIXELS = 30_000_000;
/** How many pictures are fetched and decoded at once, and how many more may wait their turn. */
export const MAX_CONCURRENT = 3;
export const MAX_WAITING = 16;
/**
 * How long an instance remembers the outcome for a picture: the picture; a
 * refusal that the same address would earn again (an address off the public
 * internet, not a picture, too big, unreadable); and a failure that may pass
 * at the next try (a timeout, a dropped connection, a name that didn't
 * resolve, a status that wasn't 2xx) — remembered just long enough that a
 * thread asking for it many times at once still costs one fetch.
 */
export const REMEMBER_PICTURE_MS = 10 * 60_000;
export const REMEMBER_FAILURE_MS = 5 * 60_000;
export const REMEMBER_RETRY_MS = 15_000;
/** The fetch failures that may pass when asked again (see REMEMBER_RETRY_MS). */
const PASSING: ReadonlySet<string> = new Set(['timeout', 'network', 'dns', 'status']);
const REMEMBER_MAX = 100;

/** What sharp may report after the bytes passed `sniffImage` (it names an AVIF `heif`). */
const FORMATS = new Set(['jpeg', 'png', 'webp', 'gif', 'heif']);

/** Used only where there is no secret at all: tests, the emulators, `next dev`. */
const DEV_KEY = Buffer.from('resonance link-image development key (not a secret)');

/**
 * The HMAC key. `LINK_PREVIEW_SECRET` if it is set; otherwise one derived
 * (HKDF-SHA256, info "resonance link-image v1") from the Firebase service
 * account's private key, which every deployment has and which is never sent
 * anywhere — so a deployment needs no extra setting, and the key it signs
 * with is not the one that signs anything else. Without either, only a
 * non-production process (emulators, dev, tests) gets a fixed key; production
 * fails closed, which means no pictures, not pictures anyone can sign.
 * Changing the secret orphans the pictures of previews already written (they
 * 404 and the card shows none) — the text of a preview keeps working.
 */
export function signingKey(env: Record<string, string | undefined> = process.env): Buffer {
  const explicit = env.LINK_PREVIEW_SECRET?.trim();
  if (explicit) return Buffer.from(explicit);
  const pem = env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n').trim();
  if (pem) return Buffer.from(hkdfSync('sha256', pem, 'resonance', 'resonance link-image v1', 32));
  if (env.FIRESTORE_EMULATOR_HOST || env.NODE_ENV !== 'production') return DEV_KEY;
  throw new Error('Set LINK_PREVIEW_SECRET (or FIREBASE_PRIVATE_KEY) to sign link-preview pictures.');
}

/** base64url(HMAC-SHA256(key, url)). */
export function signImageUrl(url: string, key: Buffer = signingKey()): string {
  return createHmac('sha256', key).update(url).digest('base64url');
}

/** Whether `signature` is the signature of `url` — compared in constant time, any malformed value is a no. */
export function verifyImageSignature(url: string, signature: string, key: Buffer = signingKey()): boolean {
  if (!/^[A-Za-z0-9_-]{43}$/.test(signature)) return false;
  const expected = Buffer.from(signImageUrl(url, key));
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/**
 * The site-relative path a preview stores for its picture; clients resolve it
 * against their API/site origin. Null when `image` is not a URL the link
 * rules take (the card then shows no picture).
 */
export function imageProxyPath(image: string): string | null {
  const url = normalizeLink(image);
  if (!url) return null;
  // An address that can only be on our own network is not worth a signature (the fetch would refuse it anyway).
  const host = new URL(url).hostname;
  if (isIP(host) ? !isPublicAddress(host) : isInternalHostName(host)) return null;
  return `${LINK_IMAGE_PATH}?u=${encodeURIComponent(url)}&s=${signImageUrl(url)}`;
}

/** Which picture format these bytes are, by their first bytes — or null. SVG, PDF, HTML and the rest are null. */
export function sniffImage(bytes: Uint8Array): 'jpeg' | 'png' | 'gif' | 'webp' | 'avif' | null {
  const at = (i: number) => bytes[i];
  const text = (from: number, s: string) => [...s].every((c, i) => at(from + i) === c.charCodeAt(0));
  if (at(0) === 0xff && at(1) === 0xd8 && at(2) === 0xff) return 'jpeg';
  if (at(0) === 0x89 && text(1, 'PNG') && at(4) === 0x0d && at(5) === 0x0a && at(6) === 0x1a && at(7) === 0x0a) return 'png';
  if (text(0, 'GIF87a') || text(0, 'GIF89a')) return 'gif';
  if (text(0, 'RIFF') && text(8, 'WEBP')) return 'webp';
  if (text(4, 'ftyp') && (text(8, 'avif') || text(8, 'avis'))) return 'avif';
  return null;
}

export class ImageRefused extends Error {}

/** The picture as we send it: upright, within 720 px, WebP, first frame only, no metadata. */
export async function toPreviewWebp(bytes: Uint8Array): Promise<Buffer> {
  if (!sniffImage(bytes)) throw new ImageRefused('not a picture we take');
  try {
    // `animated` stays off: an animation is its first frame. `failOn: 'error'`: a damaged file is refused, not guessed at.
    const image = sharp(bytes, { limitInputPixels: PROXY_MAX_PIXELS, failOn: 'error', sequentialRead: true });
    const meta = await image.metadata();
    if (!meta.format || !FORMATS.has(meta.format)) throw new ImageRefused(`format ${meta.format}`);
    return await image
      .rotate()
      .resize(PROXY_EDGE, PROXY_EDGE, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: PROXY_QUALITY })
      .toBuffer();
  } catch (e) {
    throw e instanceof ImageRefused ? e : new ImageRefused(e instanceof Error ? e.message : 'unreadable');
  }
}

const NOT_FOUND_HEADERS = {
  // Kept by nobody: a picture that failed once comes back at the next view. The instance's own memory
  // (createImageCache) is what spares the site a fetch at every request.
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
};

/** Nothing to say about why: a missing signature, a refused address and a broken picture all look the same from outside. */
function notFound(): Response {
  return new Response(null, { status: 404, headers: NOT_FOUND_HEADERS });
}

/** Too many pictures are being decoded already; not a fault of the request, so nothing is remembered about it. */
export class Busy extends Error {}

/** At most `max` jobs at once, `maxWaiting` more in line (first come, first served); beyond that `Busy`. */
export function createLimiter(max: number, maxWaiting: number) {
  let active = 0;
  const waiting: (() => void)[] = [];
  return {
    async run<T>(work: () => Promise<T>): Promise<T> {
      if (active >= max) {
        if (waiting.length >= maxWaiting) throw new Busy('too many pictures at once');
        // The slot is handed over by whoever finishes: `active` does not change hands.
        await new Promise<void>((resume) => waiting.push(resume));
      } else {
        active++;
      }
      try {
        return await work();
      } finally {
        const next = waiting.shift();
        if (next) next();
        else active--;
      }
    },
  };
}

export interface ImageCacheOptions {
  max?: number;
  pictureMs?: number;
  failureMs?: number;
  retryMs?: number;
  now?: () => number;
}

/** Whether a failure may pass when the same address is asked for again. */
export function mayPass(error: unknown): boolean {
  return error instanceof SafeFetchError ? PASSING.has(error.reason) : !(error instanceof ImageRefused);
}

/**
 * What became of each picture asked for, by address: the WebP, or the failure
 * (see `createMemo`) — a refusal for a while, a failure that may pass only
 * briefly. `Busy` is never remembered: it says nothing about the picture.
 */
export function createImageCache(options: ImageCacheOptions = {}) {
  const { max = REMEMBER_MAX, pictureMs = REMEMBER_PICTURE_MS, failureMs = REMEMBER_FAILURE_MS, retryMs = REMEMBER_RETRY_MS, now } = options;
  return createMemo<Buffer>({
    max,
    now,
    keep: (outcome) => (outcome.ok ? pictureMs : outcome.error instanceof Busy ? 0 : mayPass(outcome.error) ? retryMs : failureMs),
  });
}

const sharedCache = createImageCache();
const sharedLimiter = createLimiter(MAX_CONCURRENT, MAX_WAITING);

export interface ServeDeps {
  fetch?: (url: string, options: SafeFetchOptions) => Promise<SafeFetchResult>;
  key?: Buffer;
  /** Tests give each case its own; the route shares one per instance. */
  cache?: ReturnType<typeof createImageCache>;
  limiter?: ReturnType<typeof createLimiter>;
}

/** GET /api/link-image?u=<url>&s=<signature>: see the module comment. */
export async function serveLinkImage(request: URL, deps: ServeDeps = {}): Promise<Response> {
  try {
    const written = request.searchParams.get('u');
    const signature = request.searchParams.get('s');
    if (!written || !signature || written.length > LINK_MAX_LENGTH) return notFound();
    // The signature first: nothing below runs for a URL we did not sign.
    if (!verifyImageSignature(written, signature, deps.key ?? signingKey())) return notFound();
    // We only ever sign normalized links; a signed value that is not one is a bug, not something to fetch.
    if (normalizeLink(written) !== written) return notFound();

    const fetchImage = deps.fetch ?? defaultFetch;
    const webp = await (deps.cache ?? sharedCache).get(written, () =>
      (deps.limiter ?? sharedLimiter).run(async () => toPreviewWebp((await fetchImage(written, { mode: 'image', maxBytes: IMAGE_MAX_BYTES })).body)),
    );
    return new Response(new Uint8Array(webp), {
      headers: {
        'Content-Type': 'image/webp',
        'Content-Length': String(webp.byteLength),
        // The picture of a given URL does not change for us; a week at the CDN, a day in the app.
        'Cache-Control': 'public, max-age=86400, s-maxage=604800, immutable',
        'X-Content-Type-Options': 'nosniff',
        // Nothing here is a document: if one ever were opened as one, it could load nothing.
        'Content-Security-Policy': "default-src 'none'",
      },
    });
  } catch (e) {
    if (e instanceof Busy) {
      // Come back in a moment; unlike a 404, not for a CDN or an app to remember.
      return new Response(null, { status: 503, headers: { 'Retry-After': '5', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
    }
    // The reason stays in the log, never the URL: it came from a private conversation. A fetch failure's
    // message can hold the host or its address (a socket or certificate error), so only its reason is kept.
    const why = e instanceof SafeFetchError ? `${e.name}: ${e.reason}` : e instanceof Error ? `${e.name}: ${e.message}` : 'failed';
    console.warn('[link-image]', why);
    return notFound();
  }
}
