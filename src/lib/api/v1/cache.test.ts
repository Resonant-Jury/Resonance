import { describe, expect, it } from 'vitest';
import { BRIEF, NEVER, OWN, cacheControl, cachedJson, etagOf, noneMatchHits, secondsUntilUtcMidnight } from './cache';

// The v1 reads' HTTP caching (see test/emulator/apiV1Cache.emulator.test.ts
// for the routes): who may reuse an answer for how long, and when a client
// that holds it gets an empty 304 instead.

const req = (headers: Record<string, string> = {}) => new Request('http://localhost/api/v1/feed', { headers });

describe('cacheControl', () => {
  it('lets only a client that opted in reuse an answer without asking, and never a shared cache', () => {
    expect(cacheControl(req({ 'X-Resonance-Cache': '1' }), BRIEF)).toBe('private, max-age=30');
    expect(cacheControl(req(), BRIEF)).toBe('private, no-cache');
    expect(cacheControl(req({ 'X-Resonance-Cache': 'yes' }), BRIEF)).toBe('private, no-cache');
    expect(cacheControl(req({ 'X-Resonance-Cache': '1' }), OWN)).toBe('private, no-cache');
    expect(cacheControl(req({ 'X-Resonance-Cache': '1' }), NEVER)).toBe('no-store');
  });
});

describe('cachedJson', () => {
  it('answers the JSON with a strong ETag from its bytes, and a 304 to a client holding it', async () => {
    const body = { cards: [{ id: 'c1', title: '雨後' }], nextCursor: null };
    const res = cachedJson(req(), body, BRIEF);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/json');
    expect(await res.json()).toEqual(body);
    const etag = res.headers.get('etag')!;
    expect(etag).toBe(etagOf(JSON.stringify(body)));
    expect(etag).not.toMatch(/^W\//);

    const hit = cachedJson(req({ 'If-None-Match': etag }), body, BRIEF);
    expect(hit.status).toBe(304);
    expect(hit.body).toBeNull();
    expect(hit.headers.get('etag')).toBe(etag);

    // One changed byte is another answer.
    expect(cachedJson(req({ 'If-None-Match': etag }), { ...body, nextCursor: 'x' }, BRIEF).status).toBe(200);
  });

  it('gives an answer that is never kept no validator', () => {
    const res = cachedJson(req({ 'If-None-Match': '*' }), { status: 'stale' }, NEVER);
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(res.headers.get('etag')).toBeNull();
  });
});

describe('noneMatchHits', () => {
  it('compares weakly, across a list, and takes *', () => {
    const etag = '"abc"';
    expect(noneMatchHits('"abc"', etag)).toBe(true);
    expect(noneMatchHits('W/"abc"', etag)).toBe(true);
    expect(noneMatchHits('"x", "abc"', etag)).toBe(true);
    expect(noneMatchHits('*', etag)).toBe(true);
    expect(noneMatchHits('"abcd"', etag)).toBe(false);
    expect(noneMatchHits(null, etag)).toBe(false);
  });
});

describe('secondsUntilUtcMidnight', () => {
  it('counts to the next UTC midnight, whatever the local zone', () => {
    expect(secondsUntilUtcMidnight(Date.parse('2026-10-01T23:00:00Z'))).toBe(3600);
    expect(secondsUntilUtcMidnight(Date.parse('2026-10-01T00:00:00Z'))).toBe(86_400);
    expect(secondsUntilUtcMidnight(Date.parse('2026-12-31T23:59:59.500Z'))).toBe(1);
  });
});
