import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, Timestamp, type Firestore } from 'firebase-admin/firestore';
import { ApiFailure } from '@/lib/api/v1/http';
import { sendMessage, sendNote } from '@/lib/api/v1/conversations';
import { SendMessageRequest } from '@/lib/api/v1/schemas';

// Notes and messages through the v1 API against the Firestore emulator — what
// the web's sendNote() and openConversation() + sendMessage() write from the
// client, with the rules' guarantees (connection, blocks, visibility) re-checked.

const PROJECT = 'demo-resonance-api-conversations';
let app: App;
let db: Firestore;

beforeAll(() => {
  process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
  app = initializeApp({ projectId: PROJECT }, 'api-v1-conversations-test');
  db = getFirestore(app);
});

afterAll(async () => {
  await deleteApp(app);
});

beforeEach(async () => {
  await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, {
    method: 'DELETE',
  });
  await Promise.all(['alice', 'bob', 'carol'].map((id) => db.doc(`users/${id}`).set({ handle: id, handleLower: id })));
  const published = Timestamp.fromDate(new Date('2026-09-01T08:00:00Z'));
  const card = (id: string, extra: Record<string, unknown> = {}) =>
    db.doc(`cards/${id}`).set({ authorId: 'bob', thoughtCore: `title ${id}`, story: 's', visibility: 'public', anonymous: false, publishedAt: published, ...extra });
  await Promise.all([
    card('walk'),
    card('secret', { visibility: 'private' }),
    card('masked', { anonymous: true }),
    card('draft', { publishedAt: null }),
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

const docs = async (path: string) => (await db.collection(path).get()).docs.map((d) => ({ id: d.id, ...d.data() }));

describe('sendNote', () => {
  it("leaves the note with the card's author, rings their bell and connects the two", async () => {
    const { id } = await sendNote(db, 'alice', { cardId: 'walk', text: '謝謝你寫下這段，我也常在雨後散步 🌧️' });
    const note = (await db.doc(`notes/${id}`).get()).data()!;
    expect(note).toMatchObject({ cardId: 'walk', fromUserId: 'alice', toUserId: 'bob', readAt: null });
    const [bell] = await docs('notifications');
    expect(bell).toMatchObject({ userId: 'bob', type: 'note', readAt: null, payload: { noteId: id, cardId: 'walk', fromUserId: 'alice', fromHandle: 'alice' } });
    expect((await db.doc('connections/alice_bob').get()).get('userIds')).toEqual(['alice', 'bob']);
  });

  it('cuts the preview by characters, never through an emoji', async () => {
    await sendNote(db, 'alice', { cardId: 'walk', text: '🌧️'.repeat(100) });
    const [bell] = await docs('notifications');
    const preview = (bell as unknown as { payload: { preview: string } }).payload.preview;
    expect(Array.from(preview)).toHaveLength(140);
    expect(preview.endsWith('️') || preview.endsWith('🌧')).toBe(true);
  });

  it("doesn't touch an existing connection", async () => {
    const since = Timestamp.fromDate(new Date('2026-01-01T00:00:00Z'));
    await db.doc('connections/alice_bob').set({ userIds: ['alice', 'bob'], establishedAt: since, muted: true });
    await sendNote(db, 'alice', { cardId: 'walk', text: 'hi' });
    const connection = (await db.doc('connections/alice_bob').get()).data()!;
    expect(connection.muted).toBe(true);
    expect((connection.establishedAt as Timestamp).isEqual(since)).toBe(true);
  });

  it('reaches an anonymous author without naming them to the sender: no connection', async () => {
    await sendNote(db, 'alice', { cardId: 'masked', text: 'hi' });
    expect((await docs('notifications'))[0]).toMatchObject({ userId: 'bob', type: 'note' });
    expect((await db.doc('connections/alice_bob').get()).exists).toBe(false);
  });

  it('refuses your own card, one you cannot read, a draft, and anyone across a block', async () => {
    expect((await failure(sendNote(db, 'bob', { cardId: 'walk', text: 'hi' }))).code).toBe('invalid_request');
    expect((await failure(sendNote(db, 'alice', { cardId: 'secret', text: 'hi' }))).code).toBe('not_found');
    expect((await failure(sendNote(db, 'alice', { cardId: 'draft', text: 'hi' }))).code).toBe('not_found');
    await db.doc('users/bob/blocks/alice').set({ blockedUid: 'alice' });
    expect((await failure(sendNote(db, 'alice', { cardId: 'walk', text: 'hi' }))).code).toBe('blocked');
    await db.doc('users/bob/blocks/alice').delete();
    await db.doc('users/alice/blocks/bob').set({ blockedUid: 'bob' });
    expect((await failure(sendNote(db, 'alice', { cardId: 'walk', text: 'hi' }))).code).toBe('blocked');
    expect(await docs('notes')).toHaveLength(0);
    expect(await docs('notifications')).toHaveLength(0);
  });

  it("takes the card's id (the contract's cardId): a slug names no card here", async () => {
    await db.doc('cards/walk').set({ slug: 'a-rainy-walk' }, { merge: true });
    expect((await failure(sendNote(db, 'alice', { cardId: 'a-rainy-walk', text: 'hi' }))).code).toBe('not_found');
    expect(await docs('notes')).toHaveLength(0);
  });
});

describe('sendMessage', () => {
  beforeEach(async () => {
    await db.doc('connections/alice_bob').set({ userIds: ['alice', 'bob'], establishedAt: Timestamp.now() });
  });

  it('opens the conversation with the first message and rings the bell only then', async () => {
    const first = await sendMessage(db, 'alice', { to: 'bob', text: '嗨' });
    expect(first.conversationId).toBe('alice_bob');
    const convo = (await db.doc('conversations/alice_bob').get()).data()!;
    expect(convo).toMatchObject({ participants: ['alice', 'bob'], unread: { alice: 0, bob: 1 }, lastMessage: { text: '嗨', senderId: 'alice' } });
    await sendMessage(db, 'alice', { to: 'bob', text: '還在嗎' });
    await sendMessage(db, 'bob', { to: 'alice', text: '在！' });
    const after = (await db.doc('conversations/alice_bob').get()).data()!;
    expect(after.unread).toEqual({ alice: 1, bob: 2 });
    expect(after.lastMessage).toMatchObject({ text: '在！', senderId: 'bob' });
    expect(await docs('conversations/alice_bob/messages')).toHaveLength(3);
    const bells = await docs('notifications');
    expect(bells).toHaveLength(1);
    expect(bells[0]).toMatchObject({ userId: 'bob', type: 'message', payload: { fromUserId: 'alice', fromHandle: 'alice' } });
    // The bell lists the new conversation, but is already marked pushed: the chat push is the one that buzzes, never two.
    expect((bells[0] as { pushedAt?: unknown }).pushedAt).toBeInstanceOf(Timestamp);
    expect(first.notificationId).toBeNull();
  });

  it("carries a card (previewed by its title when there's no text) and a note it answers", async () => {
    const { id: noteId } = await sendNote(db, 'alice', { cardId: 'walk', text: 'a note' });
    await sendMessage(db, 'bob', { to: 'alice', text: '', cardRef: 'walk', noteRef: { cardId: 'walk', noteId } });
    const [message] = await docs('conversations/alice_bob/messages');
    expect(message).toMatchObject({ senderId: 'bob', text: '', cardRef: 'walk', noteRef: { cardId: 'walk', noteId } });
    expect((await db.doc('conversations/alice_bob').get()).get('lastMessage.text')).toBe('title walk');
  });

  it('refuses strangers, blocks, yourself, an empty message, and notes or cards that are not yours to use', async () => {
    expect((await failure(sendMessage(db, 'alice', { to: 'carol', text: 'hi' }))).code).toBe('forbidden');
    expect((await failure(sendMessage(db, 'alice', { to: 'alice', text: 'hi' }))).code).toBe('invalid_request');
    expect((await failure(sendMessage(db, 'alice', { to: 'bob', text: '' }))).code).toBe('invalid_request');
    expect((await failure(sendMessage(db, 'alice', { to: 'bob', text: '', cardRef: 'secret' }))).code).toBe('not_found');
    // A card is attached by its id; a slug names none.
    await db.doc('cards/walk').set({ slug: 'a-rainy-walk' }, { merge: true });
    expect((await failure(sendMessage(db, 'alice', { to: 'bob', text: '', cardRef: 'a-rainy-walk' }))).code).toBe('not_found');
    await db.doc('notes/n1').set({ cardId: 'walk', fromUserId: 'carol', toUserId: 'bob', text: 'x' });
    expect((await failure(sendMessage(db, 'alice', { to: 'bob', text: 'hi', noteRef: { cardId: 'walk', noteId: 'n1' } }))).code).toBe('invalid_request');
    await db.doc('users/bob/blocks/alice').set({ blockedUid: 'alice' });
    expect((await failure(sendMessage(db, 'alice', { to: 'bob', text: 'hi' }))).code).toBe('blocked');
    expect((await db.doc('conversations/alice_bob').get()).exists).toBe(false);
  });
  it('hands back what the chat push needs, for a message that was just written', async () => {
    const sent = await sendMessage(db, 'alice', { to: 'bob', text: 'hi' });
    expect(sent).toMatchObject({
      conversationId: 'alice_bob',
      duplicate: false,
      notificationId: null,
      push: { conversationId: 'alice_bob', messageId: sent.id, from: 'alice', to: 'bob' },
    });
  });

  describe('replies', () => {
    it('keeps a snapshot of the message it answers, cut to 140 characters', async () => {
      const original = await sendMessage(db, 'bob', { to: 'alice', text: '🌧️'.repeat(100) });
      const reply = await sendMessage(db, 'alice', { to: 'bob', text: '我也是', replyTo: original.id });
      const stored = (await db.doc(`conversations/alice_bob/messages/${reply.id}`).get()).data()!;
      expect(stored.replyTo).toEqual({ id: original.id, senderId: 'bob', text: Array.from('🌧️'.repeat(100)).slice(0, 140).join('') });
      expect(Array.from(stored.replyTo.text)).toHaveLength(140);
      expect(stored.text).toBe('我也是');
      // A message with no reply has no `replyTo` at all.
      expect((await db.doc(`conversations/alice_bob/messages/${original.id}`).get()).data()).not.toHaveProperty('replyTo');
    });

    it('quotes a reply to your own message, and to a card shared with no words (the card, not text)', async () => {
      const mine = await sendMessage(db, 'alice', { to: 'bob', text: 'first thought' });
      const shared = await sendMessage(db, 'bob', { to: 'alice', text: '', cardRef: 'walk' });
      const a = await sendMessage(db, 'alice', { to: 'bob', text: 'and another', replyTo: mine.id });
      const b = await sendMessage(db, 'alice', { to: 'bob', text: 'lovely card', replyTo: shared.id });
      expect((await db.doc(`conversations/alice_bob/messages/${a.id}`).get()).get('replyTo')).toEqual({ id: mine.id, senderId: 'alice', text: 'first thought' });
      expect((await db.doc(`conversations/alice_bob/messages/${b.id}`).get()).get('replyTo')).toEqual({ id: shared.id, senderId: 'bob', text: '', cardRef: 'walk' });
    });

    it('can answer a reply: the quote is of the message, not of what it quoted', async () => {
      const m1 = await sendMessage(db, 'bob', { to: 'alice', text: 'one' });
      const m2 = await sendMessage(db, 'alice', { to: 'bob', text: 'two', replyTo: m1.id });
      const m3 = await sendMessage(db, 'bob', { to: 'alice', text: 'three', replyTo: m2.id });
      expect((await db.doc(`conversations/alice_bob/messages/${m3.id}`).get()).get('replyTo')).toEqual({ id: m2.id, senderId: 'alice', text: 'two' });
    });

    it("refuses a reply to a message that isn't there, and writes nothing", async () => {
      const error = await failure(sendMessage(db, 'alice', { to: 'bob', text: 'hi', replyTo: 'nothing-here' }));
      expect(error.code).toBe('invalid_request');
      expect(error.message).toBe('No such message to reply to.');
      expect(await docs('conversations/alice_bob/messages')).toHaveLength(0);
      expect((await db.doc('conversations/alice_bob').get()).exists).toBe(false);
    });

    it('refuses an id Firestore keeps for itself as a plain "no such message", not an error of the server\'s', async () => {
      const error = await failure(sendMessage(db, 'alice', { to: 'bob', text: 'hi', replyTo: '__name__' }));
      expect(error.code).toBe('invalid_request');
      expect(error.message).toBe('No such message to reply to.');
    });

    it('refuses a reply to a message of another conversation, even one the sender is in', async () => {
      await db.doc('connections/alice_carol').set({ userIds: ['alice', 'carol'], establishedAt: Timestamp.now() });
      const elsewhere = await sendMessage(db, 'carol', { to: 'alice', text: 'carol told alice a secret' });
      expect(elsewhere.conversationId).toBe('alice_carol');
      const error = await failure(sendMessage(db, 'alice', { to: 'bob', text: 'quoting you', replyTo: elsewhere.id }));
      expect(error.code).toBe('invalid_request');
      expect(await docs('conversations/alice_bob/messages')).toHaveLength(0);
      // Nor can an id shaped like a path reach another conversation's document: the contract refuses it before the service sees it.
      for (const replyTo of [`../../alice_carol/messages/${elsewhere.id}`, 'a/b', '..', '']) {
        expect(SendMessageRequest.safeParse({ to: 'bob', text: 'x', replyTo }).success, replyTo).toBe(false);
      }
    });
  });

  describe('clientId', () => {
    const clientId = 'client-0123456789abcdef';

    it('must be well-formed to get past the contract: 16 to 64 letters, digits, - or _', () => {
      const accepted = (value: unknown) => SendMessageRequest.safeParse({ to: 'bob', text: 'x', clientId: value }).success;
      expect([clientId, 'A_b-C_d-E_f-G_h-', 'x'.repeat(64), null, undefined].every(accepted)).toBe(true);
      for (const bad of ['short', 'x'.repeat(65), 'has a space 0123456789', 'a/b/0123456789abcdef', '../../../0123456789', 'ünïcödé-0123456789', '', 12345678901234567]) {
        expect(accepted(bad), String(bad)).toBe(false);
      }
    });

    it('becomes the message\'s id', async () => {
      const sent = await sendMessage(db, 'alice', { to: 'bob', text: 'hi', clientId });
      expect(sent.id).toBe(clientId);
      expect((await db.doc(`conversations/alice_bob/messages/${clientId}`).get()).get('text')).toBe('hi');
    });

    it('makes sending retry-safe: the second send finds the first, counting nothing twice', async () => {
      const first = await sendMessage(db, 'alice', { to: 'bob', text: 'hi', clientId });
      const again = await sendMessage(db, 'alice', { to: 'bob', text: 'hi', clientId });
      expect(first.duplicate).toBe(false);
      expect(again).toEqual({ conversationId: 'alice_bob', id: clientId, notificationId: null, duplicate: true, push: null });
      expect(await docs('conversations/alice_bob/messages')).toHaveLength(1);
      // Unread was counted once, and one bell rang for the conversation.
      expect((await db.doc('conversations/alice_bob').get()).get('unread')).toEqual({ alice: 0, bob: 1 });
      expect(await docs('notifications')).toHaveLength(1);
    });

    it('answers a resend with the message as it was sent, whatever the resend says or has become of the connection', async () => {
      await sendMessage(db, 'alice', { to: 'bob', text: 'original words', clientId });
      await db.doc('users/bob/blocks/alice').set({ blockedUid: 'alice' });
      const again = await sendMessage(db, 'alice', { to: 'bob', text: 'different words', clientId });
      expect(again.duplicate).toBe(true);
      expect((await db.doc(`conversations/alice_bob/messages/${clientId}`).get()).get('text')).toBe('original words');
    });

    it('writes one message when the same send arrives twice at once', async () => {
      const results = await Promise.all([1, 2, 3].map(() => sendMessage(db, 'alice', { to: 'bob', text: 'racing', clientId })));
      expect(results.filter((r) => !r.duplicate)).toHaveLength(1);
      expect(results.filter((r) => r.duplicate)).toHaveLength(2);
      expect(new Set(results.map((r) => r.id))).toEqual(new Set([clientId]));
      expect(await docs('conversations/alice_bob/messages')).toHaveLength(1);
      expect((await db.doc('conversations/alice_bob').get()).get('unread')).toEqual({ alice: 0, bob: 1 });
    });

    it("refuses an id that is someone else's message, and leaves it untouched", async () => {
      await sendMessage(db, 'bob', { to: 'alice', text: 'bob wrote this', clientId });
      const error = await failure(sendMessage(db, 'alice', { to: 'bob', text: 'overwrite', clientId }));
      expect(error.code).toBe('invalid_request');
      expect((await db.doc(`conversations/alice_bob/messages/${clientId}`).get()).data()).toMatchObject({ senderId: 'bob', text: 'bob wrote this' });
      expect((await db.doc('conversations/alice_bob').get()).get('unread')).toEqual({ alice: 1, bob: 0 });
    });

    it('refuses ids Firestore keeps for itself', async () => {
      expect((await failure(sendMessage(db, 'alice', { to: 'bob', text: 'hi', clientId: '__reserved_id_12345__' }))).code).toBe('invalid_request');
      expect(await docs('conversations/alice_bob/messages')).toHaveLength(0);
    });

    it('is per conversation: the same id may be used with someone else', async () => {
      await db.doc('connections/alice_carol').set({ userIds: ['alice', 'carol'], establishedAt: Timestamp.now() });
      await sendMessage(db, 'alice', { to: 'bob', text: 'to bob', clientId });
      const other = await sendMessage(db, 'alice', { to: 'carol', text: 'to carol', clientId });
      expect(other.duplicate).toBe(false);
      expect((await db.doc(`conversations/alice_carol/messages/${clientId}`).get()).get('text')).toBe('to carol');
    });

    it('still applies the rules to a first send: no connection, no message', async () => {
      expect((await failure(sendMessage(db, 'alice', { to: 'carol', text: 'hi', clientId }))).code).toBe('forbidden');
      expect(await docs('conversations/alice_carol/messages')).toHaveLength(0);
    });

    it('combines with a reply: retried, it keeps its quote', async () => {
      const original = await sendMessage(db, 'bob', { to: 'alice', text: 'question?' });
      await sendMessage(db, 'alice', { to: 'bob', text: 'answer', replyTo: original.id, clientId });
      const again = await sendMessage(db, 'alice', { to: 'bob', text: 'answer', replyTo: original.id, clientId });
      expect(again.duplicate).toBe(true);
      expect((await db.doc(`conversations/alice_bob/messages/${clientId}`).get()).get('replyTo')).toMatchObject({ id: original.id, text: 'question?' });
    });
  });
});
