import dns from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import { isIP, type LookupFunction } from 'node:net';
import zlib from 'node:zlib';
import type { Readable } from 'node:stream';
import { isInternalHostName, isPublicAddress } from './ip';
import { normalizeLink } from './url';

/**
 * A server-side fetch that cannot be turned against our own network.
 *
 * A link preview means our servers open a URL a stranger wrote. Everything a
 * hostile one could try is closed here, in the order it would be tried:
 *
 *  - The URL goes through `normalizeLink` first and again on every redirect:
 *    http or https, no user name, no odd port, a name with a dot. `127.1`,
 *    `2130706433` and `0x7f.1` are already `127.0.0.1` by then.
 *  - The name is resolved HERE (`dns.lookup`, all addresses) and the fetch is
 *    refused if ANY address is not on the public internet (`ip.ts`): loopback,
 *    private, link-local (the cloud metadata address), carrier NAT, multicast,
 *    unique-local, mapped and NAT64 forms of those. An IP written in the URL
 *    gets the same test.
 *  - The connection goes to the addresses just vetted — `lookup` handed to
 *    `http(s).request` answers with them and never asks DNS again — so a name
 *    that answers "public" the first time and "127.0.0.1" the second (DNS
 *    rebinding) is connected to the first answer. TLS still checks the
 *    certificate against the name.
 *  - Redirects are followed by hand, at most three, each hop vetted as above.
 *  - One deadline for the whole fetch, DNS and redirects and body (a server
 *    that dribbles a byte a second is cut at it).
 *  - The body is read up to a cap and no further: a page stops at `</head>`
 *    or 512 KB, an image at 5 MB, a JSON answer (an oEmbed endpoint's, see
 *    oembed.ts) at 64 KB — an image or JSON past its cap is refused, up front
 *    when its Content-Length says so, since a cut one is none. A compressed
 *    page or JSON is inflated only up to the same cap, so a gzip bomb costs
 *    what a big page does. Images are asked for uncompressed and refused if
 *    they come compressed anyway.
 *  - Only what we asked for is accepted: a page as text/html or
 *    application/xhtml+xml, JSON as application/json, an image as image/* but
 *    never SVG (the caller sniffs the bytes as well — a Content-Type is only
 *    a claim).
 *  - Nothing of ours goes with it: no cookies, no Referer, no credentials, a
 *    plain User-Agent that names us.
 */

export type FetchMode = 'page' | 'image' | 'json';

export const USER_AGENT = 'Mozilla/5.0 (compatible; ResonanceBot/1.0; +https://resonance.channel)';
export const PAGE_MAX_BYTES = 512 * 1024;
export const IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const JSON_MAX_BYTES = 64 * 1024;
export const FETCH_TIMEOUT_MS = 5000;
export const MAX_REDIRECTS = 3;
/** More addresses than this for one name is not a website. */
const MAX_ADDRESSES = 16;

export type SafeFetchFailure =
  | 'bad_url' // not a link we follow (scheme, userinfo, port, no dot, too long)
  | 'blocked' // a name or address that is not on the public internet
  | 'dns' // the name did not resolve
  | 'timeout'
  | 'redirects' // too many, or one that leads nowhere
  | 'status' // not a 2xx
  | 'content_type'
  | 'too_large'
  | 'encoding' // a Content-Encoding we do not take
  | 'network';

export class SafeFetchError extends Error {
  constructor(
    readonly reason: SafeFetchFailure,
    message?: string,
  ) {
    super(message ?? reason);
    this.name = 'SafeFetchError';
  }
}

export interface SafeFetchOptions {
  mode: FetchMode;
  /** Ends the fetch early (the unfurl's own deadline). */
  signal?: AbortSignal;
  /** The whole fetch, redirects included. */
  timeoutMs?: number;
  /** Replaces the mode's body cap (smaller only, in practice). */
  maxBytes?: number;
}

export interface SafeFetchResult {
  /** The last URL fetched, after redirects (each hop passed the same checks as the first). */
  url: string;
  status: number;
  /** The Content-Type's media type, lower-cased, without parameters. */
  contentType: string;
  /** The Content-Type's `charset`, if it named one. */
  charset: string | null;
  body: Buffer;
  /** The body was cut at the cap (or at `</head>`) rather than read to its end. */
  truncated: boolean;
}

