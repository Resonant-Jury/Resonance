import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, Timestamp, type Firestore } from 'firebase-admin/firestore';
import { ApiFailure } from '@/lib/api/v1/http';
import { sendMessage, sendNote } from '@/lib/api/v1/conversations';

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
});
