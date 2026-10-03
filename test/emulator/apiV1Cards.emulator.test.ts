import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, Timestamp, type Firestore } from 'firebase-admin/firestore';
import { ApiFailure } from '@/lib/api/v1/http';
import { deleteCard, updateCard } from '@/lib/api/v1/cards';
import { getCardDetail, getProfileCards } from '@/lib/api/v1/reads';
import { CardDetail } from '@/lib/api/v1/schemas';
import { tryReachResonance } from '@/lib/api/v1/resonate';
import type { UpdateCardInput } from '@/lib/api/v1/schemas';
import { FirestoreVectorStore } from '@/lib/recommend/vectorStore/firestore';
import type { IVectorStore } from '@/lib/recommend/vectorStore/interfaces';

// The routes' vector store is this suite's: the emulator's, in this project.
const mocks = vi.hoisted(() => ({ store: null as IVectorStore | null }));
vi.mock('@/lib/recommend/vectorStore', () => ({ getVectorStore: () => mocks.store }));

// The card box's own changes through the v1 API against the Firestore
// emulator: visibility, anonymity and deleting — owner only, and each naming
// the cached pages (card by id and slug, the author's profile, the landing
// page that lists the latest public cards) the route revalidates after its
// response.

const PROJECT = 'demo-resonance-api-cards';
let app: App;
let db: Firestore;
const published = Timestamp.fromDate(new Date('2026-09-01T08:00:00Z'));
const earlier = Timestamp.fromDate(new Date('2026-09-02T08:00:00Z'));

beforeAll(() => {
  process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
  app = initializeApp({ projectId: PROJECT }, 'api-v1-cards-test');
  db = getFirestore(app);
  mocks.store = new FirestoreVectorStore(db);
});

afterAll(async () => {
  await deleteApp(app);
});

const PAGES = ['/card/live', '/card/a-quiet-night', '/u/小安', `/u/${encodeURIComponent('小安')}`, '/'];

beforeEach(async () => {
  await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, {
    method: 'DELETE',
  });
  await Promise.all([
    db.doc('users/alice').set({ handle: '小安', handleLower: '小安', initials: '小', accentColor: 'x' }),
    db.doc('users/bob').set({ handle: 'bob', handleLower: 'bob' }),
    db.doc('cards/live').set({
      authorId: 'alice',
      thoughtCore: '安靜的夜晚',
      story: '原本的故事',
      tags: ['夜'],
      visibility: 'public',
      anonymous: false,
      slug: 'a-quiet-night',
      publishedAt: published,
      updatedAt: earlier,
      resonanceCount: 2,
    }),
    db.doc('cardVectors/live__insight').set({ cardId: 'live', authorId: 'alice', visibility: 'public', channel: 'insight' }),
    db.doc('cardVectors/other__insight').set({ cardId: 'other', authorId: 'bob', visibility: 'public', channel: 'insight' }),
  ]);
});

async function failure(p: Promise<unknown>): Promise<ApiFailure> {
  const e = await p.then(
    () => null,
    (err: unknown) => err,
  );
  expect(e).toBeInstanceOf(ApiFailure);
  return e as ApiFailure;
}

const card = async () => (await db.doc('cards/live').get()).data()!;