/**
 * What the fetch trusts. The defaults are the policy; a test replaces them to
 * reach a server on this machine. Nothing in the app does.
 */
export interface FetchPolicy {
  /** The addresses of a name. */
  resolve(host: string): Promise<string[]>;
  /** Whether the fetch may connect to this address. */
  allowAddress(address: string): boolean;
  /** Whether any port will do (a test server listens on a random one). */
  allowAnyPort: boolean;
  /** An extra certificate authority to trust for https (a test server's own). */
  tlsCa?: string | Buffer;
}

const defaultPolicy: FetchPolicy = {
  async resolve(host) {
    const found = await dns.promises.lookup(host, { all: true, verbatim: true });
    return found.map((a) => a.address);
  },
  allowAddress: isPublicAddress,
  allowAnyPort: false,
};

/** Reject when `signal` aborts, whatever `work` is doing (DNS lookups cannot be cancelled). */
function abortable<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(new SafeFetchError('timeout'));
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new SafeFetchError('timeout'));
    signal.addEventListener('abort', onAbort, { once: true });
    work.then(
      (v) => {
        signal.removeEventListener('abort', onAbort);
        resolve(v);
      },
      (e) => {
        signal.removeEventListener('abort', onAbort);
        reject(e);
      },
    );
  });
}

/** The addresses to connect to for this URL: its own IP, or its name's after vetting every answer. */
async function vettedAddresses(url: URL, policy: FetchPolicy, signal: AbortSignal): Promise<string[]> {
  const host = url.hostname.startsWith('[') ? url.hostname.slice(1, -1) : url.hostname;
  if (isIP(host)) {
    if (!policy.allowAddress(host)) throw new SafeFetchError('blocked', 'address');
    return [host];
  }
  if (isInternalHostName(host)) throw new SafeFetchError('blocked', 'name');
  let addresses: string[];
  try {
    addresses = await abortable(policy.resolve(host), signal);
  } catch (e) {
    if (e instanceof SafeFetchError) throw e;
    throw new SafeFetchError('dns');
  }
  if (!addresses.length) throw new SafeFetchError('dns');
  if (addresses.length > MAX_ADDRESSES) throw new SafeFetchError('blocked', 'addresses');
  // ANY private answer refuses the host: a name that also points inside is not one we trust.
  if (!addresses.every((a) => policy.allowAddress(a))) throw new SafeFetchError('blocked', 'address');
  return [...new Set(addresses)];
}

/** A `lookup` for http(s).request that answers with the vetted addresses and asks nobody. */
function pinnedLookup(addresses: string[]): LookupFunction {
  const entries = addresses.map((address) => ({ address, family: isIP(address) === 6 ? 6 : 4 }));
  return ((_host: string, optionsOrCallback: unknown, maybeCallback?: unknown) => {
    const callback = (typeof optionsOrCallback === 'function' ? optionsOrCallback : maybeCallback) as (
      err: Error | null,
      address?: string | { address: string; family: number }[],
      family?: number,
    ) => void;
    const options = typeof optionsOrCallback === 'object' && optionsOrCallback ? (optionsOrCallback as { all?: boolean; family?: number }) : {};
    const usable = options.family === 4 || options.family === 6 ? entries.filter((e) => e.family === options.family) : entries;
    if (!usable.length) return callback(Object.assign(new Error('no address'), { code: 'ENOTFOUND' }));
    if (options.all) callback(null, usable);
    else callback(null, usable[0].address, usable[0].family);
  }) as LookupFunction;
}

function headersFor(mode: FetchMode): Record<string, string> {
  return {
    'User-Agent': USER_AGENT,
    Accept:
      mode === 'page'
        ? 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.1'
        : mode === 'json'
          ? 'application/json'
          : 'image/avif,image/webp,image/png,image/jpeg,image/gif;q=0.9,*/*;q=0.1',
    // A page or JSON is inflated by us, up to the cap; an image is never compressed.
    'Accept-Encoding': mode === 'image' ? 'identity' : 'gzip, deflate, br',
    'Accept-Language': 'en, zh-TW;q=0.9',
    Connection: 'close',
  };
}

