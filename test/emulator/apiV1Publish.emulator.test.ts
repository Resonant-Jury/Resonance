import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { DocumentReference, getFirestore, Timestamp, Transaction, type Firestore } from 'firebase-admin/firestore';
import { ApiFailure } from '@/lib/api/v1/http';
import { publishCard } from '@/lib/api/v1/publish';
import { resonateWith, tryReachResonance, unresonate } from '@/lib/api/v1/resonate';
import { updateCard } from '@/lib/api/v1/cards';
import { sendNote } from '@/lib/api/v1/conversations';

// Publishing through the v1 API against the Firestore emulator — what the web
// editor's submit() does from the client (stamp once, slug, resonance
// connection + notification), with the rules' guarantees re-checked here.

const PROJECT = 'demo-resonance-api-publish';
let app: App;
let db: Firestore;
const slugBase = async (title: string) => (title.includes('雨') ? 'after-the-rain' : 'a-quiet-night');

beforeAll(() => {
  process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
  app = initializeApp({ projectId: PROJECT }, 'api-v1-publish-test');
  db = getFirestore(app);
});

afterAll(async () => {
  await deleteApp(app);
});

afterEach(() => {
  vi.restoreAllMocks();
});

beforeEach(async () => {
  await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, {
    method: 'DELETE',
  });
  await Promise.all(
    ['alice', 'bob'].map((id) => db.doc(`users/${id}`).set({ handle: id, handleLower: id })),
  );
  await db.doc('cards/orig').set({ authorId: 'bob', thoughtCore: '一場雨', story: 'x', visibility: 'public', publishedAt: Timestamp.now(), slug: 'bobs-rain' });
});

const draft = (id: string, extra: Record<string, unknown> = {}) =>
  db.doc(`cards/${id}`).set({ authorId: 'alice', thoughtCore: '安靜的夜晚', story: '...', visibility: 'public', publishedAt: null, anonymous: false, ...extra });

async function failure(p: Promise<unknown>): Promise<ApiFailure> {
  const e = await p.then(
    () => null,
    (err: unknown) => err,
  );
  expect(e).toBeInstanceOf(ApiFailure);
  return e as ApiFailure;
}

