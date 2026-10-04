import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, Timestamp, type Firestore } from 'firebase-admin/firestore';
import type { IVectorStore } from '@/lib/recommend/vectorStore/interfaces';

// GET /api/v1/feed/recommended against the Firestore emulator: answering from
// what is stored while today's picks are built after the response (one build
// at a time, none for an hour after a failure), a first-time reader's quick
// build, and the vector search's distance direction on real unit vectors.
// No LLM runs here: the build is injected, and the funnel's OpenAI calls fail.

const mocks = vi.hoisted(() => ({ store: null as IVectorStore | null, centroids: [] as number[][], db: null as Firestore | null }));
vi.mock('@/lib/recommend/vectorStore', () => ({ getVectorStore: () => mocks.store }));
vi.mock('@/lib/recommend/profile', () => ({
  getOrBuildProfile: async (uid: string) => ({ uid, centroids: mocks.centroids, summaries: [], updatedAt: new Date() }),
}));
// The reader's resonances and the candidates' bylines, read for real on this
// suite's emulator (a reader with no cards answers no one).
vi.mock('@/lib/recommend/signals', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/recommend/signals')>();
  return {
    getEngagedAuthorIds: (uid: string) => real.getEngagedAuthorIds(uid, mocks.db!),
    namedCardIds: (ids: string[]) => real.namedCardIds(ids, mocks.db!),
  };
});
vi.mock('@/lib/ai/openai', () => ({
  chatJSON: async () => {
    throw Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' });
  },
  rerankModel: () => 'cheap-model',
}));

const { dailyRecommendations, INLINE_BUDGET_MS, LEASE_MS } = await import('@/lib/recommend/daily');
const { recommendFeed } = await import('@/lib/recommend/funnel');
const { FirestoreVectorStore } = await import('@/lib/recommend/vectorStore/firestore');
const { getRecommendedFeed } = await import('@/lib/api/v1/reads');
type FunnelResult = import('@/lib/recommend/funnel').FunnelResult;
type FunnelOptions = import('@/lib/recommend/funnel').FunnelOptions;

const PROJECT = 'demo-resonance-api-recommended';
let app: App;
let db: Firestore;

beforeAll(() => {
  process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
  app = initializeApp({ projectId: PROJECT }, 'api-v1-recommended-test');
  db = getFirestore(app);
  mocks.db = db;
});

afterAll(async () => {
  await deleteApp(app);
});

