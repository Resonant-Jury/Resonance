import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, Timestamp, type Firestore } from 'firebase-admin/firestore';
import { ApiFailure } from '@/lib/api/v1/http';
import { getCardBox, getCardDetail } from '@/lib/api/v1/reads';
import { resonateWith, unresonate } from '@/lib/api/v1/resonate';
import { deleteCard, updateCard } from '@/lib/api/v1/cards';
import { applyCardEdit } from '@/lib/api/v1/edits';
import { NOTE_REQUEST_MAX, sendMessage, sendNote } from '@/lib/api/v1/conversations';
import { acceptInvite } from '@/lib/api/v1/invites';

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
    // A named original: the bell opens the thread with the resonator, as it always has.
    expect((bell as unknown as { payload: object }).payload).not.toHaveProperty('anonymous');
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

  it('counts a bell rung before bells had a fixed id as hers: no second ring, no connection again', async () => {
    await db.collection('notifications').add({ userId: 'bob', type: 'resonance', payload: { fromUserId: 'alice', fromHandle: 'alice', cardId: 'orig' }, readAt: null });
    const result = await resonateWith(db, 'alice', 'orig', 'mine');
    expect(result).toMatchObject({ changed: true, notificationId: null });
    expect(await bells()).toHaveLength(1);
    expect(await connected()).toBe(false);
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

  // A pen name is what reaching someone takes; an anonymous card reaches no
  // one, as publishing one without a pen name does.
  it('lets a reader without a pen name pick an anonymous card: it answers, ringing and connecting no one', async () => {
    for (const profile of [null, { handle: '' }]) {
      if (profile) await db.doc('users/alice').set(profile);
      else await db.doc('users/alice').delete();
      for (const target of ['orig', 'bobMasked']) {
        const result = await resonateWith(db, 'alice', target, 'mineMasked');
        expect(result).toMatchObject({ changed: true, notificationId: null, card: { id: 'mineMasked', referenceCardId: target, anonymous: true } });
        expect(await bells()).toEqual([]);
        expect(await connected()).toBe(false);
        await unresonate(db, 'alice', target, 'mineMasked');
      }
    }
  });

  it('asks for the pen name before the blocks, as everywhere', async () => {
    await db.doc('users/alice').set({ handle: '' });
    await db.doc('users/bob/blocks/alice').set({ blockedUid: 'alice' });
    expect((await failure(resonateWith(db, 'alice', 'orig', 'mine'))).message).toBe('Choose a pen name first.');
    await nothingWritten();
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
      // Its bell says so: it opens the card, never a thread with her (its unread count would answer for him).
      expect(bell).toMatchObject({ userId: 'bob', type: 'resonance', payload: { cardId: 'bobMasked', fromUserId: 'alice', anonymous: true } });
      expect(await connected()).toBe(false);
      expect((await db.doc('connectionOrigins/alice_bob').get()).exists).toBe(false);
    });
  });

  describe('a letter waiting between the two (a note not yet answered)', () => {
    const request = async () => (await db.doc('conversations/alice_bob').get()).get('request');
    const letters = async () => (await db.collection('letters').get()).docs.map((d) => [d.id, d.get('count')]);

    // Only a letter's recipient answers it: a resonance connects, and leaves it waiting.
    for (const [writer, cardId] of [['alice', 'orig'], ['bob', 'mine2']] as const) {
      it(`is left as it is by the connection a resonance makes (${writer} wrote it), and by the take-back`, async () => {
        await sendNote(db, writer, { cardId, text: 'a letter' });
        const before = await request();
        expect(before).toMatchObject({ from: writer, count: 1 });
        const counted = await letters();
        await resonateWith(db, 'alice', 'orig', 'mine');
        expect(await connected()).toBe(true);
        expect(await request()).toEqual(before);
        expect(await letters()).toEqual(counted);
        await unresonate(db, 'alice', 'orig', 'mine');
        expect(await connected()).toBe(false);
        expect(await request()).toEqual(before);
        expect(await letters()).toEqual(counted);
      });
    }

    it('keeps its writer at the cap through a resonance and its take-back: three notes in all, declined or not', async () => {
      for (let i = 0; i < NOTE_REQUEST_MAX; i++) await sendNote(db, 'alice', { cardId: 'orig', text: `letter ${i}` });
      // Bob declines: the thread goes (the client deletes it), the count stays.
      await db.recursiveDelete(db.doc('conversations/alice_bob'));
      await resonateWith(db, 'alice', 'orig', 'mine');
      expect(await connected()).toBe(true);
      await unresonate(db, 'alice', 'orig', 'mine');
      expect(await connected()).toBe(false);
      const refused = await failure(sendNote(db, 'alice', { cardId: 'orig', text: 'and again' }));
      expect([refused.code, refused.message]).toEqual(['conflict', 'Wait for them to reply.']);
      expect(await db.collection('notes').get()).toHaveProperty('size', NOTE_REQUEST_MAX);
    });

    it('is answered by its recipient while a resonance connects them, and then keeps them connected: the letter stands', async () => {
      await sendNote(db, 'alice', { cardId: 'orig', text: 'a letter' });
      await resonateWith(db, 'alice', 'orig', 'mine');
      // Its writer's words while connected leave it waiting…
      await sendMessage(db, 'alice', { to: 'bob', text: 'hello again' });
      expect(await request()).toMatchObject({ from: 'alice' });
      expect(await letters()).toEqual([['alice_bob', 1]]);
      // …its recipient's answer it.
      await sendMessage(db, 'bob', { to: 'alice', text: 'thank you' });
      expect(await request()).toBeUndefined();
      expect(await letters()).toEqual([]);
      await unresonate(db, 'alice', 'orig', 'mine');
      expect(await connected()).toBe(true);
    });

    it('stays waiting when the resonance connects no one: an anonymous original, or an anonymous card picked', async () => {
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

    // A block never answers for an anonymous card: a refusal would name its author.
    it('answers an anonymous card across a block, either way, exactly as without one — and reaches no one', async () => {
      const plain = await resonateWith(db, 'alice', 'bobMasked', 'mine');
      expect(plain).toMatchObject({ changed: true, notificationId: 'resonance_alice_bobMasked' });
      for (const [blocker, blocked] of [['alice', 'bob'], ['bob', 'alice']]) {
        await db.recursiveDelete(db.collection('notifications'));
        await unresonate(db, 'alice', 'bobMasked', 'mine');
        await db.doc(`users/${blocker}/blocks/${blocked}`).set({ blockedUid: blocked });
        const across = await resonateWith(db, 'alice', 'bobMasked', 'mine');
        expect({ ...across, notificationId: null }).toEqual({ ...plain, notificationId: null });
        expect(across.notificationId).toBeNull();
        expect((await read('mine')).referenceCardId).toBe('bobMasked');
        expect(await bells()).toEqual([]);
        expect(await connected()).toBe(false);
        await db.doc(`users/${blocker}/blocks/${blocked}`).delete();
      }
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
  it('takes the card out of the original’s resonances and keeps it — and the bell', async () => {
    await resonateWith(db, 'alice', 'orig', 'mine');
    expect(await unresonate(db, 'alice', 'orig', 'mine')).toEqual({ changed: true, stale: ['/card/mine', '/card/slug-mine'] });
    const after = await read('mine');
    expect('referenceCardId' in after).toBe(false);
    expect((after.updatedAt as Timestamp).isEqual(edited)).toBe(true);
    expect(after.thoughtCore).toBe('title mine');
    expect(await bells()).toHaveLength(1);
    expect((await getCardDetail(db, 'carol', 'orig', new Set(['resonances']))).resonances?.cards).toEqual([]);
  });

  describe('takes back the connection the resonance stands for', () => {
    const origins = async () => (await db.doc('connectionOrigins/alice_bob').get()).data();
    const reasons = async () => Object.keys((await origins())?.reasons ?? {}).sort();

    it("keeps why they are connected where neither can read it: the connection names no card, its origins name the resonance", async () => {
      await resonateWith(db, 'alice', 'orig', 'mine');
      expect(Object.keys((await db.doc('connections/alice_bob').get()).data()!).sort()).toEqual(['establishedAt', 'userIds']);
      expect(await origins()).toMatchObject({
        userIds: ['alice', 'bob'],
        reasons: { resonance_alice_mine: { kind: 'resonance', by: 'alice', cardId: 'mine', originalId: 'orig' } },
        resonanceCards: ['mine'],
        wrote: {},
      });
    });

    it('while nothing else holds it: resonate then take back, and nothing is left to message through', async () => {
      await resonateWith(db, 'alice', 'orig', 'mine');
      expect(await connected()).toBe(true);
      await unresonate(db, 'alice', 'orig', 'mine');
      expect(await connected()).toBe(false);
      expect(await origins()).toBeUndefined();
      // Her other cards for connections are closed to her again.
      expect((await failure(getCardDetail(db, 'alice', 'bobCircle'))).code).toBe('not_found');
      // The bell stays, and stands for the ring: answering that card again rings and connects no one.
      expect(await bells()).toHaveLength(1);
      expect(await resonateWith(db, 'alice', 'orig', 'mine2')).toMatchObject({ changed: true, notificationId: null });
      expect(await connected()).toBe(false);
    });

    // Her own words keep nothing: else resonate, write, take back would keep a connection no resonance stands for.
    it("even after the resonator has written in the thread — a message, a note — when the original's author hasn't", async () => {
      await resonateWith(db, 'alice', 'orig', 'mine');
      await sendMessage(db, 'alice', { to: 'bob', text: 'hi' });
      await sendNote(db, 'alice', { cardId: 'orig', text: 'a note while connected' });
      await unresonate(db, 'alice', 'orig', 'mine');
      expect(await connected()).toBe(false);
      // Nor can she message him now: she never had his answer.
      expect((await failure(sendMessage(db, 'alice', { to: 'bob', text: 'still there?' }))).code).toBe('forbidden');
    });

    it("also when only a stray message of hers is left under a thread already deleted", async () => {
      await resonateWith(db, 'alice', 'orig', 'mine');
      await db.doc('conversations/alice_bob/messages/orphan').set({ senderId: 'alice', text: 'landed as the thread went', sentAt: Timestamp.now() });
      await unresonate(db, 'alice', 'orig', 'mine');
      expect(await connected()).toBe(false);
    });

    it("never once the original's author has written to her — kept even when the thread is deleted since", async () => {
      await resonateWith(db, 'alice', 'orig', 'mine');
      await sendMessage(db, 'bob', { to: 'alice', text: 'thank you for this' });
      await db.recursiveDelete(db.doc('conversations/alice_bob'));
      await unresonate(db, 'alice', 'orig', 'mine');
      expect(await connected()).toBe(true);
      expect(await reasons()).toEqual([]);
      expect((await origins())?.wrote).toHaveProperty('bob');
    });

    it("never when a note of his in their thread came after: a note is his words too", async () => {
      await resonateWith(db, 'alice', 'orig', 'mine');
      await sendNote(db, 'bob', { cardId: 'mine2', text: 'your card moved me' });
      await unresonate(db, 'alice', 'orig', 'mine');
      expect(await connected()).toBe(true);
    });

    it('keeps them connected while another resonance stands — hers, or his', async () => {
      await card('orig2', 'bob');
      await card('bobAnswer', 'bob');
      await resonateWith(db, 'alice', 'orig', 'mine');
      // Connected already: each of these rings and is kept as one more reason.
      await resonateWith(db, 'alice', 'orig2', 'mine2');
      await resonateWith(db, 'bob', 'mine', 'bobAnswer');
      expect(await reasons()).toEqual(['resonance_alice_mine', 'resonance_alice_mine2', 'resonance_bob_bobAnswer']);
      await unresonate(db, 'alice', 'orig', 'mine');
      expect(await connected()).toBe(true);
      await unresonate(db, 'bob', 'mine', 'bobAnswer');
      expect(await connected()).toBe(true);
      await unresonate(db, 'alice', 'orig2', 'mine2');
      expect(await connected()).toBe(false);
    });

    it('keeps them connected once an invite between them is accepted', async () => {
      await resonateWith(db, 'alice', 'orig', 'mine');
      await db.doc('invites/i1').set({ fromUserId: 'bob', toUserId: 'alice', status: 'pending', expiresAt: Timestamp.fromMillis(Date.now() + 86_400_000) });
      await acceptInvite(db, 'alice', 'i1');
      await unresonate(db, 'alice', 'orig', 'mine');
      expect(await connected()).toBe(true);
      expect(await reasons()).toEqual(['invite_i1']);
    });

    it('never takes back a connection made before reasons were kept: a resonance while connected joins it as one', async () => {
      const since = Timestamp.fromDate(new Date('2026-01-01T00:00:00Z'));
      await db.doc('connections/alice_bob').set({ userIds: ['alice', 'bob'], establishedAt: since });
      await resonateWith(db, 'alice', 'orig', 'mine');
      expect(await reasons()).toEqual(['legacy', 'resonance_alice_mine']);
      await unresonate(db, 'alice', 'orig', 'mine');
      expect(await connected()).toBe(true);
      expect(await reasons()).toEqual(['legacy']);
      // A message first keeps only who wrote, no reason: the connection is older than reasons all the same.
      await db.recursiveDelete(db.collection('connectionOrigins'));
      await sendMessage(db, 'alice', { to: 'bob', text: 'hi' });
      expect(await reasons()).toEqual([]);
      await card('orig2', 'bob');
      await resonateWith(db, 'alice', 'orig2', 'mine2');
      expect(await reasons()).toEqual(['legacy', 'resonance_alice_mine2']);
      await unresonate(db, 'alice', 'orig2', 'mine2');
      expect(await connected()).toBe(true);
    });

    it('starts afresh with a new connection: an earlier one, ended by a block, leaves no reason or words behind', async () => {
      await card('orig2', 'bob');
      await resonateWith(db, 'alice', 'orig', 'mine');
      await sendMessage(db, 'bob', { to: 'alice', text: 'hello' });
      // Bob blocks her and unblocks: the client deletes the connection, nothing else.
      await db.doc('connections/alice_bob').delete();
      await resonateWith(db, 'alice', 'orig2', 'mine2');
      expect(await connected()).toBe(true);
      expect(await origins()).toMatchObject({ reasons: { resonance_alice_mine2: { kind: 'resonance' } }, resonanceCards: ['mine2'], wrote: {} });
      await unresonate(db, 'alice', 'orig2', 'mine2');
      expect(await connected()).toBe(false);
    });

    describe('when the resonance is hidden — no longer listed under the original by her name', () => {
      for (const [what, patch] of [
        ['private', { visibility: 'private' }],
        ['for connections only', { visibility: 'connections' }],
        ['anonymous', { anonymous: true }],
      ] as const) {
        it(`made ${what} (PATCH)`, async () => {
          await resonateWith(db, 'alice', 'orig', 'mine');
          await updateCard(db, 'alice', 'mine', patch, { setVisibility: async () => {} });
          expect(await connected()).toBe(false);
          expect(await origins()).toBeUndefined();
          // Shown again it rings no one and connects no one: that card's author was rung.
          await updateCard(db, 'alice', 'mine', { visibility: 'public', anonymous: false }, { setVisibility: async () => {} });
          expect(await connected()).toBe(false);
        });

        it(`made ${what} by an applied edit`, async () => {
          await resonateWith(db, 'alice', 'orig', 'mine');
          const shown: Record<string, unknown> = { visibility: 'public', anonymous: false };
          await db.doc('cards/mine/edits/current').set({ thoughtCore: 'title mine', story: 'revised', tags: [], ...shown, ...patch });
          expect((await applyCardEdit(db, 'alice', 'mine')).applied).toBe(true);
          expect(await connected()).toBe(false);
        });
      }

      it('keeps the connection while something else holds it, the card hidden all the same', async () => {
        await resonateWith(db, 'alice', 'orig', 'mine');
        await sendMessage(db, 'bob', { to: 'alice', text: 'thank you' });
        await updateCard(db, 'alice', 'mine', { anonymous: true }, { setVisibility: async () => {} });
        expect(await connected()).toBe(true);
        expect(await reasons()).toEqual([]);
        expect((await read('mine')).anonymous).toBe(true);
      });

      it('leaves a card answering nothing, or a change that keeps it shown, as it was', async () => {
        await resonateWith(db, 'alice', 'orig', 'mine');
        await updateCard(db, 'alice', 'mine2', { visibility: 'private' }, { setVisibility: async () => {} });
        await db.doc('cards/mine/edits/current').set({ thoughtCore: 'title mine', story: 'revised', tags: [], visibility: 'public', anonymous: false });
        await applyCardEdit(db, 'alice', 'mine');
        expect(await connected()).toBe(true);
        expect(await reasons()).toEqual(['resonance_alice_mine']);
      });
    });

    describe('when the resonance card itself is deleted (DELETE /cards/{id})', () => {
      it('the connection goes with it, and its pending edit', async () => {
        await resonateWith(db, 'alice', 'orig', 'mine');
        await db.doc('cards/mine/edits/current').set({ thoughtCore: 'wip', story: 'wip', authorId: 'alice' });
        await deleteCard(db, 'alice', 'mine', { deleteByCard: async () => {} });
        expect((await db.doc('cards/mine').get()).exists).toBe(false);
        expect((await db.doc('cards/mine/edits/current').get()).exists).toBe(false);
        expect(await connected()).toBe(false);
        expect(await bells()).toHaveLength(1);
      });

      it("but not once the original's author has written to her", async () => {
        await resonateWith(db, 'alice', 'orig', 'mine');
        await sendMessage(db, 'bob', { to: 'alice', text: 'hi' });
        await deleteCard(db, 'alice', 'mine', { deleteByCard: async () => {} });
        expect(await connected()).toBe(true);
      });

      it('read in the transaction that deletes it: a resonance pointed at the card a moment before goes with it', async () => {
        // The card as a racing request saw it — answering nothing — and the resonance committed right after.
        const racing = new Proxy(db, {
          get(target, key) {
            if (key !== 'doc') return Reflect.get(target, key, target);
            return (path: string) => {
              const ref = target.doc(path);
              if (path !== 'cards/mine') return ref;
              return new Proxy(ref, {
                get(r, k) {
                  if (k === 'get') {
                    return async () => {
                      const snap = await r.get();
                      await resonateWith(db, 'alice', 'orig', 'mine');
                      return snap;
                    };
                  }
                  const v = Reflect.get(r, k, r);
                  return typeof v === 'function' ? v.bind(r) : v;
                },
              });
            };
          },
        });
        await deleteCard(racing, 'alice', 'mine', { deleteByCard: async () => {} });
        expect((await db.doc('cards/mine').get()).exists).toBe(false);
        expect(await connected()).toBe(false);
      });

      // The emulator settles the two transactions' contention slowly (seconds): one round.
      it('racing a resonance for real: the card gone, never the connection left without it', async () => {
        await Promise.allSettled([
          resonateWith(db, 'alice', 'orig', 'mine'),
          deleteCard(db, 'alice', 'mine', { deleteByCard: async () => {} }),
        ]);
        expect((await db.doc('cards/mine').get()).exists).toBe(false);
        expect(await connected()).toBe(false);
      }, 30_000);
    });
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
