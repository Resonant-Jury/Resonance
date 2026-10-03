import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, Timestamp, type Firestore } from 'firebase-admin/firestore';
import { ApiFailure } from '@/lib/api/v1/http';
import { getCardBox, getCardDetail } from '@/lib/api/v1/reads';
import { resonateWith, unresonate } from '@/lib/api/v1/resonate';
import { sendNote } from '@/lib/api/v1/conversations';

// Resonating with a card already written (POST/DELETE /cards/{id}/resonances)
// against the Firestore emulator: the reader's card comes to answer the one
// they read — `referenceCardId`, which every resonance list reads — with the
// reach of publishing a resonance (connection, one bell), and with what
// firestore.rules ask of a resonance written in the browser re-checked here:
// a card the reader can read and didn't write, no block either way. Plus
// what only the server can hold: one card per reader per original, a card
// answering one card, no card answering one that answers it.

const PROJECT = 'demo-resonance-api-resonate';
let app: App;
let db: Firestore;
const published = Timestamp.fromDate(new Date('2026-09-01T08:00:00Z'));
const edited = Timestamp.fromDate(new Date('2026-09-02T08:00:00Z'));

beforeAll(() => {
  process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
  app = initializeApp({ projectId: PROJECT }, 'api-v1-resonate-test');
  db = getFirestore(app);
});

afterAll(async () => {
  await deleteApp(app);
});

const card = (id: string, authorId: string, extra: Record<string, unknown> = {}) =>
  db.doc(`cards/${id}`).set({
    authorId,
    thoughtCore: `title ${id}`,
    story: `the story of ${id}`,
    tags: [],
    visibility: 'public',
    anonymous: false,
    slug: `slug-${id}`,
    publishedAt: published,
    updatedAt: edited,
    ...extra,
  });

