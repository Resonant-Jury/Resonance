import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, Timestamp, type Firestore } from 'firebase-admin/firestore';
import en from '@/messages/en.json';
import zhTW from '@/messages/zh-TW.json';
import { NOTE_REQUEST_MAX } from '@/lib/api/v1/conversations';

// The app builds made before letters (iOS ≤ 6, Android ≤ 7 — the store
// builds, from 7136d72) against today's server, through the real route
// handlers and the Firestore emulator (lib/api/v1/preLetter):
//
// - They open a thread, and its composer, only for someone the profile says
//   they're connected with. A letter's recipient on one is told so while the
//   letter waits for their answer, and the answer POST /messages then takes
//   connects the two — for no one else, never across a block, never to the
//   letter's writer.
// - They show the server's message on a 403 but know no 409 on POST /notes:
//   past the unanswered notes a writer may leave, they get a 403 in their
//   app's language. Everyone else still gets the 409.
// - They can't pick "connections" but keep a web draft's: with their
//   anonymous switch saved beside it (the rules now take that on a draft),
//   publishing refuses the card in words they show, in their language,
//   instead of publishing it under its author's name.

const mocks = vi.hoisted(() => ({ db: null as unknown, viewer: 'bob' }));
vi.mock('@/lib/auth', () => ({ getCurrentUser: async () => ({ id: mocks.viewer }) }));
vi.mock('@/lib/db/firestore/admin', () => ({ getAdminDb: () => mocks.db }));
// Pushes, unfurls and App Check notes run after the response: never here.
vi.mock('next/server', async (orig) => ({ ...(await orig<typeof import('next/server')>()), after: () => {} }));

const profileRoute = await import('@/app/api/v1/users/[handle]/route');
const notesRoute = await import('@/app/api/v1/notes/route');
const messagesRoute = await import('@/app/api/v1/messages/route');
const publishRoute = await import('@/app/api/v1/cards/[key]/publish/route');

const PROJECT = 'demo-resonance-api-pre-letter';
let app: App;
let db: Firestore;

beforeAll(() => {
  process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
  app = initializeApp({ projectId: PROJECT }, 'api-v1-pre-letter-test');
  db = getFirestore(app);
  mocks.db = db;
});

afterAll(async () => {
  await deleteApp(app);
});

afterEach(() => {
  vi.restoreAllMocks();
});

const published = Timestamp.fromDate(new Date('2026-09-01T08:00:00Z'));

beforeEach(async () => {
  await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, {
    method: 'DELETE',
  });
  mocks.viewer = 'bob';
  await Promise.all(
    ['alice', 'bob', 'carol'].map((id) =>
      db.doc(`users/${id}`).set({ handle: id, handleLower: id, initials: id.slice(0, 2).toUpperCase(), joinedAt: published }),
    ),
  );
  const card = (id: string, authorId: string, extra: Record<string, unknown> = {}) =>
    db.doc(`cards/${id}`).set({ authorId, thoughtCore: `title ${id}`, story: 's', tags: [], visibility: 'public', anonymous: false, publishedAt: published, ...extra });
  await Promise.all([card('walk', 'bob'), card('masked', 'bob', { anonymous: true }), card('rain', 'carol')]);
});

// The User-Agents the apps send (AppHTTP / AppHttp): the store builds, and the first builds after letters.
const OLD_IOS = 'Resonance/2.0.0 (iOS 18.5; build 6)';
const OLD_ANDROID = 'Resonance/2.0.0 (Android 15; build 7)';
const NEW_IOS = 'Resonance/2.0.0 (iOS 26.0; build 7)';
const NEW_ANDROID = 'Resonance/2.0.0 (Android 16; build 8)';
const WEB = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36';