describe('updateCard (PATCH /cards/{id})', () => {
  it("makes a card private: others can't read it any more, and its pages are named for revalidation", async () => {
    const { card: box, stale } = await updateCard(db, 'alice', 'live', { visibility: 'private' });
    expect(box).toMatchObject({ id: 'live', visibility: 'private', slug: 'a-quiet-night' });
    expect(stale).toEqual(PAGES);
    expect(await card()).toMatchObject({ visibility: 'private', slug: 'a-quiet-night', resonanceCount: 2 });
    expect(((await card()).publishedAt as Timestamp).isEqual(published)).toBe(true);
    expect(((await card()).updatedAt as Timestamp).isEqual(earlier)).toBe(false);
    expect((await failure(getCardDetail(db, 'bob', 'a-quiet-night'))).code).toBe('not_found');
  });

  it('makes it anonymous: off the profile, and the author still sees their byline in the answer', async () => {
    const { card: box, stale } = await updateCard(db, 'alice', 'live', { anonymous: true, visibility: null });
    expect(box).toMatchObject({ anonymous: true, author: { id: 'alice', handle: '小安' } });
    expect(stale).toEqual(PAGES);
    expect((await getCardDetail(db, 'bob', 'live')).card.author).toBeNull();
    expect((await getProfileCards(db, 'bob', '小安', 10)).cards).toEqual([]);
  });

  it('leaves the landing page alone for a card that could never be on it (not public before or after)', async () => {
    await db.doc('cards/live').update({ visibility: 'private' });
    const { stale } = await updateCard(db, 'alice', 'live', { anonymous: true });
    expect(stale).toEqual(PAGES.filter((p) => p !== '/'));
    // Made public again, it may be listed there now.
    expect((await updateCard(db, 'alice', 'live', { visibility: 'public' })).stale).toEqual(PAGES);
  });

  it('changes nothing, and names no page, when the fields sent already hold', async () => {
    const { stale } = await updateCard(db, 'alice', 'live', { visibility: 'public', anonymous: false });
    expect(stale).toEqual([]);
    expect(((await card()).updatedAt as Timestamp).isEqual(earlier)).toBe(true);
  });

  it('carries the change into a pending edit, so applying it later cannot undo it', async () => {
    await db.doc('cards/live/edits/current').set({ thoughtCore: '改', story: '改過', visibility: 'public', anonymous: false });
    await updateCard(db, 'alice', 'live', { visibility: 'private', anonymous: true });
    expect((await db.doc('cards/live/edits/current').get()).data()).toMatchObject({ story: '改過', visibility: 'private', anonymous: true });
  });

  describe('an anonymous card is public or private', () => {
    const ANSWER = ['invalid_request', 'An anonymous card is public or private.'];

    it('refuses making one for connections only, or one for connections only anonymous, changing nothing', async () => {
      const refusals: [Record<string, unknown>, { visibility?: 'public' | 'connections' | 'private'; anonymous?: boolean }][] = [
        [{ anonymous: true }, { visibility: 'connections' }],
        [{ visibility: 'connections' }, { anonymous: true }],
        [{}, { visibility: 'connections', anonymous: true }],
      ];
      for (const [start, input] of refusals) {
        await db.doc('cards/live').update({ visibility: 'public', anonymous: false, updatedAt: earlier, ...start });
        const before = await card();
        const e = await failure(updateCard(db, 'alice', 'live', input));
        expect([e.code, e.message], JSON.stringify(input)).toEqual(ANSWER);
        expect(await card()).toEqual(before);
      }
    });

    it('leaves a card already anonymous and for connections only as it is until either is sent, and lets it out either way', async () => {
      await db.doc('cards/live').update({ visibility: 'connections', anonymous: true });
      expect((await updateCard(db, 'alice', 'live', { visibility: 'connections', anonymous: true })).stale).toEqual([]);
      expect(await updateCard(db, 'alice', 'live', { visibility: 'public' })).toMatchObject({ card: { visibility: 'public', anonymous: true } });
      await db.doc('cards/live').update({ visibility: 'connections', anonymous: true });
      expect(await updateCard(db, 'alice', 'live', { anonymous: false })).toMatchObject({ card: { visibility: 'connections', anonymous: false } });
    });

    it("never leaves a pending edit so either: one the change alone would make so takes the card's other half too", async () => {
      // The editor holds a byline taken off, not yet saved; the card goes connections-only.
      await db.doc('cards/live/edits/current').set({ thoughtCore: '改', story: '改過', visibility: 'public', anonymous: true });
      await updateCard(db, 'alice', 'live', { visibility: 'connections' });
      expect((await card())).toMatchObject({ visibility: 'connections', anonymous: false });
      expect((await db.doc('cards/live/edits/current').get()).data()).toMatchObject({ story: '改過', visibility: 'connections', anonymous: false });
    });
  });

  it("is not_found for someone else's card or a missing one, and changes nothing", async () => {
    expect((await failure(updateCard(db, 'bob', 'live', { visibility: 'private' }))).code).toBe('not_found');
    expect((await failure(updateCard(db, 'alice', 'missing', { visibility: 'private' }))).code).toBe('not_found');
    expect((await card()).visibility).toBe('public');
  });
});