beforeEach(async () => {
  await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, {
    method: 'DELETE',
  });
  await Promise.all([
    ...['alice', 'bob', 'carol'].map((id) => db.doc(`users/${id}`).set({ handle: id, handleLower: id, initials: id[0], accentColor: 'x' })),
    // Bob's cards, which Alice reads.
    card('orig', 'bob'),
    card('bobPrivate', 'bob', { visibility: 'private' }),
    card('bobCircle', 'bob', { visibility: 'connections' }),
    card('bobDraft', 'bob', { publishedAt: null }),
    card('bobMasked', 'bob', { anonymous: true }),
    // Alice's own, which she may pick.
    card('mine', 'alice'),
    card('mine2', 'alice'),
    card('mineMasked', 'alice', { anonymous: true }),
    card('minePrivate', 'alice', { visibility: 'private' }),
    card('mineCircle', 'alice', { visibility: 'connections' }),
    card('mineDraft', 'alice', { publishedAt: null }),
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

const read = async (id: string) => (await db.doc(`cards/${id}`).get()).data()!;
const bells = async () => (await db.collection('notifications').get()).docs.map((d) => ({ id: d.id, ...d.data() }));
const connected = async () => (await db.doc('connections/alice_bob').get()).exists;

/** Nothing of the original author's side, and the card untouched. */
async function nothingWritten(cardId = 'mine') {
  expect((await read(cardId)).referenceCardId).toBeUndefined();
  expect(await bells()).toEqual([]);
  expect(await connected()).toBe(false);
}

describe('resonateWith (POST /cards/{id}/resonances)', () => {
  it("points the card at the original, connects the two and rings the original author's bell — leaving updatedAt alone", async () => {
    const result = await resonateWith(db, 'alice', 'orig', 'mine');
    expect(result.changed).toBe(true);
    expect(result.card).toMatchObject({ id: 'mine', referenceCardId: 'orig', author: { id: 'alice', handle: 'alice' } });
    expect(result.stale).toEqual(['/card/mine', '/card/slug-mine']);

    const after = await read('mine');
    expect(after.referenceCardId).toBe('orig');
    // Nothing a list shows changed: lists keep using its stored summary.
    expect((after.updatedAt as Timestamp).isEqual(edited)).toBe(true);
    expect((after.publishedAt as Timestamp).isEqual(published)).toBe(true);

    expect((await db.doc('connections/alice_bob').get()).get('userIds')).toEqual(['alice', 'bob']);
    const [bell, ...more] = await bells();
    expect(more).toEqual([]);
    expect(bell).toMatchObject({
      id: 'resonance_alice_orig',
      userId: 'bob',
      type: 'resonance',
      readAt: null,
      payload: { fromUserId: 'alice', fromHandle: 'alice', cardId: 'orig' },
    });
    expect(result.notificationId).toBe('resonance_alice_orig');
  });

  it('asked again, changes nothing and rings no one', async () => {
    await resonateWith(db, 'alice', 'orig', 'mine');
    const again = await resonateWith(db, 'alice', 'orig', 'mine');
    expect(again).toMatchObject({ changed: false, notificationId: null, stale: [], card: { id: 'mine', referenceCardId: 'orig' } });
    expect(await bells()).toHaveLength(1);
  });

  it('rings the original author once, however often the reader takes it back and picks again', async () => {
    await resonateWith(db, 'alice', 'orig', 'mine');
    await db.doc('notifications/resonance_alice_orig').update({ readAt: Timestamp.now() });
    await unresonate(db, 'alice', 'orig', 'mine');
    const again = await resonateWith(db, 'alice', 'orig', 'mine2');
    expect(again.changed).toBe(true);
    expect(again.notificationId).toBeNull();
    expect(await bells()).toHaveLength(1);
    expect((await read('mine2')).referenceCardId).toBe('orig');
  });

  it('connects no one again without a ring: a connection a block ended stays ended', async () => {
    await resonateWith(db, 'alice', 'orig', 'mine');
    await unresonate(db, 'alice', 'orig', 'mine');
    // Bob blocked and unblocked her: the block deleted the connection.
    await db.doc('connections/alice_bob').delete();
    const again = await resonateWith(db, 'alice', 'orig', 'mine2');
    expect(again).toMatchObject({ changed: true, notificationId: null });
    expect(await connected()).toBe(false);
    expect(await bells()).toHaveLength(1);
  });

  it('is refused to a reader without a pen name, writing nothing (the bell would name no one)', async () => {
    for (const profile of [null, { handle: '  ' }, { initials: 'a' }]) {
      if (profile) await db.doc('users/alice').set(profile);
      else await db.doc('users/alice').delete();
      const refused = await failure(resonateWith(db, 'alice', 'orig', 'mine'));
      expect(refused.code).toBe('forbidden');
      expect(refused.message).toBe('Choose a pen name first.');
      await nothingWritten();
    }
  });

  it('keeps an existing connection as it is (muted, its date)', async () => {
    const since = Timestamp.fromDate(new Date('2026-01-01T00:00:00Z'));
    await db.doc('connections/alice_bob').set({ userIds: ['alice', 'bob'], establishedAt: since, muted: { by: 'bob' } });
    await resonateWith(db, 'alice', 'orig', 'mine');
    const connection = (await db.doc('connections/alice_bob').get()).data()!;
    expect(connection.muted).toEqual({ by: 'bob' });
    expect((connection.establishedAt as Timestamp).isEqual(since)).toBe(true);
  });

  it('lets a connected reader answer a connections-only card', async () => {
    await db.doc('connections/alice_bob').set({ userIds: ['alice', 'bob'], establishedAt: published });
    expect((await resonateWith(db, 'alice', 'bobCircle', 'mine')).changed).toBe(true);
    expect((await read('mine')).referenceCardId).toBe('bobCircle');
  });

  describe('anonymity', () => {
    it('an anonymous card reaches no one: no bell, no connection — the card still answers', async () => {
      const result = await resonateWith(db, 'alice', 'orig', 'mineMasked');
      expect(result).toMatchObject({ changed: true, notificationId: null });
      // Her own card box keeps her byline on it.
      expect(result.card).toMatchObject({ id: 'mineMasked', anonymous: true, author: { id: 'alice' } });
      expect((await read('mineMasked')).referenceCardId).toBe('orig');
      expect(await bells()).toEqual([]);
      expect(await connected()).toBe(false);
    });

    it("an anonymous original rings its author but connects no one: the connection would name them", async () => {
      const result = await resonateWith(db, 'alice', 'bobMasked', 'mine');
      expect(result.notificationId).toBe('resonance_alice_bobMasked');
      const [bell] = await bells();
      expect(bell).toMatchObject({ userId: 'bob', type: 'resonance', payload: { cardId: 'bobMasked', fromUserId: 'alice' } });
      expect(await connected()).toBe(false);
    });
  });

  describe('a letter waiting between the two (a note not yet answered)', () => {
    const request = async () => (await db.doc('conversations/alice_bob').get()).get('request');

    for (const [writer, cardId] of [['alice', 'orig'], ['bob', 'mine2']] as const) {
      it(`is answered by the connection the resonance makes (${writer} wrote it): the request is cleared with it`, async () => {
        await sendNote(db, writer, { cardId, text: 'a letter' });
        expect(await request()).toMatchObject({ from: writer, count: 1 });
        await resonateWith(db, 'alice', 'orig', 'mine');
        expect(await connected()).toBe(true);
        expect(await request()).toBeUndefined();
        // The rest of the conversation is as the letter left it.
        expect((await db.doc('conversations/alice_bob').get()).get('unread')).toEqual(writer === 'alice' ? { alice: 0, bob: 1 } : { alice: 1, bob: 0 });
      });
    }

    it('keeps waiting when the resonance connects no one: an anonymous original, or an anonymous card picked', async () => {
      await sendNote(db, 'alice', { cardId: 'orig', text: 'a letter' });
      const before = await request();
      await resonateWith(db, 'alice', 'bobMasked', 'mine');
      await resonateWith(db, 'alice', 'orig', 'mineMasked');
      expect(await connected()).toBe(false);
      expect(await request()).toEqual(before);
    });
  });

  describe('the card picked', () => {
    it('must be published, and public: an unlisted resonance would still ring someone', async () => {
      for (const id of ['mineDraft', 'minePrivate', 'mineCircle']) {
        expect((await failure(resonateWith(db, 'alice', 'orig', id))).code).toBe('invalid_request');
        await nothingWritten(id);
      }
    });

    it("is not_found when it is someone else's, or missing", async () => {
      for (const id of ['bobPrivate', 'orig', 'nope']) {
        expect((await failure(resonateWith(db, 'alice', 'bobMasked', id))).code).toBe('not_found');
      }
      expect((await read('orig')).referenceCardId).toBeUndefined();
      expect(await bells()).toEqual([]);
    });

    it('answers one card: one already answering another is a conflict', async () => {
      await db.doc('cards/mine').update({ referenceCardId: 'bobMasked' });
      expect((await failure(resonateWith(db, 'alice', 'orig', 'mine'))).code).toBe('conflict');
      expect((await read('mine')).referenceCardId).toBe('bobMasked');
      expect(await bells()).toEqual([]);
    });

    it('is the only one of theirs answering the original: a second card is a conflict (a draft resonance too)', async () => {
      await resonateWith(db, 'alice', 'orig', 'mine');
      expect((await failure(resonateWith(db, 'alice', 'orig', 'mine2'))).code).toBe('conflict');
      expect((await read('mine2')).referenceCardId).toBeUndefined();

      await card('resonanceDraft', 'alice', { publishedAt: null, referenceCardId: 'bobMasked' });
      expect((await failure(resonateWith(db, 'alice', 'bobMasked', 'mine2'))).code).toBe('conflict');
      expect((await read('mine2')).referenceCardId).toBeUndefined();
    });

    it('cannot answer a card that answers it', async () => {
      await db.doc('cards/orig').update({ referenceCardId: 'mine' });
      expect((await failure(resonateWith(db, 'alice', 'orig', 'mine'))).code).toBe('invalid_request');
      await nothingWritten();
    });

    it('lets exactly one of two racing picks win', async () => {
      const results = await Promise.allSettled([resonateWith(db, 'alice', 'orig', 'mine'), resonateWith(db, 'alice', 'orig', 'mine2')]);
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      const [lost] = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
      expect((lost.reason as ApiFailure).code).toBe('conflict');
      const answering = await db.collection('cards').where('referenceCardId', '==', 'orig').get();
      expect(answering.size).toBe(1);
      expect(await bells()).toHaveLength(1);
    });

    it('lets exactly one win even when neither rings a bell (anonymous cards: only the read of her answering cards guards it)', async () => {
      await card('mineMasked2', 'alice', { anonymous: true });
      const results = await Promise.allSettled([
        resonateWith(db, 'alice', 'orig', 'mineMasked'),
        resonateWith(db, 'alice', 'orig', 'mineMasked2'),
      ]);
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect((await db.collection('cards').where('referenceCardId', '==', 'orig').get()).size).toBe(1);
      expect(await bells()).toEqual([]);
    });
  });

  describe('the original', () => {
    it("is not_found when the reader can't read it: private, a draft, connections-only and not connected, missing", async () => {
      for (const id of ['bobPrivate', 'bobDraft', 'bobCircle', 'nope']) {
        expect((await failure(resonateWith(db, 'alice', id, 'mine'))).code).toBe('not_found');
      }
      await nothingWritten();
    });

    it('cannot be their own card', async () => {
      expect((await failure(resonateWith(db, 'alice', 'mine2', 'mine'))).code).toBe('invalid_request');
      expect((await failure(resonateWith(db, 'alice', 'mine', 'mine'))).code).toBe('invalid_request');
      await nothingWritten();
    });

    it('is out of reach across a block, in either direction, with one answer for both', async () => {
      await db.doc('users/alice/blocks/bob').set({ blockedUid: 'bob' });
      expect((await failure(resonateWith(db, 'alice', 'orig', 'mine'))).code).toBe('blocked');
      await nothingWritten();
      await db.doc('users/alice/blocks/bob').delete();
      await db.doc('users/bob/blocks/alice').set({ blockedUid: 'alice' });
      expect((await failure(resonateWith(db, 'alice', 'orig', 'mine'))).code).toBe('blocked');
      await nothingWritten();
    });

    it("is not there at all when it is anonymous and the reader blocked its author (as on its page)", async () => {
      await db.doc('users/alice/blocks/bob').set({ blockedUid: 'bob' });
      expect((await failure(resonateWith(db, 'alice', 'bobMasked', 'mine'))).code).toBe('not_found');
      await nothingWritten();
    });
  });

  it("shows where resonances are read: the original's list, and the reader's resonated shelf", async () => {
    await resonateWith(db, 'alice', 'orig', 'mine');
    const page = await getCardDetail(db, 'carol', 'orig', new Set(['resonances']));
    expect(page.resonances?.cards.map((c) => c.id)).toEqual(['mine']);
    const shelf = await getCardBox(db, 'alice', 'resonated');
    expect(shelf.cards.map((c) => c.id)).toEqual(['orig']);
    // And the card's own page names what it answers.
    expect((await getCardDetail(db, 'carol', 'mine')).referenceCard?.id).toBe('orig');
  });
});

describe('unresonate (DELETE /cards/{id}/resonances/{cardId})', () => {
  it('takes the card out of the original’s resonances and keeps it, the connection and the bell', async () => {
    await resonateWith(db, 'alice', 'orig', 'mine');
    expect(await unresonate(db, 'alice', 'orig', 'mine')).toEqual({ changed: true, stale: ['/card/mine', '/card/slug-mine'] });
    const after = await read('mine');
    expect('referenceCardId' in after).toBe(false);
    expect((after.updatedAt as Timestamp).isEqual(edited)).toBe(true);
    expect(after.thoughtCore).toBe('title mine');
    expect(await connected()).toBe(true);
    expect(await bells()).toHaveLength(1);
    expect((await getCardDetail(db, 'carol', 'orig', new Set(['resonances']))).resonances?.cards).toEqual([]);
  });

  it('is harmless asked again, or for another original than the one it answers', async () => {
    await resonateWith(db, 'alice', 'orig', 'mine');
    expect(await unresonate(db, 'alice', 'bobMasked', 'mine')).toEqual({ changed: false, stale: [] });
    expect((await read('mine')).referenceCardId).toBe('orig');
    await unresonate(db, 'alice', 'orig', 'mine');
    expect(await unresonate(db, 'alice', 'orig', 'mine')).toEqual({ changed: false, stale: [] });
  });

  it('frees a written resonance too: it becomes a card of its own', async () => {
    await card('written', 'alice', { referenceCardId: 'orig' });
    expect((await unresonate(db, 'alice', 'orig', 'written')).changed).toBe(true);
    expect((await read('written')).referenceCardId).toBeUndefined();
  });

  it("is not_found for someone else's card, changing nothing", async () => {
    await card('bobs', 'bob', { referenceCardId: 'mine' });
    expect((await failure(unresonate(db, 'alice', 'mine', 'bobs'))).code).toBe('not_found');
    expect((await failure(unresonate(db, 'alice', 'orig', 'nope'))).code).toBe('not_found');
    expect((await read('bobs')).referenceCardId).toBe('mine');
  });
});