/** One request to one vetted set of addresses; resolves with the response once its headers are in. */
function requestOnce(url: URL, addresses: string[], mode: FetchMode, signal: AbortSignal, ca?: string | Buffer): Promise<http.IncomingMessage> {
  return new Promise((resolve, reject) => {
    const secure = url.protocol === 'https:';
    const host = url.hostname.startsWith('[') ? url.hostname.slice(1, -1) : url.hostname;
    const options: https.RequestOptions = {
      host,
      port: url.port ? Number(url.port) : secure ? 443 : 80,
      path: `${url.pathname}${url.search}`,
      method: 'GET',
      headers: headersFor(mode),
      lookup: pinnedLookup(addresses),
      // A fresh socket for every hop: a pooled one could outlive the vetting of its address.
      agent: false,
      signal,
      ...(secure && !isIP(host) ? { servername: host } : {}),
      ...(secure && ca ? { ca } : {}),
    };
    const req = (secure ? https : http).request(options, resolve);
    req.on('error', (e) => reject(signal.aborted ? new SafeFetchError('timeout') : new SafeFetchError('network', (e as Error).message)));
    req.end();
  });
}

function mediaTypeOf(res: http.IncomingMessage): { type: string; charset: string | null } {
  const raw = String(res.headers['content-type'] ?? '');
  const type = raw.split(';')[0].trim().toLowerCase();
  const charset = /charset\s*=\s*"?([A-Za-z0-9_.:-]{1,40})/i.exec(raw)?.[1] ?? null;
  return { type, charset };
}

function acceptable(mode: FetchMode, type: string): boolean {
  if (mode === 'page') return type === 'text/html' || type === 'application/xhtml+xml';
  if (mode === 'json') return type === 'application/json';
  return type.startsWith('image/') && type !== 'image/svg+xml' && !type.startsWith('image/svg');
}

/** The decoder for a Content-Encoding, tolerant of a stream cut short. */
function decoderFor(encoding: string): zlib.Gunzip | zlib.Inflate | zlib.BrotliDecompress | null {
  switch (encoding) {
    case 'gzip':
    case 'x-gzip':
      return zlib.createGunzip({ finishFlush: zlib.constants.Z_SYNC_FLUSH });
    case 'deflate':
      return zlib.createInflate({ finishFlush: zlib.constants.Z_SYNC_FLUSH });
    case 'br':
      return zlib.createBrotliDecompress({ finishFlush: zlib.constants.BROTLI_OPERATION_FLUSH });
    default:
      return null;
  }
}

/** Whether the bytes seen so far contain the end of the page's head. */
function endsHead(previousTail: Buffer, chunk: Buffer): boolean {
  const window = Buffer.concat([previousTail, chunk]).toString('latin1').toLowerCase();
  return window.includes('</head');
}