// A resonance published private, connections-only or anonymous reached no
// one (its original's author could never see it as theirs); made public under
// its writer's name, it reaches them as publishing it so would have — once.
describe('a published resonance made public under its writer\'s name (PATCH /cards/{id})', () => {
  const bells = async () => (await db.collection('notifications').get()).docs.map((d) => ({ id: d.id, ...d.data() }));
  const connected = async () => (await db.doc('connections/alice_bob').get()).exists;
  // What the route does: the change, then — after its response — the reach it made possible (its bell's id, for the push).
  const patch = async (id: string, input: UpdateCardInput) => {
    const result = await updateCard(db, 'alice', id, input);
    return { ...result, notificationId: result.reaches ? await tryReachResonance(db, 'alice', id) : null };
  };
  const answer = (extra: Record<string, unknown> = {}) =>
    db.doc('cards/answer').set({
      authorId: 'alice',
      thoughtCore: '回應',
      story: '我也是',
      visibility: 'private',
      anonymous: false,
      referenceCardId: 'orig',
      publishedAt: published,
      updatedAt: earlier,
      ...extra,
    });

  beforeEach(async () => {
    await db.doc('cards/orig').set({ authorId: 'bob', thoughtCore: '一場雨', story: 'x', visibility: 'public', anonymous: false, publishedAt: published });
  });

  it("connects the two and rings the original's author, the bell's id coming back for its push", async () => {
    await answer();
    const { notificationId, card: box } = await patch('answer', { visibility: 'public' });
    expect(box).toMatchObject({ id: 'answer', visibility: 'public', referenceCardId: 'orig' });
    expect(notificationId).toBe('resonance_alice_orig');
    expect(await connected()).toBe(true);
    expect(await bells()).toEqual([
      expect.objectContaining({ id: 'resonance_alice_orig', userId: 'bob', type: 'resonance', readAt: null, payload: { fromUserId: 'alice', fromHandle: '小安', cardId: 'orig' } }),
    ]);
  });

  it('reaches out when a public anonymous resonance takes its byline back, and from connections-only too', async () => {
    await answer({ visibility: 'public', anonymous: true });
    expect((await patch('answer', { anonymous: false })).notificationId).toBe('resonance_alice_orig');
    expect(await connected()).toBe(true);

    await db.doc('connections/alice_bob').delete();
    await db.doc('notifications/resonance_alice_orig').delete();
    await answer({ visibility: 'connections' });
    expect((await patch('answer', { visibility: 'public' })).notificationId).toBe('resonance_alice_orig');
  });

  it('rings once: hidden and shown again, it reaches no one a second time', async () => {
    await answer();
    await patch('answer', { visibility: 'public' });
    await patch('answer', { visibility: 'private' });
    // Bob blocked and unblocked her meanwhile: the block ended the connection.
    await db.doc('connections/alice_bob').delete();
    expect((await patch('answer', { visibility: 'public' })).notificationId).toBeNull();
    expect(await bells()).toHaveLength(1);
    expect(await connected()).toBe(false);
  });

  // The review's repro: published public and named before bells had a fixed
  // id, it rang Bob under a random one; Bob's block ended the connection;
  // hidden and shown again, it must neither ring nor connect them again.
  it('counts a bell rung before the bell had a fixed id: hidden and shown again, it reaches no one', async () => {
    await answer({ visibility: 'public' });
    await db.collection('notifications').add({
      userId: 'bob', type: 'resonance', payload: { fromUserId: 'alice', fromHandle: '小安', cardId: 'orig' }, readAt: null, createdAt: earlier,
    });
    await patch('answer', { visibility: 'private' });
    expect((await patch('answer', { visibility: 'public' })).notificationId).toBeNull();
    expect(await bells()).toHaveLength(1);
    expect(await connected()).toBe(false);
  });

  it("rings an anonymous original's author but connects no one: the connection would name them", async () => {
    await db.doc('cards/orig').update({ anonymous: true });
    await answer();
    expect((await patch('answer', { visibility: 'public' })).notificationId).toBe('resonance_alice_orig');
    expect(await bells()).toEqual([expect.objectContaining({ id: 'resonance_alice_orig', userId: 'bob' })]);
    expect(await connected()).toBe(false);
  });

  // The route runs the reach after its response, so a PATCH can't fail for it;
  // the reach itself, failing, is logged and reaches no one.
  it('changes the card whatever its reach does: one that fails is logged and reaches no one', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    await answer();
    const result = await updateCard(db, 'alice', 'answer', { visibility: 'public' });
    expect(result.reaches).toBe(true);
    expect((await db.doc('cards/answer').get()).get('visibility')).toBe('public');
    vi.spyOn(db, 'runTransaction').mockImplementationOnce(() => Promise.reject(new Error('14 UNAVAILABLE')));
    expect(await tryReachResonance(db, 'alice', 'answer')).toBeNull();
    expect(error).toHaveBeenCalledWith('[api/v1] resonance', 'answer', expect.any(Error));
    expect(await bells()).toEqual([]);
    // Asked again once Firestore answers, it reaches out (the route would only on the next change).
    vi.mocked(db.runTransaction).mockRestore();
    expect(await tryReachResonance(db, 'alice', 'answer')).toBe('resonance_alice_orig');
    error.mockRestore();
  });

  it('reaches no one while it stays out of sight or anonymous', async () => {
    await answer();
    expect((await patch('answer', { visibility: 'connections' })).notificationId).toBeNull();
    expect((await patch('answer', { visibility: 'public', anonymous: true })).notificationId).toBeNull();
    expect(await bells()).toEqual([]);
    expect(await connected()).toBe(false);
  });

  it('reaches no one across a block, without a pen name, from a draft, or for a card answering nothing', async () => {
    await answer();
    await db.doc('users/bob/blocks/alice').set({ blockedUid: 'alice' });
    expect((await patch('answer', { visibility: 'public' })).notificationId).toBeNull();
    await db.doc('users/bob/blocks/alice').delete();

    await answer();
    await db.doc('users/alice').set({ initials: '小' });
    expect((await patch('answer', { visibility: 'public' })).notificationId).toBeNull();
    await db.doc('users/alice').set({ handle: '小安', handleLower: '小安' });

    await answer({ publishedAt: null });
    expect((await patch('answer', { visibility: 'public' })).notificationId).toBeNull();

    expect((await patch('live', { visibility: 'private' })).notificationId).toBeNull();
    expect((await patch('live', { visibility: 'public' })).notificationId).toBeNull();
    expect(await bells()).toEqual([]);
    expect(await connected()).toBe(false);
  });
});

