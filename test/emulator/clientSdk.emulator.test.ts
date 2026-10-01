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

  it("are refused by the rules where the browser mustn't write", async () => {
    const { getClientDb } = await import('@/lib/db/firestore/client/init');
    const { doc, setDoc } = await import('@/lib/db/firestore/client/sdk');
    await expect(setDoc(doc(getClientDb(), 'cards/forged'), { authorId: 'bob', thoughtCore: 'not mine' })).rejects.toMatchObject({
      code: 'permission-denied',
    });
  });
});

describe('an open thread, on the full SDK', () => {
  it('hears its messages, oldest first, at the times they were sent', async () => {
    const pairId = [me, 'bob'].sort().join('_');
    await db.doc(`conversations/${pairId}`).set({ participants: [me, 'bob'].sort(), unread: { [me]: 1, bob: 0 } });
    await db.doc(`conversations/${pairId}/messages/m1`).set({ senderId: 'bob', text: 'hello', sentAt: at('2026-09-01T08:00:00Z') });
    await db.doc(`conversations/${pairId}/messages/m2`).set({ senderId: me, text: 'hi bob', sentAt: at('2026-09-01T08:05:00Z') });

    const { listenThread, markConversationRead } = await client.messages();
    const heard = await new Promise<{ id: string; text: string; sentAt: Date }[]>((resolveHeard, reject) => {
      const stop = listenThread(
        pairId,
        (messages) => {
          stop();
          resolveHeard(messages);
        },
        reject,
      );
    });
    expect(heard.map((m) => [m.id, m.text, m.sentAt.toISOString()])).toEqual([
      ['m1', 'hello', '2026-09-01T08:00:00.000Z'],
      ['m2', 'hi bob', '2026-09-01T08:05:00.000Z'],
    ]);

    // Reading it is a Lite write the rules allow (the viewer's own unread count only).
    await markConversationRead(pairId);
    expect((await db.doc(`conversations/${pairId}`).get()).get(`unread.${me}`)).toBe(0);
  });
});
