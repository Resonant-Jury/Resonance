import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, Timestamp, type Firestore } from 'firebase-admin/firestore';
import { ApiFailure } from '@/lib/api/v1/http';
import {
  getCardBox,
  getCardDetail,
  getLinksToCard,
  getProfile,
  getProfileCards,
  getProfileLinks,
  getRecommendedFeed,
  getRelated,
  getResonances,
} from '@/lib/api/v1/reads';
import { getFeed } from '@/lib/api/v1/service';

// The v1 reads behind the apps' feed, card and author screens, against the
// Firestore emulator. The web gets visibility from firestore.rules (cardVisible);
// the API reads with the Admin SDK, so each rule is asserted here.

const PROJECT = 'demo-resonance-reads';
let app: App;
let db: Firestore;

beforeAll(() => {
  process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
  app = initializeApp({ projectId: PROJECT }, 'api-v1-reads-test');
  db = getFirestore(app);
});

afterAll(async () => {
  await deleteApp(app);
});

const minutesAgo = (m: number) => Timestamp.fromMillis(Date.now() - m * 60_000);
const set = (path: string, data: Record<string, unknown>) => db.doc(path).set(data);
const card = (id: string, authorId: string, m: number, extra: Record<string, unknown> = {}) =>
  set(`cards/${id}`, {
    authorId,
    thoughtCore: `title ${id}`,
    story: `## Heading\n\nSome **bold** words and [a link](https://example.com) in ${id}.\n\n- a list item\n\n---`,
    tags: ['日常'],
    visibility: 'public',
    publishedAt: minutesAgo(m),
    resonanceCount: 0,
    ...extra,
  });

beforeEach(async () => {
  await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, {
    method: 'DELETE',
  });
  const user = (id: string, extra: Record<string, unknown> = {}) =>
    set(`users/${id}`, {
      handle: id === 'erin' ? '小艾' : id,
      handleLower: id === 'erin' ? '小艾' : id,
      initials: id.slice(0, 2).toUpperCase(),
      accentColor: 'oklch(90% 0.05 60)',
      avatarSeed: '42',
      verified: id === 'bob',
      region: 'Taipei',
      joinedAt: Timestamp.fromDate(new Date('2026-01-02T00:00:00Z')),
      ...extra,
    });
  await Promise.all(['alice', 'bob', 'carol', 'dana', 'erin'].map((id) => user(id)));
  // alice ↔ bob are connected; alice blocked carol.
  await set('connections/alice_bob', { userIds: ['alice', 'bob'] });
  await set('users/alice/blocks/carol', { createdAt: minutesAgo(1) });
});

async function failure(p: Promise<unknown>): Promise<ApiFailure> {
  const e = await p.then(
    () => null,
    (err: unknown) => err,
  );
  expect(e).toBeInstanceOf(ApiFailure);
  return e as ApiFailure;
}

describe('card cards in lists', () => {
  it('carry what a story card draws: plain excerpt, byline, cover, palette hue, read time', async () => {
    await card('c1', 'bob', 1, { media: { type: 'image', url: 'https://img/x.avif', label: 'rain' }, accentHue: 140 });
    const [c] = (await getFeed(db, 'alice', 5)).cards;
    expect(c).toMatchObject({
      id: 'c1',
      excerpt: 'Heading Some bold words and a link in c1. a list item',
      imageUrl: 'https://img/x.avif',
      imageLabel: 'rain',
      accentHue: 140,
      readMinutes: 1,
      reason: null,
      author: { id: 'bob', handle: 'bob', avatarSeed: '42', verified: true, avatarUrl: null },
    });
  });
});

