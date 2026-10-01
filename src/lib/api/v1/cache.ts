import { createHash } from 'node:crypto';

/**
 * HTTP caching for the v1 reads.
 *
 * Every v1 answer depends on who asks (their blocks, their connections,
 * whether they wrote the card), so none is ever `public` and none carries
 * `s-maxage`: only the viewer's own client may keep it, under `Vary` on what
 * identifies them. Each answer has a strong ETag from its bytes, and a
 * request whose `If-None-Match` names it gets an empty 304.
 *
 * How long an answer stays fresh is the client's choice to make safely: a
 * client that reuses an answer without asking must also ask past its cache
 * (`Cache-Control: no-cache`) right after the viewer writes or blocks
 * someone, and clear the cache on sign-out — or a profile reloaded after
 * "block" still shows the person. Clients built before this (iOS build 3
 * keeps answers in URLSession's cache and reloads the profile straight after
 * a block) don't, so an answer is only fresh for a while when the request
 * says the client does: `X-Resonance-Cache: 1`. Everyone else — the web,
 * whose SWR decides when to ask again — gets `private, no-cache`: the answer
 * is kept but checked each time, and an unchanged one costs a 304.
 */

/** The request header with which a client says it bypasses its cache after its viewer's own writes and blocks. */
export const CACHE_OPT_IN_HEADER = 'X-Resonance-Cache';

/** What a v1 answer varies by: who asks, and whether their client keeps answers. */
export const VARY = `Authorization, Cookie, ${CACHE_OPT_IN_HEADER}`;

/** How long a v1 read may be reused without asking again. */
export type Freshness =
  /** Kept, but checked on every use (ETag → 304). */
  | { kind: 'revalidate' }
  /** Reused for `maxAge` seconds by a client that opted in; checked each time otherwise. */
  | { kind: 'fresh'; maxAge: number }
  /** Never kept. */
  | { kind: 'none' };

/** The viewer's own account and shelves, and anything they may just have changed. */
export const OWN: Freshness = { kind: 'revalidate' };
/** Someone else's card or profile, and the lists around them: half a minute. */
export const BRIEF: Freshness = { kind: 'fresh', maxAge: 30 };
/** An answer the client should ask for again soon (e.g. picks still being prepared). */
export const NEVER: Freshness = { kind: 'none' };

/** Seconds until the next UTC midnight (at least 1): when the recommender's day turns. */
export function secondsUntilUtcMidnight(now = Date.now()): number {
  const d = new Date(now);
  const midnight = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
  return Math.max(1, Math.ceil((midnight - now) / 1000));
}

/** A strong validator for exactly these bytes. */
export function etagOf(body: string): string {
  return `"${createHash('sha256').update(body).digest('base64url').slice(0, 27)}"`;
}

/**
 * Whether `If-None-Match` names `etag` — the weak comparison RFC 9110 asks
 * for here, so a proxy that weakened the tag (`W/"…"`) still matches.
 */
export function noneMatchHits(ifNoneMatch: string | null, etag: string): boolean {
  if (!ifNoneMatch) return false;
  const bare = (tag: string) => tag.trim().replace(/^W\//, '');
  return ifNoneMatch.split(',').some((tag) => tag.trim() === '*' || bare(tag) === bare(etag));
}

export function optedIn(req: Request): boolean {
  return req.headers.get(CACHE_OPT_IN_HEADER) === '1';
}

/** The Cache-Control a v1 read answers `req` with. */
export function cacheControl(req: Request, freshness: Freshness): string {
  if (freshness.kind === 'none') return 'no-store';
  if (freshness.kind === 'fresh' && optedIn(req)) return `private, max-age=${freshness.maxAge}`;
  return 'private, no-cache';
}

/**
 * A v1 read's JSON answer with its caching headers — or a 304 when the
 * client already holds exactly this answer.
 */
export function cachedJson(req: Request, body: unknown, freshness: Freshness): Response {
  const json = JSON.stringify(body);
  const headers = new Headers({ 'Cache-Control': cacheControl(req, freshness), Vary: VARY });
  if (freshness.kind !== 'none') {
    const etag = etagOf(json);
    headers.set('ETag', etag);
    if (noneMatchHits(req.headers.get('If-None-Match'), etag)) return new Response(null, { status: 304, headers });
  }
  headers.set('Content-Type', 'application/json');
  return new Response(json, { status: 200, headers });
}