/** Read a response body up to the cap, decoding a compressed page only as far as the cap. */
function readBody(
  res: http.IncomingMessage,
  mode: FetchMode,
  maxBytes: number,
  signal: AbortSignal,
): Promise<{ body: Buffer; truncated: boolean }> {
  const encoding = String(res.headers['content-encoding'] ?? 'identity').trim().toLowerCase();
  const decoder = encoding === 'identity' || encoding === '' ? null : mode === 'image' ? null : decoderFor(encoding);
  if (encoding !== 'identity' && encoding !== '' && !decoder) {
    res.destroy();
    return Promise.reject(new SafeFetchError('encoding', encoding));
  }
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let tail: Buffer = Buffer.alloc(0);
    let settled = false;
    const source: Readable = decoder ? res.pipe(decoder) : res;
    const cleanup = () => {
      signal.removeEventListener('abort', onAbort);
      source.removeAllListeners('data');
      res.destroy();
      decoder?.destroy();
    };
    const finish = (truncated: boolean) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve({ body: Buffer.concat(chunks, size), truncated });
    };
    const fail = (error: SafeFetchError) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };
    const onAbort = () => fail(new SafeFetchError('timeout'));
    signal.addEventListener('abort', onAbort, { once: true });
    if (signal.aborted) return onAbort();

    source.on('data', (piece: Buffer) => {
      if (settled) return;
      if (mode !== 'page') {
        // Part of a picture or of a JSON answer is neither.
        if (size + piece.length > maxBytes) return fail(new SafeFetchError('too_large'));
      } else if (size + piece.length > maxBytes) {
        piece = piece.subarray(0, maxBytes - size);
      }
      chunks.push(piece);
      size += piece.length;
      if (mode === 'page') {
        if (size >= maxBytes || endsHead(tail, piece)) return finish(true);
        // The last bytes seen, whatever the chunk sizes: `</head` may arrive a byte at a time.
        tail = Buffer.concat([tail, piece]).subarray(-6);
      }
    });
    // A connection that drops mid-page still leaves a head worth reading; a cut-off image is no image.
    const dropped = (error: SafeFetchError) => (mode === 'page' && size > 0 && !signal.aborted ? finish(true) : fail(error));
    source.on('end', () => finish(false));
    source.on('error', (e: Error) => dropped(new SafeFetchError(signal.aborted ? 'timeout' : decoder ? 'encoding' : 'network', e.message)));
    if (decoder) res.on('error', (e: Error) => dropped(new SafeFetchError(signal.aborted ? 'timeout' : 'network', e.message)));
    res.on('close', () => {
      if (!settled && !res.complete) dropped(new SafeFetchError('network', 'closed'));
    });
  });
}

/** `createSafeFetch` with the given policy: the app uses the default one (`safeFetch`); tests reach a local server. */
export function createSafeFetch(overrides: Partial<FetchPolicy> = {}) {
  const policy: FetchPolicy = { ...defaultPolicy, ...overrides };

  return async function safeFetch(link: string, options: SafeFetchOptions): Promise<SafeFetchResult> {
    const deadline = AbortSignal.timeout(options.timeoutMs ?? FETCH_TIMEOUT_MS);
    const signal = options.signal ? AbortSignal.any([deadline, options.signal]) : deadline;
    const cap = Math.min(
      options.maxBytes ?? Infinity,
      options.mode === 'page' ? PAGE_MAX_BYTES : options.mode === 'json' ? JSON_MAX_BYTES : IMAGE_MAX_BYTES,
    );

    let current = normalizeLink(link, { anyPort: policy.allowAnyPort });
    if (!current) throw new SafeFetchError('bad_url');
    for (let hop = 0; ; hop++) {
      const url = new URL(current);
      const addresses = await vettedAddresses(url, policy, signal);
      const res = await requestOnce(url, addresses, options.mode, signal, policy.tlsCa);
      const status = res.statusCode ?? 0;

      if (status >= 300 && status < 400 && res.headers.location) {
        res.destroy();
        if (hop >= MAX_REDIRECTS) throw new SafeFetchError('redirects', 'too many');
        let next: string | null = null;
        try {
          next = normalizeLink(new URL(res.headers.location, url).href, { anyPort: policy.allowAnyPort });
        } catch {
          next = null;
        }
        // A redirect to ftp:, a user@host, an odd port, a bare name: not a place we go.
        if (!next) throw new SafeFetchError('redirects', 'target');
        current = next;
        continue;
      }
      if (status < 200 || status >= 300) {
        res.destroy();
        throw new SafeFetchError('status', String(status));
      }

      const { type, charset } = mediaTypeOf(res);
      if (!acceptable(options.mode, type)) {
        res.destroy();
        throw new SafeFetchError('content_type', type);
      }
      if (options.mode !== 'page') {
        const declared = Number(res.headers['content-length']);
        if (Number.isFinite(declared) && declared > cap) {
          res.destroy();
          throw new SafeFetchError('too_large', 'content-length');
        }
      }
      const { body, truncated } = await readBody(res, options.mode, cap, signal);
      return { url: current, status, contentType: type, charset, body, truncated };
    }
  };
}

/** The fetch the app uses: the public internet only. */
export const safeFetch = createSafeFetch();