describe('getCardDetail', () => {
  it('reads a public card by slug or id, with the story as stored', async () => {
    await card('c1', 'bob', 1, { slug: 'a-walk' });
    const bySlug = await getCardDetail(db, 'dana', 'a-walk');
    expect(bySlug.card.id).toBe('c1');
    expect(bySlug.story).toContain('**bold**');
    expect(bySlug.isOwner).toBe(false);
    expect((await getCardDetail(db, 'dana', 'c1')).card.slug).toBe('a-walk');
  });

  it('follows cardVisible: connections cards for connections, private cards for their author', async () => {
    await card('conn', 'bob', 1, { visibility: 'connections' });
    await card('priv', 'bob', 2, { visibility: 'private' });
    expect((await getCardDetail(db, 'alice', 'conn')).card.id).toBe('conn');
    expect((await failure(getCardDetail(db, 'dana', 'conn'))).code).toBe('not_found');
    expect((await failure(getCardDetail(db, 'alice', 'priv'))).code).toBe('not_found');
    expect((await getCardDetail(db, 'bob', 'priv')).isOwner).toBe(true);
    expect((await failure(getCardDetail(db, 'alice', 'nope'))).code).toBe('not_found');
  });

  it("keeps a draft its author's alone, though it will be published as public", async () => {
    await card('draft', 'bob', 1, { publishedAt: null });
    expect((await failure(getCardDetail(db, 'alice', 'draft'))).code).toBe('not_found');
    expect((await getCardDetail(db, 'bob', 'draft')).isOwner).toBe(true);
  });

  it('hides the byline of an anonymous card', async () => {
    await card('anon', 'bob', 1, { anonymous: true });
    const detail = await getCardDetail(db, 'alice', 'anon');
    expect(detail.anonymous).toBe(true);
    expect(detail.card.author).toBeNull();
  });

  it('includes the card it responds to only when the viewer may read that one', async () => {
    await card('orig', 'bob', 5, { visibility: 'connections' });
    await card('resp', 'dana', 1, { referenceCardId: 'orig' });
    expect((await getCardDetail(db, 'alice', 'resp')).referenceCard?.id).toBe('orig');
    expect((await getCardDetail(db, 'erin', 'resp')).referenceCard).toBeNull();
  });
});

describe('getResonances / getRelated / getLinksToCard', () => {
  it('lists public responses newest first, without blocked authors', async () => {
    await card('orig', 'bob', 10);
    await card('r1', 'dana', 1, { referenceCardId: 'orig' });
    await card('r2', 'carol', 2, { referenceCardId: 'orig' }); // blocked by alice
    await card('r3', 'erin', 3, { referenceCardId: 'orig', visibility: 'private' });
    expect((await getResonances(db, 'alice', 'orig')).cards.map((c) => c.id)).toEqual(['r1']);
    expect((await getResonances(db, 'dana', 'orig')).cards.map((c) => c.id)).toEqual(['r1', 'r2']);
  });

  it('puts cards sharing more tags first and never the card itself', async () => {
    await card('base', 'bob', 10, { tags: ['雨', '散步'] });
    await card('a', 'dana', 1, { tags: ['其他'] });
    await card('b', 'dana', 2, { tags: ['雨', '散步'] });
    await card('c', 'dana', 3, { tags: ['雨'] });
    await card('d', 'dana', 4, { tags: ['雨'] });
    expect((await getRelated(db, 'alice', 'base')).cards.map((c) => c.id)).toEqual(['b', 'c', 'd']);
  });

  it('shows cards linking to a card to its author only', async () => {
    await card('target', 'bob', 5);
    await card('src', 'dana', 1);
    await set('cardLinks/l1', { sourceCardId: 'src', targetCardId: 'target', targetAuthorId: 'bob', createdAt: minutesAgo(1) });
    expect((await getLinksToCard(db, 'bob', 'target')).cards.map((c) => c.id)).toEqual(['src']);
    expect((await getLinksToCard(db, 'alice', 'target')).cards).toEqual([]);
  });
});

