import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, Timestamp, type Firestore } from 'firebase-admin/firestore';
import type { CardSeed } from '@/lib/data/cardSeed';
import type { FeedPageBody } from '@/lib/api/v1/schemas';

// What a signed-out browser asks the server for, now that the rules keep an
// anonymous card (whose document names its author) out of its own reads:
// GET /api/cards/view (a card page's seed) and GET /api/cards/latest (the
// home feed), against the Firestore emulator. Neither ever names an
// anonymous card's author, and neither is more than a signed-out reader may see.

const PROJECT = 'demo-resonance-public-cards';
let app: App;
let db: Firestore;
vi.mock('@/lib/db/firestore/admin', () => ({ getAdminDb: () => db }));

const { GET: view } = await import('@/app/api/cards/view/route');
const { GET: latest } = await import('@/app/api/cards/latest/route');
const { GET: cardImage } = await import('@/app/api/og/card/[id]/route');
const { GET: userImage } = await import('@/app/api/og/user/[id]/route');

beforeAll(() => {
  process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
  app = initializeApp({ projectId: PROJECT }, 'public-card-routes-test');
  db = getFirestore(app);
});

afterAll(async () => {
  await deleteApp(app);
});

const minutesAgo = (m: number) => Timestamp.fromMillis(Date.now() - m * 60_000);
const card = (id: string, extra: Record<string, unknown> = {}) =>
  db.doc(`cards/${id}`).set({
    authorId: 'bob',
    slug: id,
    thoughtCore: `title ${id}`,
    story: `the story of ${id}`,
    tags: [],
    originalLocale: 'zh-TW',
    visibility: 'public',
    anonymous: false,
    publishedAt: minutesAgo(1),
    resonanceCount: 0,
    ...extra,
  });

beforeEach(async () => {
  await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, {
    method: 'DELETE',
  });
  await db.doc('users/bob').set({ handle: 'Bob', handleLower: 'bob', initials: 'BO', accentColor: 'c', avatarSeed: '1', region: 'TW' });
});

describe('GET /api/cards/view', () => {
  const get = (key: string) => view(new Request(`http://localhost/api/cards/view?key=${encodeURIComponent(key)}`));

  it("hands out an anonymous card's content without its author, kept briefly by the CDN", async () => {
    await card('unsigned', { anonymous: true });
    const res = await get('unsigned');
    const seed = (await res.json()) as CardSeed;
    expect(seed.view?.card).toMatchObject({ id: 'unsigned', authorId: '', anonymous: true, story: 'the story of unsigned' });
    expect(seed.view?.author).toBeNull();
    expect(JSON.stringify(seed)).not.toContain('bob');
    expect(res.headers.get('cache-control')).toContain('s-maxage=60');
  });

  it("carries the story's link previews a reader may draw (an anonymous card's too)", async () => {
    await card('unsigned', {
      anonymous: true,
      story: 'https://example.com/a',
      linkPreviews: [
        { url: 'https://example.com/a', title: 'A page', image: '/api/link-image?u=x&s=y' },
        { url: 'https://example.com/b', title: 'B', image: 'https://tracker.example/p.gif' },
        { url: 'data:text/html,hi', title: 'Never' },
      ],
      linkPreviewsFor: ['https://example.com/a'],
    });
    const seed = (await (await get('unsigned')).json()) as CardSeed;
    expect(seed.view?.card.linkPreviews).toEqual([
      { url: 'https://example.com/a', title: 'A page', image: '/api/link-image?u=x&s=y' },
      { url: 'https://example.com/b', title: 'B' },
    ]);
    expect(JSON.stringify(seed)).not.toContain('linkPreviewsFor');
  });

  it("gives nothing of a card a signed-out reader may not see, and never keeps that answer", async () => {
    await card('secret', { visibility: 'private' });
    await card('conn', { visibility: 'connections' });
    await card('draft', { publishedAt: null });
    for (const key of ['secret', 'conn', 'draft', 'nothing-here', '../users/bob']) {
      const res = await get(key);
      expect(((await res.json()) as CardSeed).view, key).toBeNull();
      expect(res.headers.get('cache-control')).toBe('no-store');
    }
  });
});

describe('GET /api/cards/latest', () => {
  const get = (query = '') => latest(new Request(`http://localhost/api/cards/latest${query}`));

  it('lists the latest public cards, an anonymous one without its byline, a page at a time', async () => {
    await card('a', { publishedAt: minutesAgo(1) });
    await card('b', { publishedAt: minutesAgo(2), anonymous: true });
    await card('c', { publishedAt: minutesAgo(3) });
    await card('hidden', { publishedAt: minutesAgo(0), visibility: 'private' });
    const res = await get('?limit=2');
    const page = (await res.json()) as FeedPageBody;
    expect(page.cards.map((c) => c.id)).toEqual(['a', 'b']);
    expect(page.cards[0].author?.handle).toBe('Bob');
    expect(page.cards[1]).toMatchObject({ anonymous: true, author: null });
    expect(page.nextCursor).not.toBeNull();
    expect(res.headers.get('cache-control')).toContain('s-maxage=30');

    const next = (await (await get(`?limit=2&cursor=${encodeURIComponent(page.nextCursor!)}`)).json()) as FeedPageBody;
    expect(next.cards.map((c) => c.id)).toEqual(['c']);
    expect(next.nextCursor).toBeNull();
  });

  it('refuses a malformed page', async () => {
    expect((await get('?limit=500')).status).toBe(400);
    expect((await get('?cursor=yesterday')).status).toBe(400);
  });
});

// The share images behind og:image take an id from the address: one Firestore keeps for itself (`__x__`)
// throws when read, so it is answered as no such card or person — the platform cover — not a 500.
describe('GET /api/og/card/{id} and /api/og/user/{id}', () => {
  it('sends an id Firestore keeps for itself to the platform cover', async () => {
    for (const res of [
      await cardImage(new Request('http://localhost/api/og/card/__x__'), { params: Promise.resolve({ id: '__x__' }) }),
      await userImage(new Request('http://localhost/api/og/user/__x__'), { params: Promise.resolve({ id: '__x__' }) }),
    ]) {
      expect(res.status).toBe(302);
      expect(res.headers.get('location')).toBe('/og-cover.jpg');
    }
  });
});
