import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, Timestamp, type Firestore } from 'firebase-admin/firestore';
import type { BatchResponse, MulticastMessage } from 'firebase-admin/messaging';
import { CONNECTION_CARD_PUSHES, CONNECTION_CARDS_PER_DAY, announceNewCard, pushConnectionCard } from '@/lib/push/connectionCards';
import { registerDevice } from '@/lib/push/devices';
import { PICKS_CHANNEL } from '@/lib/push/picks';
import type { PushSender } from '@/lib/push/send';
import { updateNotificationSettings } from '@/lib/push/settings';

// "A new card from someone you're connected with" against the Firestore
// emulator with a fake FCM: who hears of a first publish, what the push says
// and opens, and everyone it must leave out — the muted, the blocked, those
// who didn't ask, and every card that isn't public and named when it would go.

const PROJECT = 'demo-resonance-connection-cards';
let app: App;
let db: Firestore;

beforeAll(() => {
  process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
  app = initializeApp({ projectId: PROJECT }, 'connection-cards-test');
  db = getFirestore(app);
});

afterAll(async () => {
  await deleteApp(app);
});

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-10-05T12:00:00Z');
const pair = (a: string, b: string) => (a < b ? `${a}_${b}` : `${b}_${a}`);
const connect = (a: string, b: string, extra: Record<string, unknown> = {}) =>
  db.doc(`connections/${pair(a, b)}`).set({ userIds: [a, b].sort(), establishedAt: Timestamp.now(), ...extra });
const card = (id: string, extra: Record<string, unknown> = {}) =>
  db.doc(`cards/${id}`).set({
    authorId: 'bob',
    thoughtCore: `Title ${id}`,
    story: 'the story',
    visibility: 'public',
    anonymous: false,
    publishedAt: Timestamp.fromMillis(NOW),
    slug: `slug-${id}`,
    ...extra,
  });

/** Records every multicast; `onSend` runs before each answer (to change the world mid-run). */
function fakeFcm(onSend?: () => Promise<void>) {
  const sent: MulticastMessage[] = [];
  const sender: PushSender = {
    async sendEachForMulticast(message) {
      sent.push(message);
      await onSend?.();
      const responses = message.tokens.map((t) => ({ success: true, messageId: `m-${t}` })) as BatchResponse['responses'];
      return { responses, successCount: responses.length, failureCount: 0 };
    },
  };
  return { sender, sent, tokens: () => sent.flatMap((m) => m.tokens).sort() };
}

/** A person with a pen name, a phone, and (unless `asks` is false) the switch on. */
async function person(uid: string, opts: { asks?: boolean; locale?: string } = {}) {
  await db.doc(`users/${uid}`).set({ handle: uid === 'bob' ? '小明' : uid, handleLower: uid });
  await registerDevice(db, uid, `${uid}-phone`, { token: `${uid}-token`, platform: 'android', locale: opts.locale ?? 'en' });
  if (opts.asks !== false) await updateNotificationSettings(db, uid, { connectionCards: true });
}

beforeEach(async () => {
  await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, {
    method: 'DELETE',
  });
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
  // Bob writes. Alice and Erin are connected to him and asked; Carol is
  // connected and didn't; Dave asked but isn't connected.
  await person('bob', { asks: false });
  await person('alice', { locale: 'zh-TW' });
  await person('erin');
  await person('carol', { asks: false });
  await person('dave');
  await Promise.all([connect('alice', 'bob'), connect('bob', 'erin'), connect('bob', 'carol')]);
});