describe('profiles', () => {
  it('describes the person as the viewer sees them', async () => {
    const bob = await getProfile(db, 'alice', 'bob');
    expect(bob).toMatchObject({ isSelf: false, isConnected: true, isBlocked: false, joinedAt: '2026-01-02T00:00:00.000Z' });
    expect(bob.author.region).toBe('Taipei');
    expect((await getProfile(db, 'alice', 'carol')).isBlocked).toBe(true);
    expect((await getProfile(db, 'alice', 'alice')).isSelf).toBe(true);
    expect((await getProfile(db, 'alice', '小艾')).author.id).toBe('erin');
    expect((await failure(getProfile(db, 'alice', 'nobody'))).code).toBe('not_found');
  });

  it('lists only public, attributed cards — and none of someone the viewer blocked', async () => {
    await card('p1', 'bob', 1);
    await card('p2', 'bob', 2, { anonymous: true });
    await card('p3', 'bob', 3, { visibility: 'connections' });
    await card('p4', 'bob', 4, { publishedAt: null });
    await card('q1', 'carol', 1);
    expect((await getProfileCards(db, 'alice', 'bob', 10)).cards.map((c) => c.id)).toEqual(['p1']);
    expect((await getProfile(db, 'alice', 'bob')).cardCount).toBe(1);
    expect((await getProfile(db, 'alice', 'carol')).cardCount).toBe(0);
    expect((await getProfileCards(db, 'alice', 'carol', 10)).cards).toEqual([]);
  });

  it("lists others' cards that link to theirs", async () => {
    await card('mine', 'bob', 5);
    await card('theirs', 'dana', 1);
    await set('cardLinks/l1', { sourceCardId: 'theirs', targetCardId: 'mine', targetAuthorId: 'bob', createdAt: minutesAgo(1) });
    expect((await getProfileLinks(db, 'alice', 'bob')).cards.map((c) => c.id)).toEqual(['theirs']);
  });
});

describe('getRecommendedFeed', () => {
  it("keeps the recommender's order and reasons, dropping cards the reader can't or won't see", async () => {
    await card('x', 'dana', 3);
    await card('y', 'carol', 2); // blocked
    await card('z', 'bob', 1, { visibility: 'private' });
    await card('w', 'erin', 4);
    const load = async () => ({
      items: ['w', 'y', 'x', 'z', 'gone'].map((cardId) => ({ cardId, reason: `because ${cardId}`, channel: 'insight' as const, score: 1 })),
    });
    const { cards } = await getRecommendedFeed(db, 'alice', load);
    expect(cards.map((c) => [c.id, c.reason])).toEqual([
      ['w', 'because w'],
      ['x', 'because x'],
    ]);
  });

  it('answers an empty list when the recommender fails, so the feed still shows the latest cards', async () => {
    const quiet = console.error;
    console.error = () => {};
    try {
      const { cards } = await getRecommendedFeed(db, 'alice', async () => {
        throw new Error('OpenAI down');
      });
      expect(cards).toEqual([]);
    } finally {
      console.error = quiet;
    }
  });
});