// cardVectors keeps its own copy of each card's visibility: the recommender's
// candidate pool is the vectors whose copy says public. A change made through
// the API reaches it, so a card made non-public isn't recommended to anyone.
describe('the recommendation vectors of a card whose visibility changes (PATCH /cards/{id})', () => {
  const pool = async () => {
    const hits = await mocks.store!.nearest({ channel: 'insight', vector: [1, 0, 0], filter: { visibility: 'public' }, limit: 10 });
    return hits.map((h) => h.record.cardId).sort();
  };
  const visibilityOf = async (doc: string) => (await db.doc(`cardVectors/${doc}`).get()).get('visibility');

  beforeEach(async () => {
    const record = (cardId: string, authorId: string, channel: 'insight' | 'situation', vector: number[]) => ({
      cardId,
      authorId,
      visibility: 'public' as const,
      channel,
      vector,
      insightScore: 0.8,
      coreInsight: `insight ${cardId}`,
      situation: '',
      lifeDomain: 'x',
    });
    await mocks.store!.upsert([
      record('live', 'alice', 'insight', [1, 0, 0]),
      record('live', 'alice', 'situation', [0, 1, 0]),
      record('other', 'bob', 'insight', [0.8, 0.6, 0]),
    ]);
  });

  it("takes a card made private or connections-only out of others' candidate pool, and back once it is public again", async () => {
    expect(await pool()).toEqual(['live', 'other']);

    await updateCard(db, 'alice', 'live', { visibility: 'private' });
    expect(await pool()).toEqual(['other']);
    expect(await visibilityOf('live__insight')).toBe('private');
    expect(await visibilityOf('live__situation')).toBe('private');
    expect(await visibilityOf('other__insight')).toBe('public');

    await updateCard(db, 'alice', 'live', { visibility: 'connections' });
    expect(await pool()).toEqual(['other']);
    expect(await visibilityOf('live__situation')).toBe('connections');

    await updateCard(db, 'alice', 'live', { visibility: 'public' });
    expect(await pool()).toEqual(['live', 'other']);
  });

  it('leaves them alone when the visibility stays as it was (only the byline changes, or nothing does)', async () => {
    const store = { setVisibility: vi.fn(async () => {}) };
    await updateCard(db, 'alice', 'live', { anonymous: true }, store);
    await updateCard(db, 'alice', 'live', { visibility: 'public' }, store);
    expect(store.setVisibility).not.toHaveBeenCalled();
    expect(await pool()).toEqual(['live', 'other']);
  });

  it("never touches them for someone else's card", async () => {
    await failure(updateCard(db, 'bob', 'live', { visibility: 'private' }));
    expect(await visibilityOf('live__insight')).toBe('public');
  });

  it('still changes the card when its vectors cannot be updated', async () => {
    const quiet = console.error;
    console.error = () => {};
    try {
      const { card: box } = await updateCard(db, 'alice', 'live', { visibility: 'private' }, {
        setVisibility: async () => {
          throw new Error('vector store down');
        },
      });
      expect(box.visibility).toBe('private');
    } finally {
      console.error = quiet;
    }
    expect((await card()).visibility).toBe('private');
  });
});

