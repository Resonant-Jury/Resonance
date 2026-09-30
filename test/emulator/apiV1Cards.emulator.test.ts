import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, Timestamp, type Firestore } from 'firebase-admin/firestore';
import { ApiFailure } from '@/lib/api/v1/http';
import { deleteCard, updateCard } from '@/lib/api/v1/cards';
import { getCardDetail, getProfileCards } from '@/lib/api/v1/reads';
import { FirestoreVectorStore } from '@/lib/recommend/vectorStore/firestore';

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
    await updateCard(db, 'alice', 'live', { visibility: 'connections', anonymous: true });
    expect((await db.doc('cards/live/edits/current').get()).data()).toMatchObject({ story: '改過', visibility: 'connections', anonymous: true });
  });

  it("is not_found for someone else's card or a missing one, and changes nothing", async () => {
    expect((await failure(updateCard(db, 'bob', 'live', { visibility: 'private' }))).code).toBe('not_found');
    expect((await failure(updateCard(db, 'alice', 'missing', { visibility: 'private' }))).code).toBe('not_found');
    expect((await card()).visibility).toBe('public');
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