describe('pushConnectionCard', () => {
  it("tells the author's connections who asked, in their language, opening the card", async () => {
    await card('walk');
    const { sender, sent, tokens } = fakeFcm();
    const run = await pushConnectionCard(db, 'walk', sender, { now: NOW });
    expect(run).toMatchObject({ recipients: 2, outcomes: { sent: 2 }, sent: 2 });
    expect(tokens()).toEqual(['alice-token', 'erin-token']);
    const zh = sent.find((m) => m.tokens.includes('alice-token'))!;
    const en = sent.find((m) => m.tokens.includes('erin-token'))!;
    expect(zh.notification).toEqual({ title: '小明 寫了一張新卡片', body: 'Title walk' });
    expect(en.notification).toEqual({ title: '小明 wrote a new card', body: 'Title walk' });
    for (const m of sent) {
      expect(m.data).toEqual({ type: 'new_card', cardId: 'walk', route: '/card/slug-walk' });
      expect(m.data).not.toHaveProperty('notificationId');
      expect(m.android?.notification?.channelId).toBe(PICKS_CHANNEL);
    }
    // No bell row: push only.
    expect((await db.collection('notifications').get()).empty).toBe(true);
    expect((await db.doc(`${CONNECTION_CARD_PUSHES}/alice`).get()).data()).toMatchObject({ day: '2026-10-05', cards: ['walk'] });
  });

  it('goes once per card, and to one person at most three times a day', async () => {
    for (const id of ['c1', 'c2', 'c3', 'c4']) await card(id);
    const { sender, tokens } = fakeFcm();
    for (const id of ['c1', 'c1', 'c2', 'c3', 'c4']) await pushConnectionCard(db, id, sender, { now: NOW });
    expect(tokens().filter((t) => t === 'alice-token')).toHaveLength(CONNECTION_CARDS_PER_DAY);
    const fourth = await pushConnectionCard(db, 'c4', sender, { now: NOW });
    expect(fourth.outcomes).toEqual({ capped: 2 });
    // A new day, a new allowance.
    await card('c5');
    expect((await pushConnectionCard(db, 'c5', sender, { now: NOW + DAY })).outcomes).toEqual({ sent: 2 });
  });

  it('skips whoever muted the author, and a block either way', async () => {
    await card('walk');
    await connect('alice', 'bob', { muted: [{ by: 'alice' }] });
    // Bob muting Erin is Bob's business: Erin still hears of Bob's card.
    await connect('bob', 'erin', { muted: [{ by: 'bob' }] });
    const { sender, tokens } = fakeFcm();
    expect((await pushConnectionCard(db, 'walk', sender, { now: NOW })).outcomes).toEqual({ muted: 1, sent: 1 });
    expect(tokens()).toEqual(['erin-token']);

    await card('walk2');
    await connect('alice', 'bob');
    await db.doc('users/alice/blocks/bob').set({ blockedUid: 'bob' });
    await db.doc('users/bob/blocks/erin').set({ blockedUid: 'erin' });
    expect((await pushConnectionCard(db, 'walk2', sender, { now: NOW })).outcomes).toEqual({ blocked: 2 });
  });

  it('announces no card that is anonymous, not public, unpublished or gone — nor one by an author without a pen name', async () => {
    const { sender, sent } = fakeFcm();
    await card('masked', { anonymous: true });
    await card('friends', { visibility: 'connections' });
    await card('mine', { visibility: 'private' });
    await card('draft', { publishedAt: null });
    for (const id of ['masked', 'friends', 'mine', 'draft', 'missing']) {
      expect(await pushConnectionCard(db, id, sender, { now: NOW }), id).toMatchObject({ skipped: 'not-announceable', recipients: 0 });
    }
    await db.doc('users/bob').set({ handle: '' });
    await card('nameless');
    expect(await pushConnectionCard(db, 'nameless', sender, { now: NOW })).toMatchObject({ skipped: 'no-pen-name' });
    expect(sent).toEqual([]);
  });

  it('reads the card again before each push: made private or anonymous since, it goes to no one else', async () => {
    await card('walk');
    const { sender, tokens } = fakeFcm(() => db.doc('cards/walk').update({ visibility: 'private' }).then(() => undefined));
    const run = await pushConnectionCard(db, 'walk', sender, { now: NOW, concurrency: 1 });
    expect(run.outcomes).toEqual({ sent: 1, gone: 1 });
    expect(tokens()).toHaveLength(1);

    await card('walk2');
    const masked = fakeFcm(() => db.doc('cards/walk2').update({ anonymous: true }).then(() => undefined));
    expect((await pushConnectionCard(db, 'walk2', masked.sender, { now: NOW, concurrency: 1 })).outcomes).toEqual({ sent: 1, gone: 1 });
  });

  it("includes a resonance, except for the author of the card it answers (their bell rings for it)", async () => {
    await db.doc('cards/aliceCard').set({ authorId: 'alice', thoughtCore: 'Original', story: '', visibility: 'public', anonymous: false, publishedAt: Timestamp.fromMillis(NOW) });
    await card('reply', { referenceCardId: 'aliceCard' });
    const { sender, tokens } = fakeFcm();
    expect(await pushConnectionCard(db, 'reply', sender, { now: NOW })).toMatchObject({ recipients: 1, outcomes: { sent: 1 } });
    expect(tokens()).toEqual(['erin-token']);
  });

  it('rings no more than its cap of connections in one publish, and says so', async () => {
    await card('walk');
    await person('frank');
    await connect('bob', 'frank');
    const { sender, tokens } = fakeFcm();
    const run = await pushConnectionCard(db, 'walk', sender, { now: NOW, fanoutMax: 2 });
    expect(tokens()).toHaveLength(run.outcomes.sent ?? 0);
    expect(run.recipients).toBeLessThanOrEqual(2);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('4 connections, announcing to the first 2'));
  });
});

describe('announceNewCard', () => {
  it('waits for the slug, then opens the card at it — and never throws into the publish', async () => {
    await card('walk', { slug: null });
    const { sender, sent } = fakeFcm();
    const slug = new Promise<string>((resolve) =>
      setTimeout(() => void db.doc('cards/walk').update({ slug: 'a-walk' }).then(() => resolve('a-walk')), 30),
    );
    await announceNewCard(db, 'walk', slug, sender);
    expect(sent.map((m) => m.data?.route)).toEqual(['/card/a-walk', '/card/a-walk']);

    const broken: PushSender = { sendEachForMulticast: async () => Promise.reject(new Error('FCM down')) };
    await card('walk2');
    await expect(announceNewCard(db, 'walk2', Promise.reject(new Error('slug failed')), broken)).resolves.toBeUndefined();
  });
});
