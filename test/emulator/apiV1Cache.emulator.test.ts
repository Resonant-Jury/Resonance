import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, Timestamp, type Firestore } from 'firebase-admin/firestore';

// HTTP caching of the v1 reads, through the real route handlers against the
// Firestore emulator: every answer is private to its viewer, carries an ETag
// and turns into an empty 304 while it is unchanged — and stops matching the
// moment the viewer's own change (a block) changes what they would get. Only
// a client that opted in (X-Resonance-Cache: 1) may reuse an answer without
// asking; the viewer's own account, card and profile are always checked.

const mocks = vi.hoisted(() => ({ db: null as unknown, viewer: 'alice' }));
vi.mock('@/lib/auth', () => ({ getCurrentUser: async () => ({ id: mocks.viewer }) }));
vi.mock('@/lib/db/firestore/admin', () => ({ getAdminDb: () => mocks.db }));
// Today's build is never run here (its LLM steps would fail anyway).
vi.mock('next/server', async (orig) => ({ ...(await orig<typeof import('next/server')>()), after: () => {} }));

const profileRoute = await import('@/app/api/v1/users/[handle]/route');
const cardRoute = await import('@/app/api/v1/cards/[key]/route');
const meRoute = await import('@/app/api/v1/me/route');
const feedRoute = await import('@/app/api/v1/feed/route');
const recommendedRoute = await import('@/app/api/v1/feed/recommended/route');
const { recommendationDay } = await import('@/lib/recommend/daily');

const PROJECT = 'demo-resonance-api-cache';
let app: App;
let db: Firestore;

beforeAll(() => {
  process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
  app = initializeApp({ projectId: PROJECT }, 'api-v1-cache-test');
  db = getFirestore(app);
  mocks.db = db;
});

afterAll(async () => {
  await deleteApp(app);
});

const minutesAgo = (m: number) => Timestamp.fromMillis(Date.now() - m * 60_000);
const set = (path: string, data: Record<string, unknown>) => db.doc(path).set(data);

beforeEach(async () => {
  await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, {
    method: 'DELETE',
  });
  mocks.viewer = 'alice';
  const user = (id: string) =>
    set(`users/${id}`, {
      handle: id,
      handleLower: id,
      initials: id.slice(0, 2).toUpperCase(),
      accentColor: 'oklch(90% 0.05 60)',
      joinedAt: Timestamp.fromDate(new Date('2026-01-02T00:00:00Z')),
    });
  await Promise.all(['alice', 'bob'].map(user));
  const card = (id: string, authorId: string, m: number) =>
    set(`cards/${id}`, {
      authorId,
      thoughtCore: `title ${id}`,
      story: `the story of ${id}`,
      tags: ['日常'],
      visibility: 'public',
      publishedAt: minutesAgo(m),
      resonanceCount: 0,
    });
  await Promise.all([card('b1', 'bob', 1), card('a1', 'alice', 2)]);
});

type Headers = Record<string, string>;
const request = (path: string, headers: Headers = {}) => new Request(`http://localhost${path}`, { headers });
const profile = (handle: string, headers?: Headers) =>
  profileRoute.GET(request(`/api/v1/users/${handle}?include=cards`, headers), { params: Promise.resolve({ handle }) });
const cardDetail = (key: string, headers?: Headers) =>
  cardRoute.GET(request(`/api/v1/cards/${key}`, headers), { params: Promise.resolve({ key }) });
const OPT_IN = { 'X-Resonance-Cache': '1' };

