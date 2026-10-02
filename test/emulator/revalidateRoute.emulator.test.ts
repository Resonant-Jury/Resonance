import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, Timestamp, type Firestore } from 'firebase-admin/firestore';

// POST /api/revalidate against the Firestore emulator: a signed-in browser
// may drop the cached pages its own writes changed — its cards (by id or
// slug), a card one of its cards answers, its own profile — and nothing
// else, ten paths at most. Anyone else's page stays cached.

const PROJECT = 'demo-resonance-revalidate';
let app: App;
let db: Firestore;
let viewer: { id: string } | null = { id: 'alice' };
const dropped: string[] = [];
vi.mock('@/lib/db/firestore/admin', () => ({ getAdminDb: () => db }));
vi.mock('@/lib/auth', () => ({ getCurrentUser: async () => viewer }));
vi.mock('next/cache', () => ({ revalidatePath: (p: string) => void dropped.push(p) }));

const { POST, MAX_PATHS } = await import('@/app/api/revalidate/route');

beforeAll(() => {
  process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
  app = initializeApp({ projectId: PROJECT }, 'revalidate-route-test');
  db = getFirestore(app);
});

afterAll(async () => {
  await deleteApp(app);
});

const card = (id: string, authorId: string, extra: Record<string, unknown> = {}) =>
  db.doc(`cards/${id}`).set({ authorId, slug: `${id}-slug`, visibility: 'public', anonymous: false, publishedAt: Timestamp.now(), ...extra });

beforeEach(async () => {
  await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, {
    method: 'DELETE',
  });
  viewer = { id: 'alice' };
  dropped.length = 0;
  await Promise.all([
    db.doc('users/alice').set({ handle: '小明 Alice', handleLower: '小明 alice' }),
    db.doc('users/bob').set({ handle: 'Bob', handleLower: 'bob' }),
    card('mine', 'alice'),
    card('bobs', 'bob'),
    card('answered', 'bob'),
    card('reply', 'alice', { referenceCardId: 'answered' }),
  ]);
});

const post = (body: unknown) =>
  POST(new Request('http://localhost/api/revalidate', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }));

describe('POST /api/revalidate', () => {
  it("drops the viewer's own card (by id and slug), a card they answered, and their own profile — in every locale", async () => {
    const res = await post({
      paths: ['/card/mine', '/card/mine-slug', '/card/answered-slug', `/u/${encodeURIComponent('小明 Alice')}`, '/u/小明 alice'],
    });
    expect(res.status).toBe(200);
    expect(dropped).toEqual(
      expect.arrayContaining([
        '/en/card/mine', '/zh-TW/card/mine', '/en/card/mine-slug', '/en/card/answered-slug',
        `/en/u/${encodeURIComponent('小明 Alice')}`, '/zh-TW/u/小明 alice',
      ]),
    );
    expect(dropped).toHaveLength(10);
  });

  it("leaves anyone else's pages cached: their cards, their profile, a missing card, any other route", async () => {
    const res = await post({ paths: ['/card/bobs', '/card/bobs-slug', '/u/Bob', '/card/gone', '/home', '/', '/card/mine/../bobs', '/u/'] });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, revalidated: [] });
    expect(dropped).toEqual([]);
  });

  it(`refuses more than ${MAX_PATHS} paths, a malformed body, and a signed-out request`, async () => {
    const many = Array.from({ length: MAX_PATHS + 1 }, (_, i) => `/card/mine?${i}`);
    expect((await post({ paths: many })).status).toBe(400);
    expect((await post({ paths: 'card/mine' })).status).toBe(400);
    expect((await post(null)).status).toBe(400);
    expect((await POST(new Request('http://localhost/api/revalidate', { method: 'POST', body: '{' }))).status).toBe(400);
    viewer = null;
    expect((await post({ paths: ['/card/mine'] })).status).toBe(401);
    expect(dropped).toEqual([]);
  });
});
