import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, Timestamp, type Firestore } from 'firebase-admin/firestore';

// The browser's data layer as it runs: the real client modules on Firestore
// Lite, and an open thread's listener on the full SDK, signed in through the
// Auth emulator and held to firestore.rules. What the mocked suites can't see:
// that the two SDKs' Timestamps both become dates, that the listener loads
// and hears, and that a read made while a write is still out shows it.

const PROJECT = 'demo-resonance-client-sdk';
const firestoreHost = process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080';
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? '127.0.0.1:9099';

// What `npm run dev:emulator` gives the browser (scripts/emulator-env.mjs),
// set before the client modules are first imported (they read it on load).
Object.assign(process.env, {
  NEXT_PUBLIC_FIREBASE_EMULATOR: 'true',
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: PROJECT,
  NEXT_PUBLIC_FIREBASE_API_KEY: 'demo-key',
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: `${PROJECT}.firebaseapp.com`,
  NEXT_PUBLIC_FIREBASE_APP_ID: 'demo-app',
  NEXT_PUBLIC_EMULATOR_FIRESTORE_PORT: firestoreHost.split(':')[1],
  NEXT_PUBLIC_EMULATOR_AUTH_PORT: authHost.split(':')[1],
});

let admin: App;
let db: Firestore;
let me: string;

const client = {
  auth: () => import('@/lib/auth/firebase/client'),
  reads: () => import('@/lib/db/firestore/client/reads'),
  cards: () => import('@/lib/db/firestore/client/cards'),
  cardEdits: () => import('@/lib/db/firestore/client/cardEdits'),
  map: () => import('@/lib/db/firestore/client/thoughtMap'),
  messages: () => import('@/lib/db/firestore/client/messages'),
};

const at = (iso: string) => Timestamp.fromDate(new Date(iso));

beforeAll(async () => {
  process.env.FIRESTORE_EMULATOR_HOST = firestoreHost;
  admin = initializeApp({ projectId: PROJECT }, 'client-sdk-test');
  db = getFirestore(admin);
  const rules = readFileSync(resolve(__dirname, '../../firebase/firestore.rules'), 'utf8');
  const loaded = await fetch(`http://${firestoreHost}/emulator/v1/projects/${PROJECT}:securityRules`, {
    method: 'PUT',
    body: JSON.stringify({ rules: { files: [{ name: 'firestore.rules', content: rules }] } }),
  });
  expect(loaded.ok).toBe(true);

  const { getFirebaseClientAuth } = await client.auth();
  const { createUserWithEmailAndPassword } = await import('firebase/auth');
  const email = `reader-${Date.now()}@client-sdk.test`;
  const cred = await createUserWithEmailAndPassword(getFirebaseClientAuth(), email, 'client-sdk-test-pw');
  me = cred.user.uid;
});

afterAll(async () => {
  const { getFirebaseClientAuth } = await client.auth();
  await getFirebaseClientAuth().signOut();
  await deleteApp(admin);
});

