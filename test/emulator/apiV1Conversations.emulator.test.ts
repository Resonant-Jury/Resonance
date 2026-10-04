import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, Timestamp, type Firestore } from 'firebase-admin/firestore';
import { ApiFailure } from '@/lib/api/v1/http';
import { NOTE_REQUEST_MAX, sendMessage, sendNote } from '@/lib/api/v1/conversations';
import { acceptInvite } from '@/lib/api/v1/invites';
import { resonateWith } from '@/lib/api/v1/resonate';
import { SendMessageRequest } from '@/lib/api/v1/schemas';

// Notes and messages through the v1 API against the Firestore emulator — what
// the web's sendNote() and openConversation() + sendMessage() write from the
// client, with the rules' guarantees (connection, blocks, visibility) re-checked.
// A note is a letter: between two people not connected it waits in their
// conversation (`request`) until the card's author answers it, and that
// answer is what connects them.

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

afterEach(() => {
  vi.restoreAllMocks();
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
  it("leaves the note with the card's author and rings their bell — connecting no one: it waits for their answer", async () => {
    const { id } = await sendNote(db, 'alice', { cardId: 'walk', text: '謝謝你寫下這段，我也常在雨後散步 🌧️' });
    const note = (await db.doc(`notes/${id}`).get()).data()!;
    expect(note).toMatchObject({ cardId: 'walk', fromUserId: 'alice', toUserId: 'bob', readAt: null });
    const [bell] = await docs('notifications');
    expect(bell).toMatchObject({ userId: 'bob', type: 'note', readAt: null, payload: { noteId: id, cardId: 'walk', fromUserId: 'alice', fromHandle: 'alice' } });
    expect((await db.doc('connections/alice_bob').get()).exists).toBe(false);
    expect((await db.doc('conversations/alice_bob').get()).get('request')).toMatchObject({ from: 'alice', cardId: 'walk', count: 1 });
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

  // Opening a thread with the note's writer would zero the author's unread
  // count there, which the writer can watch: a read receipt for "it was you".
  it("says on the bell of a note on an anonymous card that it is one (it opens the card, never the writer's thread); a named card's bell doesn't", async () => {
    const masked = await sendNote(db, 'alice', { cardId: 'masked', text: 'on the anonymous card' });
    const walk = await sendNote(db, 'alice', { cardId: 'walk', text: 'on the named card' });
    const payload = async (id: string | null) => (await db.doc(`notifications/${id}`).get()).get('payload');
    expect(await payload(masked.notificationId)).toMatchObject({ cardId: 'masked', noteId: masked.id, anonymous: true, preview: 'on the anonymous card' });
    expect(await payload(walk.notificationId)).not.toHaveProperty('anonymous');
  });

  describe('in the thread', () => {
    it("opens the two people's conversation with the note as a message on the author's card, ringing once through the chat push", async () => {
      const sent = await sendNote(db, 'alice', { cardId: 'walk', text: '謝謝你寫下這段' });
      const convo = (await db.doc('conversations/alice_bob').get()).data()!;
      expect(convo).toMatchObject({
        participants: ['alice', 'bob'],
        lastMessage: { text: '謝謝你寫下這段', senderId: 'alice' },
        unread: { alice: 0, bob: 1 },
      });
      expect(convo.createdAt).toBeInstanceOf(Timestamp);
      expect(convo.updatedAt).toBeInstanceOf(Timestamp);
      // The message is the note's own id: the note and its message name each other, and `?note=` finds it.
      const message = (await db.doc(`conversations/alice_bob/messages/${sent.id}`).get()).data()!;
      const { sentAt, ...rest } = message;
      expect(rest).toEqual({ senderId: 'alice', text: '謝謝你寫下這段', cardRef: 'walk', kind: 'note' });
      expect(sentAt).toBeInstanceOf(Timestamp);
      // No noteRef: on a message that means "answers a note" (older builds would label it so).
      expect(message).not.toHaveProperty('noteRef');
      expect(await docs('conversations/alice_bob/messages')).toHaveLength(1);

      // The note's bell row lists it, already pushed; no "new conversation" bell beside it.
      const bells = await docs('notifications');
      expect(bells).toHaveLength(1);
      expect(bells[0]).toMatchObject({ userId: 'bob', type: 'note', readAt: null, payload: { noteId: sent.id, cardId: 'walk' } });
      expect((bells[0] as { pushedAt?: unknown }).pushedAt).toBeInstanceOf(Timestamp);
      expect(sent.push).toEqual({ conversationId: 'alice_bob', messageId: sent.id, from: 'alice', to: 'bob' });
      expect(sent.notificationId).toBe(bells[0].id);
    });

    it('cuts the conversation\'s preview of a long note by characters, keeping the whole note in the message', async () => {
      const text = '🌧️'.repeat(150);
      const { id } = await sendNote(db, 'alice', { cardId: 'walk', text });
      expect(Array.from((await db.doc('conversations/alice_bob').get()).get('lastMessage.text'))).toHaveLength(120);
      expect((await db.doc(`conversations/alice_bob/messages/${id}`).get()).get('text')).toBe(text);
    });

    it('joins a conversation already going: its date kept, one more unread for the author, the note its newest message', async () => {
      await db.doc('connections/alice_bob').set({ userIds: ['alice', 'bob'], establishedAt: Timestamp.now() });
      const began = await sendMessage(db, 'bob', { to: 'alice', text: '你好' });
      const createdAt = (await db.doc('conversations/alice_bob').get()).get('createdAt') as Timestamp;
      await sendMessage(db, 'bob', { to: 'alice', text: '在嗎' });
      await sendMessage(db, 'alice', { to: 'bob', text: '在' });
      const { id } = await sendNote(db, 'alice', { cardId: 'walk', text: '這張我好喜歡' });
      const convo = (await db.doc('conversations/alice_bob').get()).data()!;
      expect((convo.createdAt as Timestamp).isEqual(createdAt)).toBe(true);
      expect(convo.unread).toEqual({ alice: 2, bob: 2 });
      expect(convo.lastMessage).toMatchObject({ text: '這張我好喜歡', senderId: 'alice' });
      expect(await docs('conversations/alice_bob/messages')).toHaveLength(4);
      expect((await db.doc(`conversations/alice_bob/messages/${id}`).get()).get('kind')).toBe('note');
      // One bell for the conversation's first message (bob's), one for the note.
      expect((await docs('notifications')).map((b) => (b as { type?: string }).type).sort()).toEqual(['message', 'note']);
      expect(began.conversationId).toBe('alice_bob');
      // Between two people already connected a note is one more message: no letter waits.
      expect(convo).not.toHaveProperty('request');
    });

    it('keeps a note on an anonymous card out of every thread, even between two people already connected', async () => {
      await db.doc('connections/alice_bob').set({ userIds: ['alice', 'bob'], establishedAt: Timestamp.now() });
      await sendMessage(db, 'alice', { to: 'bob', text: 'hi' });
      const before = (await db.doc('conversations/alice_bob').get()).data()!;
      const sent = await sendNote(db, 'alice', { cardId: 'masked', text: 'about your anonymous card' });
      expect(sent.push).toBeNull();
      expect(await docs('conversations/alice_bob/messages')).toHaveLength(1);
      expect((await db.doc('conversations/alice_bob').get()).data()).toEqual(before);
      // Its bell row rings it, as before.
      const bell = (await db.doc(`notifications/${sent.notificationId}`).get()).data()!;
      expect(bell).toMatchObject({ userId: 'bob', type: 'note', payload: { noteId: sent.id } });
      expect(bell).not.toHaveProperty('pushedAt');
    });

    it('reads the card\'s byline in its own transaction: one made anonymous the moment the note is sent stays out of the thread', async () => {
      // Bob takes his byline off between the note's first read of the card and its transaction.
      const run = db.runTransaction.bind(db);
      vi.spyOn(db, 'runTransaction').mockImplementationOnce(async (fn, opts) => {
        await db.doc('cards/walk').update({ anonymous: true });
        return run(fn, opts);
      });
      const sent = await sendNote(db, 'alice', { cardId: 'walk', text: 'hi' });
      expect(sent.push).toBeNull();
      expect(await docs('conversations')).toHaveLength(0);
      expect((await db.doc('connections/alice_bob').get()).exists).toBe(false);
      expect((await db.doc(`notes/${sent.id}`).get()).exists).toBe(true);
    });

    it('opens no conversation for a note on an anonymous card between strangers', async () => {
      const sent = await sendNote(db, 'alice', { cardId: 'masked', text: 'hi' });
      expect(sent.push).toBeNull();
      expect((await db.doc('conversations/alice_bob').get()).exists).toBe(false);
      expect(await docs('conversations/alice_bob/messages')).toHaveLength(0);
    });

    it('writes no conversation across a block', async () => {
      await db.doc('users/alice/blocks/bob').set({ blockedUid: 'bob' });
      expect((await failure(sendNote(db, 'alice', { cardId: 'walk', text: 'hi' }))).code).toBe('blocked');
      expect(await docs('conversations')).toHaveLength(0);
      expect(await docs('conversations/alice_bob/messages')).toHaveLength(0);
    });

    it('can be answered like any message: the reply quotes the note and its card', async () => {
      const { id } = await sendNote(db, 'alice', { cardId: 'walk', text: '雨後的散步真好' });
      const reply = await sendMessage(db, 'bob', { to: 'alice', text: '謝謝你的紙條', replyTo: id });
      expect((await db.doc(`conversations/alice_bob/messages/${reply.id}`).get()).get('replyTo')).toEqual({
        id, senderId: 'alice', text: '雨後的散步真好', cardRef: 'walk',
      });
    });

    it("can't be overwritten through a clientId: refused from the author, a duplicate from its sender", async () => {
      const { id } = await sendNote(db, 'alice', { cardId: 'walk', text: 'the note' });
      expect((await failure(sendMessage(db, 'bob', { to: 'alice', text: 'overwrite', clientId: id }))).code).toBe('invalid_request');
      const again = await sendMessage(db, 'alice', { to: 'bob', text: 'overwrite', clientId: id });
      expect(again).toMatchObject({ id, duplicate: true, push: null });
      expect((await db.doc(`conversations/alice_bob/messages/${id}`).get()).data()).toMatchObject({ senderId: 'alice', text: 'the note', kind: 'note' });
      expect((await db.doc('conversations/alice_bob').get()).get('unread')).toEqual({ alice: 0, bob: 1 });
    });
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

  it('needs a pen name first, writing nothing', async () => {
    for (const profile of [null, { handle: '' }, { initials: 'a' }]) {
      if (profile) await db.doc('users/alice').set(profile);
      else await db.doc('users/alice').delete();
      const refused = await failure(sendNote(db, 'alice', { cardId: 'walk', text: 'hi' }));
      expect(refused.code).toBe('forbidden');
      expect(refused.message).toBe('Choose a pen name first.');
    }
    expect(await docs('notes')).toHaveLength(0);
    expect(await docs('notifications')).toHaveLength(0);
    expect((await db.doc('connections/alice_bob').get()).exists).toBe(false);
  });

  it('asks for the pen name before the blocks, so a refusal says nothing of who blocked whom', async () => {
    await db.doc('users/alice').set({ handle: '' });
    for (const [blocker, blocked] of [['alice', 'bob'], ['bob', 'alice']]) {
      await db.doc(`users/${blocker}/blocks/${blocked}`).set({ blockedUid: blocked });
      for (const cardId of ['walk', 'masked']) {
        expect((await failure(sendNote(db, 'alice', { cardId, text: 'hi' }))).message).toBe('Choose a pen name first.');
      }
      await db.doc(`users/${blocker}/blocks/${blocked}`).delete();
    }
    expect(await docs('notes')).toHaveLength(0);
  });

  describe('an anonymous card across a block', () => {
    // A block never answers for an anonymous card: the sender keeps their own
    // block list, and a refusal would name the author.
    it('is answered as delivered, and delivers nothing: no bell, no push, the note addressed to no one', async () => {
      for (const [blocker, blocked] of [['alice', 'bob'], ['bob', 'alice']]) {
        await db.doc(`users/${blocker}/blocks/${blocked}`).set({ blockedUid: blocked });
        const sent = await sendNote(db, 'alice', { cardId: 'masked', text: 'about your anonymous card' });
        expect(sent).toEqual({ id: expect.stringMatching(/^[A-Za-z0-9]{20}$/), notificationId: null, push: null });
        const note = (await db.doc(`notes/${sent.id}`).get()).data()!;
        // Withheld from Bob, the card's author: it goes with his account, as a delivered note would.
        expect(note).toMatchObject({ cardId: 'masked', fromUserId: 'alice', toUserId: null, withheldFor: 'bob', text: 'about your anonymous card', readAt: null });
        expect(note.createdAt).toBeInstanceOf(Timestamp);
        await db.doc(`users/${blocker}/blocks/${blocked}`).delete();
      }
      expect(await docs('notifications')).toHaveLength(0);
      expect(await docs('conversations')).toHaveLength(0);
      expect((await db.doc('connections/alice_bob').get()).exists).toBe(false);
    });

    it('looks to the sender like a note that was delivered: the same answer, the same record of it', async () => {
      const delivered = await sendNote(db, 'alice', { cardId: 'masked', text: 'hi' });
      await db.doc('users/alice/blocks/bob').set({ blockedUid: 'bob' });
      const withheld = await sendNote(db, 'alice', { cardId: 'masked', text: 'hi' });
      expect(Object.keys(withheld).sort()).toEqual(Object.keys(delivered).sort());
      // All the sender ever sees of a note is its id (the route answers `{ id }`) and their export.
      const { exportAccountData } = await import('@/lib/account/export');
      const rows = (await exportAccountData(db, 'alice')).notesSent.map(({ id: _id, createdAt: _at, ...row }) => row);
      expect(rows).toHaveLength(2);
      expect(rows[0]).toEqual(rows[1]);
    });

    it('still refuses a named card, with one answer for both directions', async () => {
      for (const [blocker, blocked] of [['alice', 'bob'], ['bob', 'alice']]) {
        await db.doc(`users/${blocker}/blocks/${blocked}`).set({ blockedUid: blocked });
        const refused = await failure(sendNote(db, 'alice', { cardId: 'walk', text: 'hi' }));
        expect([refused.code, refused.message]).toEqual(['blocked', 'You cannot send a note to this person.']);
        await db.doc(`users/${blocker}/blocks/${blocked}`).delete();
      }
      expect(await docs('notes')).toHaveLength(0);
    });
  });

  // The card read before the transaction can change before it runs: the
  // transaction's own read of it decides.
  it('is not_found when the card is deleted or hidden between its first read and the transaction, writing nothing', async () => {
    const run = db.runTransaction.bind(db);
    for (const change of [() => db.doc('cards/walk').delete(), () => db.doc('cards/walk').update({ visibility: 'private' })]) {
      await db.doc('cards/walk').set({ authorId: 'bob', thoughtCore: 'title walk', story: 's', visibility: 'public', anonymous: false, publishedAt: Timestamp.now() });
      vi.spyOn(db, 'runTransaction').mockImplementationOnce(async (fn, opts) => {
        await change();
        return run(fn, opts);
      });
      expect((await failure(sendNote(db, 'alice', { cardId: 'walk', text: 'hi' }))).code).toBe('not_found');
    }
    expect(await docs('notes')).toHaveLength(0);
    expect(await docs('notifications')).toHaveLength(0);
    expect(await docs('conversations')).toHaveLength(0);
  });

  it("takes the card's id (the contract's cardId): a slug names no card here", async () => {
    await db.doc('cards/walk').set({ slug: 'a-rainy-walk' }, { merge: true });
    expect((await failure(sendNote(db, 'alice', { cardId: 'a-rainy-walk', text: 'hi' }))).code).toBe('not_found');
    expect(await docs('notes')).toHaveLength(0);
  });
});

describe('a letter: a note between two people not connected', () => {
  beforeEach(async () => {
    const published = Timestamp.fromDate(new Date('2026-09-02T08:00:00Z'));
    const card = (id: string, authorId: string, extra: Record<string, unknown> = {}) =>
      db.doc(`cards/${id}`).set({ authorId, thoughtCore: `title ${id}`, story: 's', visibility: 'public', anonymous: false, publishedAt: published, ...extra });
    await Promise.all([card('river', 'bob'), card('dawn', 'alice'), card('aliceMasked', 'alice', { anonymous: true })]);
  });

  const convo = async () => (await db.doc('conversations/alice_bob').get()).data();
  const connected = async () => (await db.doc('connections/alice_bob').get()).exists;

  it('goes into their thread and rings the author through the chat push, but connects no one: the conversation holds the request', async () => {
    const sent = await sendNote(db, 'alice', { cardId: 'walk', text: '我也在雨後散步' });
    expect(sent.push).toEqual({ conversationId: 'alice_bob', messageId: sent.id, from: 'alice', to: 'bob' });
    expect((await db.doc(`conversations/alice_bob/messages/${sent.id}`).get()).data()).toMatchObject({ senderId: 'alice', cardRef: 'walk', kind: 'note' });
    expect((await db.doc(`notifications/${sent.notificationId}`).get()).get('pushedAt')).toBeInstanceOf(Timestamp);
    expect(await connected()).toBe(false);
    const c = (await convo())!;
    expect(c).toMatchObject({ participants: ['alice', 'bob'], unread: { alice: 0, bob: 1 }, lastMessage: { senderId: 'alice' } });
    expect(Object.keys(c.request).sort()).toEqual(['at', 'cardId', 'count', 'from']);
    expect(c.request).toMatchObject({ from: 'alice', cardId: 'walk', count: 1 });
    expect(c.request.at).toBeInstanceOf(Timestamp);
  });

  it(`counts each note, naming the latest one's card and time; past ${NOTE_REQUEST_MAX} it is refused "Wait for them to reply.", writing and ringing nothing`, async () => {
    expect(NOTE_REQUEST_MAX).toBe(3);
    await sendNote(db, 'alice', { cardId: 'walk', text: 'one' });
    const firstAt = (await convo())!.request.at as Timestamp;
    await sendNote(db, 'alice', { cardId: 'river', text: 'two' });
    await sendNote(db, 'alice', { cardId: 'walk', text: 'three' });
    const third = (await convo())!;
    expect(third.request).toMatchObject({ from: 'alice', cardId: 'walk', count: 3 });
    expect((third.request.at as Timestamp).toMillis()).toBeGreaterThanOrEqual(firstAt.toMillis());

    const refused = await failure(sendNote(db, 'alice', { cardId: 'river', text: 'four' }));
    expect(refused.code).toBe('conflict');
    expect(refused.message).toBe('Wait for them to reply.');
    expect(await docs('notes')).toHaveLength(3);
    expect(await docs('notifications')).toHaveLength(3);
    expect(await docs('conversations/alice_bob/messages')).toHaveLength(3);
    expect(await convo()).toEqual(third);
    expect(await connected()).toBe(false);
  });

  it("can't be followed by a message from its writer: refused as any stranger's, the letter left as it was", async () => {
    await sendNote(db, 'alice', { cardId: 'walk', text: 'a letter' });
    const before = await convo();
    const refused = await failure(sendMessage(db, 'alice', { to: 'bob', text: 'and a message' }));
    expect(refused.code).toBe('forbidden');
    expect(refused.message).toBe('You can message people you are connected with.');
    expect(await convo()).toEqual(before);
    expect(await docs('conversations/alice_bob/messages')).toHaveLength(1);
    // Nor does a letter to Bob let Bob's other strangers, or Alice, write to anyone else.
    expect((await failure(sendMessage(db, 'bob', { to: 'carol', text: 'hi' }))).code).toBe('forbidden');
    expect((await failure(sendMessage(db, 'alice', { to: 'carol', text: 'hi' }))).code).toBe('forbidden');
  });

  it("is answered by the author's reply, which connects the two, clears the request and is delivered like any message", async () => {
    const note = await sendNote(db, 'alice', { cardId: 'walk', text: '謝謝你寫下這段' });
    expect(await connected()).toBe(false);
    const reply = await sendMessage(db, 'bob', { to: 'alice', text: '謝謝你的紙條', replyTo: note.id });
    expect(reply).toMatchObject({ conversationId: 'alice_bob', duplicate: false, push: { conversationId: 'alice_bob', messageId: reply.id, from: 'bob', to: 'alice' } });
    const connection = (await db.doc('connections/alice_bob').get()).data()!;
    expect(connection.userIds).toEqual(['alice', 'bob']);
    expect(connection.establishedAt).toBeInstanceOf(Timestamp);
    const c = (await convo())!;
    expect(c).not.toHaveProperty('request');
    expect(c).toMatchObject({ unread: { alice: 1, bob: 1 }, lastMessage: { text: '謝謝你的紙條', senderId: 'bob' } });
    expect((await db.doc(`conversations/alice_bob/messages/${reply.id}`).get()).data()).toMatchObject({
      senderId: 'bob', text: '謝謝你的紙條', replyTo: { id: note.id, senderId: 'alice', cardRef: 'walk' },
    });
    // The conversation was there: no "new conversation" bell beside the note's.
    expect((await docs('notifications')).map((b) => (b as { type?: string }).type)).toEqual(['note']);

    // Connected now: both write freely, and a note is one more message, opening no letter.
    await sendMessage(db, 'alice', { to: 'bob', text: '真高興收到回覆' });
    for (let i = 0; i < NOTE_REQUEST_MAX + 1; i++) await sendNote(db, 'alice', { cardId: 'river', text: `note ${i}` });
    expect(await convo()).not.toHaveProperty('request');
  });

  it('is answered as older builds answer a note too: a reply carrying its noteRef', async () => {
    const note = await sendNote(db, 'alice', { cardId: 'walk', text: 'a letter' });
    expect(await connected()).toBe(false);
    await sendMessage(db, 'bob', { to: 'alice', text: 'thanks', noteRef: { cardId: 'walk', noteId: note.id } });
    expect(await connected()).toBe(true);
    expect(await convo()).not.toHaveProperty('request');
  });

  it('crossing letters: a note to someone whose own letter waits answers it — connected, the request cleared, the note threaded and rung', async () => {
    await sendNote(db, 'alice', { cardId: 'walk', text: "alice's letter" });
    expect(await connected()).toBe(false);
    const crossing = await sendNote(db, 'bob', { cardId: 'dawn', text: "bob's letter" });
    expect(await connected()).toBe(true);
    const c = (await convo())!;
    expect(c).not.toHaveProperty('request');
    expect(c.unread).toEqual({ alice: 1, bob: 1 });
    expect(crossing.push).toEqual({ conversationId: 'alice_bob', messageId: crossing.id, from: 'bob', to: 'alice' });
    expect((await db.doc(`conversations/alice_bob/messages/${crossing.id}`).get()).data()).toMatchObject({ senderId: 'bob', cardRef: 'dawn', kind: 'note' });
    expect((await db.doc(`notifications/${crossing.notificationId}`).get()).get('pushedAt')).toBeInstanceOf(Timestamp);
  });

  describe('its count, kept where deleting the thread cannot reach (letters/{writer}_{author})', () => {
    const letter = async (from = 'alice', to = 'bob') => (await db.doc(`letters/${from}_${to}`).get()).data();
    // What a client's delete does: the messages, then the conversation (either participant may).
    const deleteThread = () => db.recursiveDelete(db.doc('conversations/alice_bob'));

    it("counts the writer's unanswered notes, naming the latest one's card and time", async () => {
      await sendNote(db, 'alice', { cardId: 'walk', text: 'one' });
      await sendNote(db, 'alice', { cardId: 'river', text: 'two' });
      const counted = (await letter())!;
      expect(Object.keys(counted).sort()).toEqual(['at', 'cardId', 'count', 'from', 'to']);
      expect(counted).toMatchObject({ from: 'alice', to: 'bob', count: 2, cardId: 'river' });
      expect(counted.at).toBeInstanceOf(Timestamp);
      expect((await convo())!.request).toMatchObject({ from: 'alice', count: 2 });
    });

    for (const [who, what] of [['alice', 'withdraws it'], ['bob', 'declines it']] as const) {
      it(`survives the thread's deletion — ${who} ${what}: three notes in all, then "Wait for them to reply."`, async () => {
        await sendNote(db, 'alice', { cardId: 'walk', text: 'one' });
        await sendNote(db, 'alice', { cardId: 'river', text: 'two' });
        await deleteThread();
        // The next note opens the thread again, the count going on.
        await sendNote(db, 'alice', { cardId: 'walk', text: 'three' });
        expect((await convo())!.request).toMatchObject({ from: 'alice', count: 3 });
        await deleteThread();
        const refused = await failure(sendNote(db, 'alice', { cardId: 'river', text: 'four' }));
        expect([refused.code, refused.message]).toEqual(['conflict', 'Wait for them to reply.']);
        expect(await convo()).toBeUndefined();
        expect(await docs('notes')).toHaveLength(3);
        expect(await docs('notifications')).toHaveLength(3);
        expect(await letter()).toMatchObject({ count: 3 });
      });

      it(`can't be answered once ${who} ${what}: the reply connects no one`, async () => {
        await sendNote(db, 'alice', { cardId: 'walk', text: 'a letter' });
        await deleteThread();
        const refused = await failure(sendMessage(db, 'bob', { to: 'alice', text: 'hello' }));
        expect([refused.code, refused.message]).toEqual(['forbidden', 'You can message people you are connected with.']);
        expect(await connected()).toBe(false);
        // A note of Bob's back is a letter of his own now, not an answer.
        await sendNote(db, 'bob', { cardId: 'dawn', text: 'hello' });
        expect(await connected()).toBe(false);
        expect((await convo())!.request).toMatchObject({ from: 'bob', count: 1 });
        expect(await letter()).toMatchObject({ count: 1 });
      });
    }

    const fixtures = () => Promise.all([
      db.doc('cards/bobAnswer').set({ authorId: 'bob', thoughtCore: 'answer', story: 's', visibility: 'public', anonymous: false, publishedAt: Timestamp.now() }),
      db.doc('invites/i1').set({ fromUserId: 'alice', toUserId: 'bob', status: 'pending', expiresAt: Timestamp.fromMillis(Date.now() + 86_400_000) }),
      // An older count of Bob's to Alice, from a letter she declined.
      db.doc('letters/bob_alice').set({ from: 'bob', to: 'alice', count: 2, cardId: 'dawn', at: Timestamp.now() }),
    ]);
    const paths: [string, () => Promise<unknown>][] = [
      ['a reply', () => sendMessage(db, 'bob', { to: 'alice', text: 'hello' })],
      ['a crossing note', () => sendNote(db, 'bob', { cardId: 'dawn', text: 'hello' })],
      ['a legacy invite', () => acceptInvite(db, 'bob', 'i1')],
    ];
    for (const [path, answer] of paths) {
      it(`goes, both ways, when its recipient answers it with ${path}`, async () => {
        await fixtures();
        await sendNote(db, 'alice', { cardId: 'walk', text: 'a letter' });
        await answer();
        expect(await connected()).toBe(true);
        expect(await letter('alice', 'bob')).toBeUndefined();
        expect(await letter('bob', 'alice')).toBeUndefined();
        expect(await convo()).not.toHaveProperty('request');
      });
    }

    // A resonance is not an answer: taken back, it would have reset the count of a letter never answered.
    it('stays, both ways, when a resonance connects the two: only its recipient answers a letter', async () => {
      await fixtures();
      await sendNote(db, 'alice', { cardId: 'walk', text: 'a letter' });
      const waiting = (await convo())!.request;
      await resonateWith(db, 'bob', 'dawn', 'bobAnswer');
      expect(await connected()).toBe(true);
      expect(await letter('alice', 'bob')).toMatchObject({ count: 1 });
      expect(await letter('bob', 'alice')).toMatchObject({ count: 2 });
      expect((await convo())!.request).toEqual(waiting);
    });
  });

  it('answers past the cap: crossing letters are a reply, never a fourth note', async () => {
    for (let i = 0; i < NOTE_REQUEST_MAX; i++) await sendNote(db, 'bob', { cardId: 'dawn', text: `bob ${i}` });
    expect((await convo())!.request).toMatchObject({ from: 'bob', count: NOTE_REQUEST_MAX });
    await sendNote(db, 'alice', { cardId: 'walk', text: 'answering' });
    expect(await connected()).toBe(true);
    expect(await convo()).not.toHaveProperty('request');
  });

  describe('anonymous cards, unchanged: the bell alone', () => {
    it('opens no conversation, no request and no connection between strangers', async () => {
      const sent = await sendNote(db, 'alice', { cardId: 'masked', text: 'hi' });
      expect(sent.push).toBeNull();
      expect(await convo()).toBeUndefined();
      expect(await connected()).toBe(false);
    });

    it("neither counts toward a letter's cap nor is refused by it — that would tell whose card it is", async () => {
      for (let i = 0; i < NOTE_REQUEST_MAX; i++) await sendNote(db, 'alice', { cardId: 'walk', text: `note ${i}` });
      const before = await convo();
      expect(before!.request).toMatchObject({ from: 'alice', count: NOTE_REQUEST_MAX });
      const sent = await sendNote(db, 'alice', { cardId: 'masked', text: 'about your anonymous card' });
      expect(sent.push).toBeNull();
      expect((await db.doc(`notes/${sent.id}`).get()).exists).toBe(true);
      expect(await convo()).toEqual(before);
      expect(await docs('conversations/alice_bob/messages')).toHaveLength(NOTE_REQUEST_MAX);
    });

    it("never lets the author's answer say they wrote one: replying to its note answers the letter, without the note", async () => {
      // Alice's letter on Bob's named card, then a note on an anonymous card (Bob's).
      await sendNote(db, 'alice', { cardId: 'walk', text: 'a letter' });
      const { id: onMasked } = await sendNote(db, 'alice', { cardId: 'masked', text: 'whose is this?' });
      // Bob taps that note's bell and replies: the client attaches it.
      const reply = await sendMessage(db, 'bob', { to: 'alice', text: 'hello', noteRef: { cardId: 'masked', noteId: onMasked } });
      expect(await connected()).toBe(true);
      const stored = (await db.doc(`conversations/alice_bob/messages/${reply.id}`).get()).data()!;
      expect(stored).toMatchObject({ senderId: 'bob', text: 'hello' });
      expect(stored).not.toHaveProperty('noteRef');
    });

    it("doesn't answer a letter either: a note on the writer's anonymous card connects no one and leaves it waiting", async () => {
      await sendNote(db, 'alice', { cardId: 'walk', text: "alice's letter" });
      const before = await convo();
      const sent = await sendNote(db, 'bob', { cardId: 'aliceMasked', text: 'hi' });
      expect(sent.push).toBeNull();
      expect(await connected()).toBe(false);
      expect(await convo()).toEqual(before);
    });
  });

  describe('across a block', () => {
    it("refuses the author's reply when they blocked the writer, leaving the letter waiting", async () => {
      await sendNote(db, 'alice', { cardId: 'walk', text: 'a letter' });
      const before = await convo();
      await db.doc('users/bob/blocks/alice').set({ blockedUid: 'alice' });
      expect((await failure(sendMessage(db, 'bob', { to: 'alice', text: 'hi' }))).code).toBe('blocked');
      expect(await connected()).toBe(false);
      expect(await convo()).toEqual(before);
      // Unblocked, the letter is still theirs to answer.
      await db.doc('users/bob/blocks/alice').delete();
      await sendMessage(db, 'bob', { to: 'alice', text: 'hi' });
      expect(await connected()).toBe(true);
      expect(await convo()).not.toHaveProperty('request');
    });

    it('refuses the reply when the writer blocked the author since, with the same answer', async () => {
      await sendNote(db, 'alice', { cardId: 'walk', text: 'a letter' });
      const before = await convo();
      await db.doc('users/alice/blocks/bob').set({ blockedUid: 'bob' });
      expect((await failure(sendMessage(db, 'bob', { to: 'alice', text: 'hi' }))).code).toBe('blocked');
      expect((await failure(sendNote(db, 'bob', { cardId: 'dawn', text: 'hi' }))).code).toBe('blocked');
      expect(await connected()).toBe(false);
      expect(await convo()).toEqual(before);
    });
  });

  it("needs the answerer's pen name, as every message does, leaving the letter waiting", async () => {
    await sendNote(db, 'alice', { cardId: 'walk', text: 'a letter' });
    const before = await convo();
    await db.doc('users/bob').set({ handle: '' });
    expect((await failure(sendMessage(db, 'bob', { to: 'alice', text: 'hi' }))).code).toBe('forbidden');
    expect(await connected()).toBe(false);
    expect(await convo()).toEqual(before);
  });

  it('beside a connection made otherwise, waits for its recipient: their message or note answers it, its writer\'s words leave it', async () => {
    await sendNote(db, 'alice', { cardId: 'walk', text: 'a letter' });
    await db.doc('connections/alice_bob').set({ userIds: ['alice', 'bob'], establishedAt: Timestamp.now() });
    await sendMessage(db, 'alice', { to: 'bob', text: 'hi' });
    await sendNote(db, 'alice', { cardId: 'river', text: 'and a note' });
    expect((await convo())!.request).toMatchObject({ from: 'alice', count: 1 });
    expect((await db.doc('letters/alice_bob').get()).get('count')).toBe(1);
    await sendMessage(db, 'bob', { to: 'alice', text: 'thanks' });
    expect(await convo()).not.toHaveProperty('request');
    expect((await db.doc('letters/alice_bob').get()).exists).toBe(false);
    // Bob's letter, Alice's note back: answered too.
    await db.doc('conversations/alice_bob').update({ request: { from: 'bob', cardId: 'dawn', at: Timestamp.now(), count: 1 } });
    await db.doc('letters/bob_alice').set({ from: 'bob', to: 'alice', count: 1, cardId: 'dawn', at: Timestamp.now() });
    await sendNote(db, 'alice', { cardId: 'walk', text: 'a note' });
    expect(await convo()).not.toHaveProperty('request');
    expect((await db.doc('letters/bob_alice').get()).exists).toBe(false);
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
    const sent = await sendMessage(db, 'bob', { to: 'alice', text: '', cardRef: 'walk', noteRef: { cardId: 'walk', noteId } });
    const message = (await db.doc(`conversations/alice_bob/messages/${sent.id}`).get()).data();
    expect(message).toMatchObject({ senderId: 'bob', text: '', cardRef: 'walk', noteRef: { cardId: 'walk', noteId } });
    expect(message).not.toHaveProperty('kind');
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
  it('needs a pen name first, even between two people already connected: the thread and every push name the sender', async () => {
    for (const profile of [null, { handle: ' ' }, { initials: 'a' }]) {
      if (profile) await db.doc('users/alice').set(profile);
      else await db.doc('users/alice').delete();
      const refused = await failure(sendMessage(db, 'alice', { to: 'bob', text: 'hi' }));
      expect(refused.code).toBe('forbidden');
      expect(refused.message).toBe('Choose a pen name first.');
    }
    expect((await db.doc('conversations/alice_bob').get()).exists).toBe(false);
    expect(await docs('notifications')).toHaveLength(0);
  });

  it('asks for the pen name before the blocks', async () => {
    await db.doc('users/alice').set({ handle: '' });
    await db.doc('users/bob/blocks/alice').set({ blockedUid: 'alice' });
    expect((await failure(sendMessage(db, 'alice', { to: 'bob', text: 'hi' }))).message).toBe('Choose a pen name first.');
  });

  describe('noteRef', () => {
    // A message answers a note the recipient left the sender, on the card it
    // names — anything else is one and the same refusal, so a note of your own
    // on an anonymous card can't ask, by which error comes back, who wrote it.
    it('answers only a note the recipient left the sender, on the card it names', async () => {
      const { id: theirs } = await sendNote(db, 'alice', { cardId: 'walk', text: 'from alice to bob' });
      expect((await sendMessage(db, 'bob', { to: 'alice', text: 'thanks', noteRef: { cardId: 'walk', noteId: theirs } })).duplicate).toBe(false);
      const refusals = [
        // Your own note to them, quoted back.
        () => sendMessage(db, 'alice', { to: 'bob', text: 'x', noteRef: { cardId: 'walk', noteId: theirs } }),
        // Their note to you, on another card than it names.
        () => sendMessage(db, 'bob', { to: 'alice', text: 'x', noteRef: { cardId: 'masked', noteId: theirs } }),
        // A note that isn't there.
        () => sendMessage(db, 'bob', { to: 'alice', text: 'x', noteRef: { cardId: 'walk', noteId: 'nope' } }),
      ];
      for (const refused of refusals) {
        const e = await failure(refused());
        expect([e.code, e.message]).toEqual(['invalid_request', 'That is not a note they left you.']);
      }
    });

    it("answers a note of your own on an anonymous card with one refusal, whoever wrote the card", async () => {
      // Alice is connected with Bob (who wrote `masked`) and with Carol (who didn't).
      await db.doc('connections/alice_carol').set({ userIds: ['alice', 'carol'], establishedAt: Timestamp.now() });
      const { id } = await sendNote(db, 'alice', { cardId: 'masked', text: 'whose is this?' });
      const answers = [];
      for (const to of ['bob', 'carol']) {
        const e = await failure(sendMessage(db, 'alice', { to, text: 'x', noteRef: { cardId: 'masked', noteId: id }, replyTo: 'nope' }));
        answers.push([e.code, e.message]);
      }
      expect(answers[0]).toEqual(answers[1]);
      expect(await docs('conversations/alice_bob/messages')).toHaveLength(0);
      expect(await docs('conversations/alice_carol/messages')).toHaveLength(0);
    });

    it("sends a reply to a note on your anonymous card without saying which card: the message goes, its noteRef left out", async () => {
      const { id: onMasked } = await sendNote(db, 'alice', { cardId: 'masked', text: 'about your anonymous card' });
      const { id: onWalk } = await sendNote(db, 'alice', { cardId: 'walk', text: 'about your walk' });
      // Bob answers both from the bell, as every client does: the note attached.
      const masked = await sendMessage(db, 'bob', { to: 'alice', text: 'thank you', noteRef: { cardId: 'masked', noteId: onMasked } });
      const walk = await sendMessage(db, 'bob', { to: 'alice', text: 'thanks', noteRef: { cardId: 'walk', noteId: onWalk } });
      const stored = (await db.doc(`conversations/alice_bob/messages/${masked.id}`).get()).data()!;
      expect(stored).toMatchObject({ senderId: 'bob', text: 'thank you' });
      expect(stored).not.toHaveProperty('noteRef');
      expect((await db.doc(`conversations/alice_bob/messages/${walk.id}`).get()).get('noteRef')).toEqual({ cardId: 'walk', noteId: onWalk });
      // Nothing of the masked note anywhere Alice reads.
      expect(JSON.stringify(await docs('conversations/alice_bob/messages'))).not.toContain(onMasked);
    });

    it('refuses a noteRef naming ids Firestore keeps for itself as any other wrong note, not an error of the server\'s', async () => {
      await db.doc('connections/alice_bob').set({ userIds: ['alice', 'bob'], establishedAt: Timestamp.now() });
      for (const noteRef of [{ cardId: '__x__', noteId: 'n1' }, { cardId: 'walk', noteId: '__x__' }]) {
        const e = await failure(sendMessage(db, 'bob', { to: 'alice', text: 'x', noteRef }));
        expect([e.code, e.message]).toEqual(['invalid_request', 'That is not a note they left you.']);
      }
      expect(await docs('conversations/alice_bob/messages')).toHaveLength(0);
    });

    it('leaves out the noteRef of a card made anonymous since, or gone (it may have been one)', async () => {
      const { id: before } = await sendNote(db, 'alice', { cardId: 'walk', text: 'on a named card' });
      await db.doc('cards/walk').update({ anonymous: true });
      const madeAnonymous = await sendMessage(db, 'bob', { to: 'alice', text: 'x', noteRef: { cardId: 'walk', noteId: before } });
      expect((await db.doc(`conversations/alice_bob/messages/${madeAnonymous.id}`).get()).get('noteRef')).toBeUndefined();
      await db.doc('cards/walk').delete();
      const gone = await sendMessage(db, 'bob', { to: 'alice', text: 'y', noteRef: { cardId: 'walk', noteId: before } });
      expect((await db.doc(`conversations/alice_bob/messages/${gone.id}`).get()).get('noteRef')).toBeUndefined();
    });
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