describe('getCardBox', () => {
  it("sorts the viewer's own cards onto shelves, keeping their byline even when anonymous", async () => {
    await card('pub', 'alice', 1, { anonymous: true });
    await card('conn', 'alice', 2, { visibility: 'connections' });
    await card('priv', 'alice', 3, { visibility: 'private' });
    await card('draft', 'alice', 4, { publishedAt: null });
    await card('other', 'bob', 5);
    const shelf = async (tab: Parameters<typeof getCardBox>[2]) => (await getCardBox(db, 'alice', tab)).cards;
    const published = await shelf('published');
    expect(published.map((c) => c.id)).toEqual(['pub', 'conn']);
    expect(published[0]).toMatchObject({ anonymous: true, author: { id: 'alice' } });
    expect((await shelf('private')).map((c) => c.id)).toEqual(['priv']);
    const drafts = await shelf('draft');
    expect(drafts.map((c) => c.id)).toEqual(['draft']);
    expect(drafts[0].publishedAt).toBeNull();
  });

  // Regression: the three shelves shared one "newest 40" query, so an author's
  // 41st published card pushed every draft out of the box (publishedAt null
  // sorts last), and a run of private cards crowded out the public ones.
  it('keeps every shelf full however many cards the others hold', async () => {
    await Promise.all(Array.from({ length: 41 }, (_, i) => card(`pub${i}`, 'alice', 100 + i)));
    await Promise.all(Array.from({ length: 41 }, (_, i) => card(`priv${i}`, 'alice', i + 1, { visibility: 'private' })));
    await card('older-draft', 'alice', 0, { publishedAt: null, updatedAt: minutesAgo(30) });
    await card('newer-draft', 'alice', 0, { publishedAt: null, updatedAt: minutesAgo(1) });
    const shelf = async (tab: Parameters<typeof getCardBox>[2]) => (await getCardBox(db, 'alice', tab)).cards.map((c) => c.id);
    expect(await shelf('draft')).toEqual(['newer-draft', 'older-draft']);
    const published = await shelf('published');
    expect(published).toHaveLength(40);
    expect(published[0]).toBe('pub0');
    const priv = await shelf('private');
    expect(priv).toHaveLength(40);
    expect(priv[0]).toBe('priv0');
  });

  it('lists the originals the viewer resonated with, cards linking to theirs, and bookmarks they can still read', async () => {
    await card('orig', 'bob', 10);
    await card('mine', 'alice', 1, { referenceCardId: 'orig' });
    await card('target', 'alice', 5);
    await card('src', 'dana', 2);
    await set('cardLinks/l1', { sourceCardId: 'src', targetCardId: 'target', targetAuthorId: 'alice', createdAt: minutesAgo(1) });
    await card('kept', 'dana', 3);
    await card('hidden', 'dana', 4, { visibility: 'private' });
    await set('users/alice/bookmarks/kept', { createdAt: minutesAgo(1) });
    await set('users/alice/bookmarks/hidden', { createdAt: minutesAgo(2) });
    expect((await getCardBox(db, 'alice', 'resonated')).cards.map((c) => c.id)).toEqual(['orig']);
    expect((await getCardBox(db, 'alice', 'linked')).cards.map((c) => c.id)).toEqual(['src']);
    expect((await getCardBox(db, 'alice', 'bookmarks')).cards.map((c) => c.id)).toEqual(['kept']);
  });

  it('never reveals an anonymous byline to anyone else', async () => {
    await card('anon', 'alice', 1, { anonymous: true });
    const [c] = (await getFeed(db, 'bob', 5)).cards;
    expect(c).toMatchObject({ id: 'anon', anonymous: true, author: null });
  });
});

describe('cards written before the rules closed publishedAt and slug', () => {
  // Clients used to be able to write both. A string publishedAt sorts above
  // every timestamp and crashed the feed's cursor; a far-future one pinned a
  // card to the top; a copied slug took over someone's URL.
  it('leaves a card with a forged publishedAt out of the feed and the profile, without failing', async () => {
    await card('real', 'bob', 5);
    await card('stringy', 'dana', 0, { publishedAt: 'zzz' });
    await card('future', 'dana', 0, { publishedAt: Timestamp.fromDate(new Date('2099-01-01')) });
    const page = await getFeed(db, 'alice', 3);
    expect(page.cards.map((c) => c.id)).toEqual(['real']);
    expect((await getProfileCards(db, 'alice', 'dana', 10)).cards).toEqual([]);
  });

  it('resolves a shared slug to the card that was published with it first', async () => {
    await card('victim', 'bob', 60, { slug: 'a-quiet-morning' });
    // A later copy under an id that sorts first, and an unpublished one.
    await card('!copy', 'dana', 1, { slug: 'a-quiet-morning' });
    await card('!draft', 'dana', 0, { slug: 'a-quiet-morning', publishedAt: null });
    expect((await getCardDetail(db, 'alice', 'a-quiet-morning')).card.id).toBe('victim');
  });
});