type Headers = Record<string, string>;
const as = (uid: string) => void (mocks.viewer = uid);
const get = (path: string, headers: Headers) => new Request(`http://localhost${path}`, { headers });
const post = (path: string, body: unknown, headers: Headers) =>
  new Request(`http://localhost${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });

async function profile(handle: string, agent: string, include = 'cards') {
  const res = await profileRoute.GET(get(`/api/v1/users/${handle}?include=${include}`, { 'User-Agent': agent }), { params: Promise.resolve({ handle }) });
  expect(res.status).toBe(200);
  return (await res.json()) as { isConnected: boolean; isBlocked: boolean; isSelf: boolean };
}
const note = (cardId: string, text: string, headers: Headers) => notesRoute.POST(post('/api/v1/notes', { cardId, text }, headers));
const message = (to: string, text: string, agent: string) => messagesRoute.POST(post('/api/v1/messages', { to, text }, { 'User-Agent': agent }));
const errorOf = async (res: Response) => ((await res.json()) as { error: { code: string; message: string } }).error;
const exists = async (path: string) => (await db.doc(path).get()).exists;

/** Alice — not connected to Bob — leaves a note on his named card: a letter, waiting for his answer. */
async function aliceWritesToBob(agent = WEB) {
  as('alice');
  expect((await note('walk', '謝謝你寫下這段', { 'User-Agent': agent })).status).toBe(201);
  expect((await db.doc('conversations/alice_bob').get()).get('request')).toMatchObject({ from: 'alice' });
  as('bob');
}

describe('a letter, to a build before letters', () => {
  it("reads as a connection to its recipient, whose answer through POST /messages connects the two — on iOS and Android alike", async () => {
    await aliceWritesToBob();
    for (const agent of [OLD_IOS, OLD_ANDROID]) expect((await profile('alice', agent)).isConnected).toBe(true);
    // Everyone else is told how things stand: not connected.
    for (const agent of [NEW_IOS, NEW_ANDROID, WEB]) expect((await profile('alice', agent)).isConnected).toBe(false);

    // The thread and its composer open; the reply goes as the old app sends it.
    const res = await message('alice', '也謝謝你', OLD_ANDROID);
    expect(res.status).toBe(201);
    expect(await exists('connections/alice_bob')).toBe(true);
    expect((await db.doc('conversations/alice_bob').get()).get('request')).toBeUndefined();
    expect(await exists('letters/alice_bob')).toBe(false);
    // Connected now for everyone, the shim no longer needed.
    for (const agent of [OLD_IOS, NEW_IOS, WEB]) expect((await profile('alice', agent)).isConnected).toBe(true);
  });

  it("is never a connection to the letter's own writer, whose message is still refused", async () => {
    await aliceWritesToBob(OLD_IOS);
    as('alice');
    for (const agent of [OLD_IOS, OLD_ANDROID]) expect((await profile('bob', agent)).isConnected).toBe(false);
    const res = await message('bob', 'hello again', OLD_IOS);
    expect(res.status).toBe(403);
    expect(await exists('connections/alice_bob')).toBe(false);
  });

  it('is no connection across a block, either way — whichever of the profile reads asks', async () => {
    await aliceWritesToBob();
    await db.doc('users/bob/blocks/alice').set({ blockedUid: 'alice' });
    // The one block document, and the whole block list (include=links).
    expect(await profile('alice', OLD_IOS)).toMatchObject({ isConnected: false, isBlocked: true });
    expect(await profile('alice', OLD_IOS, 'cards,links')).toMatchObject({ isConnected: false, isBlocked: true });
    await db.doc('users/bob/blocks/alice').delete();
    expect((await profile('alice', OLD_IOS)).isConnected).toBe(true);

    await db.doc('users/alice/blocks/bob').set({ blockedUid: 'bob' });
    expect(await profile('alice', OLD_IOS)).toMatchObject({ isConnected: false, isBlocked: false });
    expect(await profile('alice', OLD_IOS, 'cards,links')).toMatchObject({ isConnected: false, isBlocked: false });
    // The answer would be refused anyway.
    expect((await message('alice', 'hi', OLD_IOS)).status).toBe(403);
    expect(await exists('connections/alice_bob')).toBe(false);
  });

  it('is gone with the letter: withdrawn or declined (the conversation deleted), nothing reads as connected', async () => {
    await aliceWritesToBob();
    await db.doc('conversations/alice_bob').delete();
    expect((await profile('alice', OLD_IOS)).isConnected).toBe(false);
    expect((await message('alice', 'hi', OLD_IOS)).status).toBe(403);
  });

  it("tells no one anything about an anonymous card: a note on one opens no letter, and the writer's view of its author is unchanged", async () => {
    as('alice');
    expect((await note('masked', 'who wrote this?', { 'User-Agent': OLD_IOS })).status).toBe(201);
    expect(await exists('conversations/alice_bob')).toBe(false);
    for (const agent of [OLD_IOS, OLD_ANDROID]) expect((await profile('bob', agent)).isConnected).toBe(false);
    as('bob');
    for (const agent of [OLD_IOS, OLD_ANDROID]) expect((await profile('alice', agent)).isConnected).toBe(false);

    // A letter on a card made anonymous since: its recipient may answer it (they know who wrote to them);
    // its writer, who knew whose card it was when they wrote, learns nothing more.
    await aliceWritesToBob();
    await db.doc('cards/walk').update({ anonymous: true });
    expect((await profile('alice', OLD_IOS)).isConnected).toBe(true);
    as('alice');
    expect((await profile('bob', OLD_IOS)).isConnected).toBe(false);
  });

  it("costs a build after letters nothing, and a build before them one read of the two's conversation", async () => {
    const paths = () => {
      const spy = vi.spyOn(db, 'doc');
      return () => {
        const read = spy.mock.calls.map(([path]) => String(path));
        spy.mockRestore();
        return read;
      };
    };
    // No letter: no conversation read for the web or a newer build, one for an old build — and nothing more.
    for (const agent of [WEB, NEW_IOS]) {
      const done = paths();
      await profile('carol', agent);
      expect(done().filter((p) => p.startsWith('conversations/') || p.startsWith('users/carol/blocks'))).toEqual([]);
    }
    let done = paths();
    await profile('carol', OLD_IOS);
    expect(done().filter((p) => p.startsWith('conversations/') || p.startsWith('users/carol/blocks'))).toEqual(['conversations/bob_carol']);
    // A letter waiting: their side of the block asked too.
    await aliceWritesToBob();
    done = paths();
    expect((await profile('alice', OLD_IOS)).isConnected).toBe(true);
    expect(done().filter((p) => p.startsWith('conversations/') || p.startsWith('users/alice/blocks'))).toEqual(['conversations/alice_bob', 'users/alice/blocks/bob']);
  });
});

describe('a note past the unanswered ones a writer may leave', () => {
  /** Alice leaves Bob the notes she may, then one more — as `headers` sends it. */
  async function oneTooMany(headers: Headers): Promise<Response> {
    as('alice');
    for (let i = 0; i < NOTE_REQUEST_MAX; i++) expect((await note('walk', `note ${i}`, headers)).status).toBe(201);
    return note('walk', 'one more', headers);
  }

  async function nothingWritten() {
    expect((await db.collection('notes').get()).size).toBe(NOTE_REQUEST_MAX);
    expect((await db.doc('letters/alice_bob').get()).get('count')).toBe(NOTE_REQUEST_MAX);
    expect((await db.collection('conversations/alice_bob/messages').get()).size).toBe(NOTE_REQUEST_MAX);
  }

  it('is a 403 to a build before letters, in the language its app last registered — writing nothing', async () => {
    await db.doc('devices/install-1').set({ userId: 'alice', platform: 'android', locale: 'zh-TW', token: 't', updatedAt: Timestamp.now() });
    // An older install on the other platform, in another language, says nothing about this one.
    await db.doc('devices/install-2').set({ userId: 'alice', platform: 'ios', locale: 'en', token: 'u', updatedAt: Timestamp.now() });
    const res = await oneTooMany({ 'User-Agent': OLD_ANDROID, 'Accept-Language': 'en-US' });
    expect(res.status).toBe(403);
    expect(await errorOf(res)).toEqual({ code: 'forbidden', message: zhTW.card.note.waitForReply });
    await nothingWritten();
  });

  it("takes the request's language when the app registered none (iOS sends the system's), else the profile's", async () => {
    const ios = await oneTooMany({ 'User-Agent': OLD_IOS, 'Accept-Language': 'en-US,en;q=0.9' });
    expect(await errorOf(ios)).toEqual({ code: 'forbidden', message: en.card.note.waitForReply });
    await db.doc('users/alice').update({ primaryLocale: 'zh-TW' });
    // OkHttp sends no Accept-Language.
    const android = await note('walk', 'and another', { 'User-Agent': OLD_ANDROID });
    expect(android.status).toBe(403);
    expect(await errorOf(android)).toEqual({ code: 'forbidden', message: zhTW.card.note.waitForReply });
    await nothingWritten();
  });

  it('is still the 409 for the web and every build after letters', async () => {
    const res = await oneTooMany({ 'User-Agent': WEB, 'Accept-Language': 'zh-TW' });
    expect(res.status).toBe(409);
    expect(await errorOf(res)).toEqual({ code: 'conflict', message: 'Wait for them to reply.' });
    for (const agent of [NEW_IOS, NEW_ANDROID]) {
      const again = await note('walk', 'and another', { 'User-Agent': agent });
      expect(again.status).toBe(409);
      expect((await errorOf(again)).code).toBe('conflict');
    }
    await nothingWritten();
  });

  it("leaves a build before letters' other refusals as they were", async () => {
    as('alice');
    await db.doc('users/bob/blocks/alice').set({ blockedUid: 'alice' });
    const res = await note('walk', 'hello', { 'User-Agent': OLD_IOS });
    expect(res.status).toBe(403);
    expect((await errorOf(res)).code).toBe('blocked');
  });
});

describe('an anonymous draft for connections, published from a build before letters', () => {
  const id = 'dddddddddddddddddddd';
  const publish = (headers: Headers) => publishRoute.POST(post(`/api/v1/cards/${id}/publish`, {}, headers), { params: Promise.resolve({ key: id }) });

  it("is refused (400) in words the app shows, in its language — publishing nothing, never under its author's name", async () => {
    // A web draft for connections, made anonymous by the old app's switch (the rules take that save on a draft).
    await db.doc(`cards/${id}`).set({ authorId: 'bob', thoughtCore: '安靜的夜晚', story: '...', tags: [], visibility: 'connections', anonymous: true, publishedAt: null });
    await db.doc('devices/install-1').set({ userId: 'bob', platform: 'ios', locale: 'zh-TW', token: 't', updatedAt: Timestamp.now() });
    const old = await publish({ 'User-Agent': OLD_IOS });
    expect(old.status).toBe(400);
    expect(await errorOf(old)).toEqual({ code: 'invalid_request', message: zhTW.write.publishPanel.anonymousVisibility });
    // Everyone else: the server's own words, as before.
    for (const agent of [WEB, NEW_IOS]) {
      const res = await publish({ 'User-Agent': agent });
      expect(res.status).toBe(400);
      expect(await errorOf(res)).toEqual({ code: 'invalid_request', message: 'An anonymous card is public or private.' });
    }
    const card = (await db.doc(`cards/${id}`).get()).data()!;
    expect(card).toMatchObject({ publishedAt: null, anonymous: true, visibility: 'connections' });
    expect(card.slug).toBeUndefined();
  });
});