describe('publishCard', () => {
  it('stamps publishedAt once and gives the card its slug with the handle', async () => {
    await draft('c1');
    const first = await publishCard(db, 'alice', 'c1', slugBase);
    expect(first).toEqual({ id: 'c1', slug: 'a-quiet-night', firstPublish: true, notificationId: null, pendingSlug: null });
    const stamped = (await db.doc('cards/c1').get()).get('publishedAt') as Timestamp;
    expect(stamped).toBeInstanceOf(Timestamp);

    const again = await publishCard(db, 'alice', 'c1', slugBase);
    expect(again).toEqual({ id: 'c1', slug: 'a-quiet-night', firstPublish: false, notificationId: null, pendingSlug: null });
    expect(((await db.doc('cards/c1').get()).get('publishedAt') as Timestamp).isEqual(stamped)).toBe(true);
  });

  it('adds the handle to a slug someone already has', async () => {
    await db.doc('cards/taken').set({ authorId: 'bob', slug: 'a-quiet-night' });
    await draft('c1');
    expect((await publishCard(db, 'alice', 'c1', slugBase)).slug).toBe('a-quiet-night-alice');
  });

  it("publishes even when the slug can't be made (the id is a working URL)", async () => {
    await draft('c1');
    const result = await publishCard(db, 'alice', 'c1', async () => {
      throw new Error('LLM down');
    });
    expect(result).toEqual({ id: 'c1', slug: null, firstPublish: true, notificationId: null, pendingSlug: null });
  });

  it('answers without the slug when it is slow, and writes it once it comes', async () => {
    await draft('c1');
    const slow = async () => {
      await new Promise((r) => setTimeout(r, 300));
      return 'a-quiet-night';
    };
    const started = Date.now();
    const { pendingSlug, ...result } = await publishCard(db, 'alice', 'c1', slow, { slugWaitMs: 50 });
    expect(Date.now() - started).toBeLessThan(300);
    expect(result).toEqual({ id: 'c1', slug: null, firstPublish: true, notificationId: null });
    expect((await db.doc('cards/c1').get()).get('publishedAt')).toBeInstanceOf(Timestamp);
    // The route awaits this after its response (revalidating the page).
    expect(await pendingSlug).toBe('a-quiet-night');
    expect((await db.doc('cards/c1').get()).get('slug')).toBe('a-quiet-night');
  });

  it('leaves every published card with a boolean `anonymous` — the public lists filter on it', async () => {
    await db.doc('cards/old').set({ authorId: 'alice', thoughtCore: '一篇舊稿', story: '...', visibility: 'public', publishedAt: null });
    await publishCard(db, 'alice', 'old', slugBase);
    expect((await db.doc('cards/old').get()).get('anonymous')).toBe(false);
    await draft('anon', { anonymous: true });
    await publishCard(db, 'alice', 'anon', slugBase);
    expect((await db.doc('cards/anon').get()).get('anonymous')).toBe(true);
  });

  it("is not_found for someone else's card, and refuses an untitled one", async () => {
    await draft('c1');
    expect((await failure(publishCard(db, 'bob', 'c1', slugBase))).code).toBe('not_found');
    await draft('c2', { thoughtCore: '  ' });
    expect((await failure(publishCard(db, 'alice', 'c2', slugBase))).code).toBe('invalid_request');
    expect((await db.doc('cards/c1').get()).get('publishedAt')).toBeNull();
  });

  describe('a resonance', () => {
    const notifications = () => db.collection('notifications').where('userId', '==', 'bob').get();

    it("connects the authors and rings the original author's bell, once", async () => {
      await draft('r1', { referenceCardId: 'orig' });
      const first = await publishCard(db, 'alice', 'r1', slugBase);
      const again = await publishCard(db, 'alice', 'r1', slugBase);
      expect((await db.doc('connections/alice_bob').get()).get('userIds')).toEqual(['alice', 'bob']);
      const bell = await notifications();
      expect(bell.size).toBe(1);
      // The route pushes that row after its response; a re-publish rings nothing.
      expect(first.notificationId).toBe(bell.docs[0].id);
      expect(again.notificationId).toBeNull();
      expect(bell.docs[0].data()).toMatchObject({ type: 'resonance', readAt: null, payload: { fromUserId: 'alice', fromHandle: 'alice', cardId: 'orig' } });
    });

    it('answers a letter waiting between the two: the connection it makes clears the request', async () => {
      await sendNote(db, 'alice', { cardId: 'orig', text: 'a letter before the resonance' });
      expect((await db.doc('conversations/alice_bob').get()).get('request')).toMatchObject({ from: 'alice', count: 1 });
      await draft('r1', { referenceCardId: 'orig' });
      await publishCard(db, 'alice', 'r1', slugBase);
      expect((await db.doc('connections/alice_bob').get()).exists).toBe(true);
      expect((await db.doc('conversations/alice_bob').get()).get('request')).toBeUndefined();
    });

    it("connects the authors without waiting for a slow slug", async () => {
      await draft('r1', { referenceCardId: 'orig' });
      let release!: () => void;
      const stalled = () => new Promise<string>((resolve) => (release = () => resolve('a-quiet-night')));
      const result = await publishCard(db, 'alice', 'r1', stalled, { slugWaitMs: 200 });
      expect(result.slug).toBeNull();
      expect(result.notificationId).toBe((await notifications()).docs[0].id);
      expect((await db.doc('connections/alice_bob').get()).exists).toBe(true);
      release();
      expect(await result.pendingSlug).toBe('a-quiet-night');
    });

    it('stays anonymous: no connection, no notification, no handle in the slug', async () => {
      await db.doc('cards/taken').set({ authorId: 'bob', slug: 'a-quiet-night' });
      await draft('r1', { referenceCardId: 'orig', anonymous: true });
      expect((await publishCard(db, 'alice', 'r1', slugBase)).slug).toBe('a-quiet-night-2');
      expect((await db.doc('connections/alice_bob').get()).exists).toBe(false);
      expect((await notifications()).size).toBe(0);
    });

    it("rings an anonymous original's author but connects no one: the connection would name them to the resonator", async () => {
      await db.doc('cards/orig').set({ anonymous: true }, { merge: true });
      await draft('r1', { referenceCardId: 'orig' });
      const result = await publishCard(db, 'alice', 'r1', slugBase);
      expect((await db.doc('connections/alice_bob').get()).exists).toBe(false);
      const bell = await notifications();
      expect(bell.size).toBe(1);
      expect(result.notificationId).toBe(bell.docs[0].id);
    });

    it('reaches no one across a block, in either direction', async () => {
      await db.doc('users/bob/blocks/alice').set({ blockedUid: 'alice' });
      await draft('r1', { referenceCardId: 'orig' });
      await publishCard(db, 'alice', 'r1', slugBase);
      expect((await db.doc('connections/alice_bob').get()).exists).toBe(false);
      expect((await notifications()).size).toBe(0);
    });

    it("reaches no one when the original isn't visible to the resonator", async () => {
      await db.doc('cards/orig').set({ visibility: 'private' }, { merge: true });
      await draft('r1', { referenceCardId: 'orig' });
      await publishCard(db, 'alice', 'r1', slugBase);
      expect((await notifications()).size).toBe(0);
      expect((await db.doc('connections/alice_bob').get()).exists).toBe(false);
    });

    it('rings with the one bell this reader has for that card', async () => {
      await draft('r1', { referenceCardId: 'orig' });
      expect((await publishCard(db, 'alice', 'r1', slugBase)).notificationId).toBe('resonance_alice_orig');
      expect((await notifications()).docs.map((d) => d.id)).toEqual(['resonance_alice_orig']);
    });

    for (const visibility of ['private', 'connections']) {
      it(`reaches no one when published ${visibility}: the original's author could never see it, and the card is still published`, async () => {
        await draft('r1', { referenceCardId: 'orig', visibility });
        const result = await publishCard(db, 'alice', 'r1', slugBase);
        expect(result).toMatchObject({ firstPublish: true, notificationId: null });
        expect((await db.doc('cards/r1').get()).get('publishedAt')).toBeInstanceOf(Timestamp);
        expect((await db.doc('connections/alice_bob').get()).exists).toBe(false);
        expect((await notifications()).size).toBe(0);
      });
    }

    it('reaches no one from an account without a pen name, and is published all the same', async () => {
      for (const profile of [null, { handle: '' }, { handleLower: 'x' }]) {
        if (profile) await db.doc('users/alice').set(profile);
        else await db.doc('users/alice').delete();
        await draft('r1', { referenceCardId: 'orig' });
        const result = await publishCard(db, 'alice', 'r1', slugBase);
        expect(result).toMatchObject({ firstPublish: true, notificationId: null });
        expect((await db.doc('connections/alice_bob').get()).exists).toBe(false);
        expect((await notifications()).size).toBe(0);
      }
    });

    it('rings an author once for each reader, whichever path rang first — and connects no one again without a ring', async () => {
      // Alice resonated with Bob's card using one she had written: connected, rung.
      await db.doc('cards/mine').set({ authorId: 'alice', thoughtCore: '舊作', story: '', visibility: 'public', anonymous: false, publishedAt: Timestamp.now() });
      await resonateWith(db, 'alice', 'orig', 'mine');
      await unresonate(db, 'alice', 'orig', 'mine');
      // Bob blocked and unblocked her since: the block ended the connection.
      await db.doc('connections/alice_bob').delete();
      await draft('r1', { referenceCardId: 'orig' });
      const result = await publishCard(db, 'alice', 'r1', slugBase);
      expect(result.notificationId).toBeNull();
      expect((await notifications()).docs.map((d) => d.id)).toEqual(['resonance_alice_orig']);
      expect((await db.doc('connections/alice_bob').get()).exists).toBe(false);
    });

    // Bells written before they had a fixed id (the old publish path, and the
    // browser before it, under random ids) are the same record.
    it("counts a bell rung before the bell had a fixed id: no second ring, no connection again", async () => {
      await db.collection('notifications').add({
        userId: 'bob', type: 'resonance', payload: { fromUserId: 'alice', fromHandle: 'alice', cardId: 'orig' }, readAt: null, createdAt: Timestamp.now(),
      });
      // Bob blocked and unblocked her since: the block ended the connection the old bell came with.
      await draft('r1', { referenceCardId: 'orig' });
      expect((await publishCard(db, 'alice', 'r1', slugBase)).notificationId).toBeNull();
      expect((await notifications()).size).toBe(1);
      expect((await db.doc('connections/alice_bob').get()).exists).toBe(false);
      // Someone else's old bell for the card, or Alice's for another card, stands for nothing.
      await db.collection('notifications').get().then((s) => Promise.all(s.docs.map((d) => d.ref.delete())));
      await db.collection('notifications').add({ userId: 'bob', type: 'resonance', payload: { fromUserId: 'carol', cardId: 'orig' }, readAt: null });
      await db.collection('notifications').add({ userId: 'bob', type: 'resonance', payload: { fromUserId: 'alice', cardId: 'other' }, readAt: null });
      await db.collection('notifications').add({ userId: 'bob', type: 'note', payload: { fromUserId: 'alice', cardId: 'orig' }, readAt: null });
      await draft('r2', { referenceCardId: 'orig' });
      expect((await publishCard(db, 'alice', 'r2', slugBase)).notificationId).toBe('resonance_alice_orig');
      expect((await db.doc('connections/alice_bob').get()).exists).toBe(true);
    });

    // Best effort: a reach that throws (Firestore unavailable halfway through
    // its reads) is logged, and the card is published all the same.
    it('is published when its reach fails, which reaches no one', async () => {
      const error = vi.spyOn(console, 'error').mockImplementation(() => {});
      const txGet = Transaction.prototype.get;
      vi.spyOn(Transaction.prototype, 'get').mockImplementation(async function (this: Transaction, ref: unknown) {
        if (ref instanceof DocumentReference && ref.path === 'notifications/resonance_alice_orig') throw new Error('14 UNAVAILABLE');
        return (txGet as (r: unknown) => Promise<unknown>).call(this, ref);
      } as typeof Transaction.prototype.get);
      await draft('r1', { referenceCardId: 'orig' });
      const result = await publishCard(db, 'alice', 'r1', slugBase);
      expect(result).toMatchObject({ id: 'r1', firstPublish: true, notificationId: null });
      expect((await db.doc('cards/r1').get()).get('publishedAt')).toBeInstanceOf(Timestamp);
      expect(error).toHaveBeenCalledWith('[api/v1] resonance', 'r1', expect.anything());
      expect((await notifications()).size).toBe(0);
    });

    // Two of her cards reaching the same original at once — publishing one
    // while another goes public — ring Bob once and connect them once.
    it('rings and connects once when two paths reach the same original at the same time', async () => {
      await draft('r1', { referenceCardId: 'orig' });
      await db.doc('cards/r2').set({
        authorId: 'alice', thoughtCore: '另一張', story: '', visibility: 'private', anonymous: false, referenceCardId: 'orig', publishedAt: Timestamp.now(),
      });
      const [published, patched] = await Promise.all([
        publishCard(db, 'alice', 'r1', slugBase),
        updateCard(db, 'alice', 'r2', { visibility: 'public' }, { setVisibility: async () => {} }).then(async (r) => (r.reaches ? tryReachResonance(db, 'alice', 'r2') : null)),
      ]);
      expect([published.notificationId, patched].filter(Boolean)).toEqual(['resonance_alice_orig']);
      expect((await notifications()).docs.map((d) => d.id)).toEqual(['resonance_alice_orig']);
      expect((await db.doc('connections/alice_bob').get()).get('userIds')).toEqual(['alice', 'bob']);
    });

    it('never leaves a connection across a block made while the resonance reaches out', async () => {
      // Bob blocks Alice from his phone the moment publishing has read the
      // blocks: the block, then the connection deleted if there is one (client/blocks.ts).
      let blocking: Promise<void> | null = null;
      const block = async () => {
        await db.doc('users/bob/blocks/alice').set({ blockedUid: 'alice' });
        const connection = db.doc('connections/alice_bob');
        if ((await connection.get()).exists) await connection.delete();
      };
      const blockPath = 'users/bob/blocks/alice';
      const plainGet = DocumentReference.prototype.get;
      vi.spyOn(DocumentReference.prototype, 'get').mockImplementation(async function (this: DocumentReference) {
        const snap = await plainGet.call(this);
        // A read outside any transaction: nothing holds the block back.
        if (this.path === blockPath && !blocking) await (blocking = block());
        return snap;
      });
      const txGet = Transaction.prototype.get;
      vi.spyOn(Transaction.prototype, 'get').mockImplementation(async function (this: Transaction, ref: unknown) {
        const snap = await (txGet as (r: unknown) => Promise<unknown>).call(this, ref);
        // Inside a transaction the block waits for it (awaiting it here would wait forever).
        if (ref instanceof DocumentReference && ref.path === blockPath && !blocking) blocking = block();
        return snap;
      } as typeof Transaction.prototype.get);

      await draft('r1', { referenceCardId: 'orig' });
      await publishCard(db, 'alice', 'r1', slugBase);
      expect(blocking).not.toBeNull();
      await blocking;
      expect((await db.doc(blockPath).get()).exists).toBe(true);
      expect((await db.doc('connections/alice_bob').get()).exists).toBe(false);
    });
  });
});