beforeEach(async () => {
  await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, {
    method: 'DELETE',
  });
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

const NOW = Date.parse('2026-10-01T09:00:00Z');
const TODAY = '2026-10-01';
/** A clock that starts at `at` and runs in real time (the wait loop needs one that moves). */
const clock = (at: number) => {
  const start = Date.now();
  return () => at + (Date.now() - start);
};
const item = (cardId: string, reason = `because ${cardId}`) => ({ cardId, channel: 'insight' as const, reason, score: 1 });
const built = (ids: string[], partial = false): FunnelResult => ({ items: ids.map((id) => item(id, partial ? '' : `because ${id}`)), partial });
const doc = (uid: string) => db.doc(`recommendations/${uid}`);
const ids = (r: { items: { cardId: string }[] }) => r.items.map((i) => i.cardId);

describe('dailyRecommendations', () => {
  it("answers at once with the earlier picks, and builds today's after the response, once for concurrent requests", async () => {
    await doc('alice').set({ date: '2026-09-30', items: [item('x')] });
    const build = vi.fn(async () => {
      await new Promise((r) => setTimeout(r, 50));
      return built(['y']);
    });

    const first = await dailyRecommendations(db, 'alice', { build, now: clock(NOW) });
    const second = await dailyRecommendations(db, 'alice', { build, now: clock(NOW) });
    expect(first).toMatchObject({ items: [item('x')], cached: true, status: 'stale' });
    expect(build).not.toHaveBeenCalled();

    // Both requests offer a build; the lease lets one run.
    await Promise.all([first.refresh!(), second.refresh!()]);
    expect(build).toHaveBeenCalledTimes(1);
    // The full build: every LLM step, no deadline, no fallback.
    expect(build).toHaveBeenCalledWith('alice', { now: expect.any(Function) });

    const next = await dailyRecommendations(db, 'alice', { build, now: clock(NOW) });
    expect(next).toMatchObject({ items: [item('y')], status: 'fresh', refresh: null });
    const stored = (await doc('alice').get()).data()!;
    expect(stored).toMatchObject({ date: TODAY, partial: false });
    expect(stored.leaseUntil).toBeUndefined();
    expect(stored.generatedAt).toBeInstanceOf(Timestamp);
  });

  it('starts no build while another holds the lease, and one once the lease has lapsed', async () => {
    await doc('alice').set({ date: '2026-09-30', items: [item('x')], leaseUntil: Timestamp.fromMillis(NOW + LEASE_MS) });
    const build = vi.fn(async () => built(['y']));
    expect((await dailyRecommendations(db, 'alice', { build, now: clock(NOW) })).refresh).toBeNull();
    const lapsed = await dailyRecommendations(db, 'alice', { build, now: clock(NOW + LEASE_MS + 1) });
    await lapsed.refresh!();
    expect(build).toHaveBeenCalledTimes(1);
  });

  it('records a failed build and tries none again for an hour, keeping what the reader had', async () => {
    await doc('alice').set({ date: '2026-09-30', items: [item('x')] });
    const build = vi.fn(async (): Promise<FunnelResult> => {
      throw new Error('OpenAI down');
    });

    await (await dailyRecommendations(db, 'alice', { build, now: clock(NOW) })).refresh!();
    const stored = (await doc('alice').get()).data()!;
    expect(stored.failedAt).toBeInstanceOf(Timestamp);
    expect(stored.leaseUntil).toBeUndefined();
    expect(stored.items).toEqual([item('x')]);

    const soon = await dailyRecommendations(db, 'alice', { build, now: clock(NOW + 30 * 60_000) });
    expect(soon).toMatchObject({ items: [item('x')], status: 'stale', refresh: null });
    const later = await dailyRecommendations(db, 'alice', { build, now: clock(NOW + 61 * 60_000) });
    expect(later.refresh).not.toBeNull();
  });

  it("builds a first-time reader's picks in the request, in a hurry, and the full ones after the response", async () => {
    const build = vi.fn(async (_uid: string, opts: FunnelOptions) => (opts.fallback ? built(['q'], true) : built(['f'])));

    const first = await dailyRecommendations(db, 'newbie', { build, now: clock(NOW) });
    expect(first).toMatchObject({ items: [item('q', '')], cached: false, status: 'stale' });
    const [, quick] = build.mock.calls[0];
    expect(quick.fallback).toBe(true);
    expect(quick.deadline! - NOW).toBeGreaterThanOrEqual(INLINE_BUDGET_MS);
    expect(quick.deadline! - NOW).toBeLessThan(INLINE_BUDGET_MS + 1_000);
    expect((await doc('newbie').get()).data()).toMatchObject({ date: TODAY, partial: true });

    await first.refresh!();
    expect(await dailyRecommendations(db, 'newbie', { build, now: clock(NOW) })).toMatchObject({
      items: [item('f')],
      status: 'fresh',
    });
  });

  it('answers fresh when the quick build had time for every step', async () => {
    const res = await dailyRecommendations(db, 'newbie', { build: async () => built(['f']), now: clock(NOW) });
    expect(res).toMatchObject({ items: [item('f')], status: 'fresh', refresh: null });
  });

  it("lets a second first-time request wait for the first one's build instead of starting another", async () => {
    let finish!: () => void;
    const build = vi.fn(() => new Promise<FunnelResult>((resolve) => (finish = () => resolve(built(['q'])))));
    const first = dailyRecommendations(db, 'newbie', { build, now: clock(NOW) });
    await vi.waitFor(() => expect(build).toHaveBeenCalled());

    const second = dailyRecommendations(db, 'newbie', { build, now: clock(NOW), budgetMs: 5_000 });
    setTimeout(() => finish(), 300);
    expect(ids(await second)).toEqual(['q']);
    expect((await first).status).toBe('fresh');
    expect(build).toHaveBeenCalledTimes(1);
  });

  it('gives up waiting within the budget, answering empty rather than late', async () => {
    await doc('newbie').set({ items: [], leaseUntil: Timestamp.fromMillis(NOW + LEASE_MS) });
    const build = vi.fn(async () => built(['q']));
    const started = Date.now();
    const res = await dailyRecommendations(db, 'newbie', { build, now: clock(NOW), budgetMs: 1_000 });
    expect(res).toMatchObject({ items: [], status: 'stale', refresh: null });
    expect(Date.now() - started).toBeLessThan(2_000);
    expect(build).not.toHaveBeenCalled();
  });

  it("doesn't rebuild a first-time reader for an hour after their build failed", async () => {
    const build = vi.fn(async (): Promise<FunnelResult> => {
      throw new Error('Firestore hiccup');
    });
    expect(await dailyRecommendations(db, 'newbie', { build, now: clock(NOW) })).toMatchObject({ items: [], status: 'stale' });
    expect(await dailyRecommendations(db, 'newbie', { build, now: clock(NOW + 60_000) })).toMatchObject({ items: [], refresh: null });
    expect(build).toHaveBeenCalledTimes(1);
  });
});

describe('getRecommendedFeed', () => {
  it("says whether the picks are today's, and a quick pick without a reason has none", async () => {
    await db.doc('cards/x').set({ authorId: 'bob', thoughtCore: 'x', story: '', visibility: 'public', publishedAt: Timestamp.now() });
    await db.doc('users/bob').set({ handle: 'bob' });
    const stale = await getRecommendedFeed(db, 'alice', async () => ({ items: [item('x', '')], status: 'stale' }));
    expect(stale.status).toBe('stale');
    expect(stale.cards.map((c) => [c.id, c.reason])).toEqual([['x', null]]);
    // A loader that says nothing (as the tests of older callers do) means today's.
    expect((await getRecommendedFeed(db, 'alice', async () => ({ items: [item('x')] }))).status).toBe('fresh');
    expect(await getRecommendedFeed(db, 'alice', async () => Promise.reject(new Error('down')))).toEqual({ cards: [], status: 'stale' });
  });
});

describe('the vector search', () => {
  const unit = (v: number[]) => {
    const n = Math.hypot(...v);
    return v.map((x) => x / n);
  };
  const record = (cardId: string, authorId: string, v: number[], visibility: 'public' | 'private' = 'public') => ({
    cardId,
    authorId,
    visibility,
    channel: 'insight' as const,
    vector: unit(v),
    insightScore: 0.8,
    coreInsight: `insight ${cardId}`,
    situation: '',
    lifeDomain: 'x',
  });

  it('ranks by COSINE distance, smaller is closer, so the funnel keeps the closest cards first', async () => {
    const store = new FirestoreVectorStore(db);
    await store.upsert([
      record('far', 'a3', [-1, 0.2, 0, 0]),
      record('near', 'a1', [1, 0.1, 0, 0]),
      record('mid', 'a2', [1, 1, 0, 0]),
      record('mine', 'reader', [1, 0, 0, 0]),
      record('hidden', 'a4', [1, 0, 0, 0], 'private'),
    ]);
    const query = unit([1, 0, 0, 0]);

    const hits = await store.nearest({ channel: 'insight', vector: query, filter: { visibility: 'public', excludeAuthorId: 'reader' }, limit: 10 });
    expect(hits.map((h) => h.record.cardId)).toEqual(['near', 'mid', 'far']);
    // 1 − cos θ for unit vectors: ~0 for the nearest, ~2 for the opposite.
    expect(hits[0].distance).toBeCloseTo(1 - unit([1, 0.1, 0, 0])[0], 6);
    expect(hits[2].distance).toBeGreaterThan(1.9);
    // The signature comes back, not the stored vector.
    expect(hits[0].record).toMatchObject({ coreInsight: 'insight near', authorId: 'a1', vector: [] });

    // The funnel on these real distances (no LLM: its fallback order is retrieval order).
    mocks.store = store;
    mocks.centroids = [query];
    const { items, partial } = await recommendFeed('reader', { fallback: true });
    expect(partial).toBe(true);
    expect(items.map((i) => i.cardId)).toEqual(['near', 'mid', 'far']);
  });

  // Review: a draft answering anyone's named card made its author one the
  // reader had answered, and the boost then lifted that author's anonymous
  // card too — a score past 1 could only come from it, and even unseen it
  // reordered the feed: a draft, a feed, and the card's author was named.
  it("lifts only a named card for its author, and only for an answer its original shows — never an anonymous one", async () => {
    const at = Timestamp.fromDate(new Date('2026-09-01T00:00:00Z'));
    const shown = { visibility: 'public', anonymous: false, publishedAt: at, thoughtCore: 't', story: '' };
    await Promise.all([
      db.doc('cards/bobNamed').set({ authorId: 'bob', ...shown }),
      db.doc('cards/bobMasked').set({ authorId: 'bob', ...shown, anonymous: true }),
      db.doc('cards/carolCard').set({ authorId: 'carol', ...shown }),
      // Alice answers Bob's named card in a draft only: nothing Bob was ever shown.
      db.doc('cards/aliceDraft').set({ authorId: 'alice', ...shown, publishedAt: null, referenceCardId: 'bobNamed' }),
    ]);
    const store = new FirestoreVectorStore(db);
    await store.upsert([
      record('bobNamed', 'bob', [1, 0.2, 0, 0]),
      record('bobMasked', 'bob', [1, 0.2, 0, 0]),
      record('carolCard', 'carol', [1, 0.2, 0, 0]),
    ]);
    mocks.store = store;
    mocks.centroids = [unit([1, 0, 0, 0])];
    const scores = async () => {
      const { items } = await recommendFeed('alice', { fallback: true });
      return Object.fromEntries(items.map((i) => [i.cardId, i.score]));
    };

    // Three cards as close as each other: as alike in score, none past what the distance gives.
    let s = await scores();
    expect(Object.keys(s).sort()).toEqual(['bobMasked', 'bobNamed', 'carolCard']);
    expect(s.bobNamed).toBeCloseTo(s.carolCard, 9);
    expect(s.bobMasked).toBeCloseTo(s.carolCard, 9);
    expect(s.carolCard).toBeLessThanOrEqual(1);

    // A resonance Bob's card lists under her name: his named card is lifted, his anonymous one still isn't.
    await db.doc('cards/aliceAnswer').set({ authorId: 'alice', ...shown, referenceCardId: 'bobNamed' });
    s = await scores();
    expect(s.bobNamed).toBeCloseTo(s.carolCard + 0.15, 9);
    expect(s.bobMasked).toBeCloseTo(s.carolCard, 9);
  });
});