describe('deleteCard (DELETE /cards/{id})', () => {
  it('removes the card, its pending edit and its recommendation vectors, naming its pages', async () => {
    await db.doc('cards/live/edits/current').set({ story: 'half-written' });
    const { stale } = await deleteCard(db, 'alice', 'live', new FirestoreVectorStore(db));
    expect(stale).toEqual(PAGES);
    expect((await db.doc('cards/live').get()).exists).toBe(false);
    expect((await db.doc('cards/live/edits/current').get()).exists).toBe(false);
    expect((await db.doc('cardVectors/live__insight').get()).exists).toBe(false);
    expect((await db.doc('cardVectors/other__insight').get()).exists).toBe(true);
    expect((await failure(getCardDetail(db, 'alice', 'a-quiet-night'))).code).toBe('not_found');
  });

  it("names only the id page of a card without a slug (a draft)", async () => {
    await db.doc('cards/draft').set({ authorId: 'alice', thoughtCore: '草稿', story: '', visibility: 'public', publishedAt: null });
    const { stale } = await deleteCard(db, 'alice', 'draft', new FirestoreVectorStore(db));
    expect(stale).toEqual(['/card/draft', '/u/小安', `/u/${encodeURIComponent('小安')}`]);
  });

  it("is not_found for someone else's card, and for one already deleted (a retry)", async () => {
    expect((await failure(deleteCard(db, 'bob', 'live', new FirestoreVectorStore(db)))).code).toBe('not_found');
    expect((await db.doc('cards/live').get()).exists).toBe(true);
    expect((await db.doc('cardVectors/live__insight').get()).exists).toBe(true);
    await deleteCard(db, 'alice', 'live', new FirestoreVectorStore(db));
    expect((await failure(deleteCard(db, 'alice', 'live', new FirestoreVectorStore(db)))).code).toBe('not_found');
  });

  it('still deletes the card when its vectors cannot be removed', async () => {
    const quiet = console.error;
    console.error = () => {};
    try {
      await deleteCard(db, 'alice', 'live', { deleteByCard: async () => { throw new Error('vector store down'); } });
    } finally {
      console.error = quiet;
    }
    expect((await db.doc('cards/live').get()).exists).toBe(false);
  });
});

describe('GET /cards/{key}: the story\'s link previews', () => {
  const stored = [
    { url: 'https://example.com/a', title: 'A page', description: 'About it.', siteName: 'Example', image: '/api/link-image?u=x&s=y' },
    { url: 'https://example.com/b', title: 'Another', image: 'https://tracker.example/p.gif' },
    { url: 'javascript:alert(1)', title: 'Never' },
    { url: 'https://example.com/untitled' },
  ];

  it('answers the ones a reader may draw, in order, on the contract (absent fields null, a foreign picture dropped)', async () => {
    await db.doc('cards/live').update({ story: 'https://example.com/a\n\nhttps://example.com/b', linkPreviews: stored });
    const detail = await getCardDetail(db, 'bob', 'a-quiet-night');
    expect(detail.linkPreviews).toEqual([
      { url: 'https://example.com/a', title: 'A page', description: 'About it.', siteName: 'Example', image: '/api/link-image?u=x&s=y' },
      { url: 'https://example.com/b', title: 'Another', description: null, siteName: null, image: null },
    ]);
    expect(() => CardDetail.parse(detail)).not.toThrow();
  });

  it('answers them for an anonymous card too (they name pages, never its author), and none for a card without', async () => {
    await db.doc('cards/live').update({ anonymous: true, linkPreviews: stored.slice(0, 1) });
    const detail = await getCardDetail(db, 'bob', 'live');
    expect(detail.card.author).toBeNull();
    expect(detail.linkPreviews).toHaveLength(1);
    await db.doc('cards/live').update({ anonymous: false, linkPreviews: 'not a list' });
    expect((await getCardDetail(db, 'bob', 'live')).linkPreviews).toEqual([]);
  });
});