beforeEach(async () => {
  await fetch(`http://${firestoreHost}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
  await db.doc(`users/${me}`).set({ handle: 'reader', handleLower: 'reader', initials: 'RE', joinedAt: at('2026-01-01T00:00:00Z') });
  await db.doc('users/bob').set({ handle: 'bob', handleLower: 'bob', initials: 'BO', joinedAt: at('2026-01-01T00:00:00Z') });
});

describe('reads on Lite', () => {
  it("give a card with its dates, and keep another person's private card out", async () => {
    const card = (id: string, extra: Record<string, unknown>) =>
      db.doc(`cards/${id}`).set({
        authorId: 'bob',
        slug: id,
        thoughtCore: `title ${id}`,
        story: 'a walk after the rain',
        tags: ['日常'],
        originalLocale: 'zh-TW',
        translations: {},
        visibility: 'public',
        anonymous: false,
        publishedAt: at('2026-09-01T08:00:00Z'),
        readCount: 0,
        resonanceCount: 0,
        inviteCount: 0,
        ...extra,
      });
    await Promise.all([card('walk', {}), card('diary', { visibility: 'private' })]);

    const { getCardById } = await client.reads();
    const walk = await getCardById('walk');
    expect(walk).toMatchObject({ id: 'walk', authorId: 'bob', story: 'a walk after the rain' });
    expect(walk?.publishedAt).toBeInstanceOf(Date);
    expect(walk?.publishedAt?.toISOString()).toBe('2026-09-01T08:00:00.000Z');
    expect(await getCardById('diary')).toBeNull();
  });
});

describe('writes on Lite', () => {
  it("are what the author's next read shows, even before the write is awaited", async () => {
    const { createCardDraft, updateCardDraft } = await client.cards();
    const { getCardsByAuthor } = await client.reads();
    const draft = await createCardDraft({
      thoughtCore: 'still writing',
      story: 'first line',
      tags: [],
      visibility: 'public',
      originalLocale: 'zh-TW',
    });
    expect(draft.authorId).toBe(me);

    // Leaving the editor flushes the autosave without waiting; the card box reads at once.
    const saving = updateCardDraft(draft.id, { story: 'first line, then a second' });
    const drafts = await getCardsByAuthor(me, 'draft');
    expect(drafts.map((c) => [c.id, c.story])).toEqual([[draft.id, 'first line, then a second']]);
    await saving;
    expect((await db.doc(`cards/${draft.id}`).get()).get('story')).toBe('first line, then a second');
  });

  it('land in the order they were made: a card dragged twice rests where it was dropped last', async () => {
    const { addMapNode, loadMyThoughtMap, moveMapNode } = await client.map();
    await addMapNode('walk', 0, 0);
    const moves = [moveMapNode('walk', 120, 40, null), moveMapNode('walk', 360, 80, null)];
    const map = await loadMyThoughtMap();
    expect(map.nodes.map((n) => [n.cardId, n.x, n.y])).toEqual([['walk', 360, 80]]);
    await Promise.all(moves);
    expect((await db.doc(`thoughtMaps/${me}/nodes/walk`).get()).data()).toMatchObject({ x: 360, y: 80 });
  });

  // The editor saves a published card's revision into its buffer, and the
  // server applies the buffer (POST …/edits/apply): what the browser wrote
  // there, through the rules, is exactly what goes live.
  it("put a published card's revision where the server applies it", async () => {
    await db.doc('cards/live').set({
      authorId: me,
      slug: 'a-quiet-night',
      thoughtCore: 'a quiet night',
      story: 'the story readers see',
      tags: ['夜'],
      media: { type: 'image', url: 'https://cdn/old.avif', label: 'old' },
      accentHue: 55,
      originalLocale: 'zh-TW',
      translations: {},
      visibility: 'public',
      anonymous: false,
      publishedAt: at('2026-09-01T08:00:00Z'),
      readCount: 3,
      resonanceCount: 0,
      inviteCount: 0,
    });
    const { savePendingCardEdit } = await client.cardEdits();
    // The cover removed (undefined, which the browser leaves out), the
    // visibility and byline the update panel chose.
    await savePendingCardEdit('live', {
      thoughtCore: 'a quieter night',
      story: 'the revision',
      tags: ['夜', '雨'],
      visibility: 'private',
      anonymous: true,
      media: undefined,
      accentHue: null,
    });
    expect((await db.doc('cards/live').get()).get('story')).toBe('the story readers see');

    const { applyCardEdit } = await import('@/lib/api/v1/edits');
    await expect(applyCardEdit(db, me, 'live')).resolves.toMatchObject({ slug: 'a-quiet-night', applied: true });
    const card = (await db.doc('cards/live').get()).data()!;
    expect(card).toMatchObject({
      thoughtCore: 'a quieter night',
      story: 'the revision',
      tags: ['夜', '雨'],
      visibility: 'private',
      anonymous: true,
      accentHue: null,
      slug: 'a-quiet-night',
      readCount: 3,
    });
    expect(card.media).toBeUndefined();
    expect((card.publishedAt as Timestamp).toDate().toISOString()).toBe('2026-09-01T08:00:00.000Z');
    expect((await db.doc('cards/live/edits/current').get()).exists).toBe(false);
  });

  it("are refused by the rules where the browser mustn't write", async () => {
    const { getClientDb } = await import('@/lib/db/firestore/client/init');
    const { doc, setDoc } = await import('@/lib/db/firestore/client/sdk');
    await expect(setDoc(doc(getClientDb(), 'cards/forged'), { authorId: 'bob', thoughtCore: 'not mine' })).rejects.toMatchObject({
      code: 'permission-denied',
    });
  });
});

describe('an open thread, on the full SDK', () => {
  it('hears its newest messages at the times they were sent', async () => {
    const pairId = [me, 'bob'].sort().join('_');
    await db.doc(`conversations/${pairId}`).set({ participants: [me, 'bob'].sort(), unread: { [me]: 1, bob: 0 } });
    await db.doc(`conversations/${pairId}/messages/m1`).set({ senderId: 'bob', text: 'hello', sentAt: at('2026-09-01T08:00:00Z') });
    await db.doc(`conversations/${pairId}/messages/m2`).set({ senderId: me, text: 'hi bob', sentAt: at('2026-09-01T08:05:00Z') });

    const { listenThread, markConversationRead } = await client.messages();
    const heard = await new Promise<{ id: string; text: string; sentAt: Date }[]>((resolveHeard, reject) => {
      const stop = listenThread(
        pairId,
        (window) => {
          if (window.fromCache) return;
          stop();
          resolveHeard(window.entries.map((e) => e.message));
        },
        reject,
      );
    });
    expect(heard.map((m) => [m.id, m.text, m.sentAt.toISOString()])).toEqual([
      ['m2', 'hi bob', '2026-09-01T08:05:00.000Z'],
      ['m1', 'hello', '2026-09-01T08:00:00.000Z'],
    ]);

    // Reading it is a Lite write the rules allow (the viewer's own unread count only).
    await markConversationRead(pairId);
    expect((await db.doc(`conversations/${pairId}`).get()).get(`unread.${me}`)).toBe(0);
  });

  it('pages back from the oldest message the listener heard, on Lite, missing none and none twice', async () => {
    const pairId = [me, 'bob'].sort().join('_');
    await db.doc(`conversations/${pairId}`).set({ participants: [me, 'bob'].sort(), unread: {} });
    // Nine messages. Three share a millisecond (the server stamps to the microsecond), their ids in the
    // opposite order to their times — a cursor to the millisecond would lose some — and two share the very instant.
    const base = Date.parse('2026-09-01T08:00:00Z') / 1000;
    const stamps: [string, number, number][] = [
      ['a1', base, 0],
      ['a2', base + 60, 0],
      ['x3', base + 120, 1_000],
      ['x2', base + 120, 2_000],
      ['x1', base + 120, 3_000],
      ['b6', base + 180, 0],
      ['a6', base + 180, 0],
      ['a7', base + 240, 0],
      ['a8', base + 300, 0],
    ];
    for (const [id, seconds, nanos] of stamps) {
      await db.doc(`conversations/${pairId}/messages/${id}`).set({ senderId: 'bob', text: id, sentAt: new Timestamp(seconds, nanos) });
    }

    const { listenThread, getOlderMessages } = await client.messages();
    const window = await new Promise<Awaited<ReturnType<typeof getOlderMessages>>>((resolveHeard, reject) => {
      const stop = listenThread(
        pairId,
        (w) => {
          if (w.fromCache) return;
          stop();
          resolveHeard(w.entries);
        },
        reject,
        3,
      );
    });
    expect(window.map((e) => e.message.id)).toEqual(['a8', 'a7', 'b6']);

    const read = window.map((e) => e.message.id);
    let cursor = window[window.length - 1].cursor;
    for (let pages = 0; pages < 10; pages++) {
      const page = await getOlderMessages(pairId, cursor, 2);
      read.push(...page.map((e) => e.message.id));
      if (page.length < 2) break;
      cursor = page[page.length - 1].cursor;
    }
    // Newest first: by the send time to the microsecond, then by id (descending) within one instant.
    expect(read).toEqual(['a8', 'a7', 'b6', 'a6', 'x1', 'x2', 'x3', 'a2', 'a1']);
  });

  it("keeps someone else's conversation out of a page read", async () => {
    await db.doc('conversations/bob_carol').set({ participants: ['bob', 'carol'], unread: {} });
    await db.doc('conversations/bob_carol/messages/m1').set({ senderId: 'bob', text: 'private', sentAt: at('2026-09-01T08:00:00Z') });
    const { getOlderMessages } = await client.messages();
    await expect(getOlderMessages('bob_carol', { seconds: 2_000_000_000, nanoseconds: 0, id: 'zz' }, 10)).rejects.toMatchObject({
      code: 'permission-denied',
    });
  });
});