describe('a v1 read', () => {
  it('is private to the viewer, with an ETag that turns a repeat into an empty 304', async () => {
    const first = await profile('bob');
    expect(first.status).toBe(200);
    expect(first.headers.get('cache-control')).toBe('private, no-cache');
    expect(first.headers.get('vary')).toBe('Authorization, Cookie, X-Resonance-Cache');
    const etag = first.headers.get('etag')!;
    expect(etag).toMatch(/^"[A-Za-z0-9_-]{27}"$/);
    expect((await first.json()).cards.cards.map((c: { id: string }) => c.id)).toEqual(['b1']);

    const again = await profile('bob', { 'If-None-Match': etag });
    expect(again.status).toBe(304);
    expect(await again.text()).toBe('');
    expect(again.headers.get('etag')).toBe(etag);
    expect(again.headers.get('cache-control')).toBe('private, no-cache');
    expect(again.headers.get('vary')).toContain('Authorization');
    // A tag a proxy weakened still matches; someone else's does not.
    expect((await profile('bob', { 'If-None-Match': `"other", W/${etag}` })).status).toBe(304);
    expect((await profile('bob', { 'If-None-Match': '"other"' })).status).toBe(200);
  });

  it("stops matching once the viewer blocks the person: the next check gets the new answer", async () => {
    const etag = (await profile('bob')).headers.get('etag')!;
    await set('users/alice/blocks/bob', { blockedUid: 'bob', createdAt: minutesAgo(0) });

    const after = await profile('bob', { 'If-None-Match': etag });
    expect(after.status).toBe(200);
    expect(after.headers.get('etag')).not.toBe(etag);
    const body = await after.json();
    expect(body.isBlocked).toBe(true);
    expect(body.cards.cards).toEqual([]);
  });

  it('is someone else’s profile or card for half a minute to a client that opted in — its own never', async () => {
    expect((await profile('bob', OPT_IN)).headers.get('cache-control')).toBe('private, max-age=30');
    expect((await cardDetail('b1', OPT_IN)).headers.get('cache-control')).toBe('private, max-age=30');
    expect((await feedRoute.GET(request('/api/v1/feed', OPT_IN))).headers.get('cache-control')).toBe('private, max-age=30');

    // What the viewer may just have changed is checked every time, opted in or not.
    expect((await profile('alice', OPT_IN)).headers.get('cache-control')).toBe('private, no-cache');
    expect((await cardDetail('a1', OPT_IN)).headers.get('cache-control')).toBe('private, no-cache');
    const me = await meRoute.GET(request('/api/v1/me', OPT_IN));
    expect(me.headers.get('cache-control')).toBe('private, no-cache');
    expect((await meRoute.GET(request('/api/v1/me', { 'If-None-Match': me.headers.get('etag')! }))).status).toBe(304);
  });

  it('is never kept when it fails', async () => {
    const missing = await cardDetail('nope', OPT_IN);
    expect(missing.status).toBe(404);
    expect(missing.headers.get('cache-control')).toBe('no-store');
    expect(missing.headers.get('etag')).toBeNull();
  });
});

describe('GET /api/v1/feed/recommended', () => {
  const recommended = (headers?: Headers) => recommendedRoute.GET(request('/api/v1/feed/recommended', headers));
  const item = (cardId: string) => ({ cardId, channel: 'insight', reason: `because ${cardId}`, score: 1 });

  it("keeps today's picks until the UTC day turns, for a client that opted in", async () => {
    await set('recommendations/alice', { date: recommendationDay(), items: [item('b1')] });
    const before = Date.now();
    const res = await recommended(OPT_IN);
    const body = await res.json();
    expect(body).toMatchObject({ status: 'fresh', cards: [{ id: 'b1', reason: 'because b1' }] });

    const maxAge = Number(/^private, max-age=(\d+)$/.exec(res.headers.get('cache-control')!)![1]);
    const midnight = Date.UTC(new Date(before).getUTCFullYear(), new Date(before).getUTCMonth(), new Date(before).getUTCDate() + 1);
    expect(Math.abs(before + maxAge * 1000 - midnight)).toBeLessThan(5_000);
    // Checked each time otherwise, and a 304 while they stand.
    const plain = await recommended();
    expect(plain.headers.get('cache-control')).toBe('private, no-cache');
    expect((await recommended({ 'If-None-Match': plain.headers.get('etag')! })).status).toBe(304);
  });

  it('never keeps picks still being prepared: the client asks again after the rebuild', async () => {
    await set('recommendations/alice', { date: '2020-01-01', items: [item('b1')] });
    const res = await recommended(OPT_IN);
    expect((await res.json()).status).toBe('stale');
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(res.headers.get('etag')).toBeNull();
  });
});
