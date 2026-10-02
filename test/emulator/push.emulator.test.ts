import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, Timestamp, type Firestore } from 'firebase-admin/firestore';
import type { BatchResponse, MulticastMessage } from 'firebase-admin/messaging';
import { sendMessage, sendNote } from '@/lib/api/v1/conversations';
import { acceptInvite } from '@/lib/api/v1/invites';
import { MAX_DEVICES, registerDevice, unregisterDevice } from '@/lib/push/devices';
import { MULTICAST_MAX, pushNotification, type PushSender } from '@/lib/push/send';

// Push against the Firestore emulator with a fake FCM: the device registry,
// what a push says and where it leads, and that it rings once, never across a
// block, and forgets tokens FCM has given up on.

const PROJECT = 'demo-resonance-push';
let app: App;
let db: Firestore;

beforeAll(() => {
  process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
  app = initializeApp({ projectId: PROJECT }, 'push-test');
  db = getFirestore(app);
});

afterAll(async () => {
  await deleteApp(app);
});

beforeEach(async () => {
  await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, {
    method: 'DELETE',
  });
  await Promise.all([
    db.doc('users/alice').set({ handle: '小明', handleLower: '小明' }),
    db.doc('users/bob').set({ handle: 'bob', handleLower: 'bob' }),
    db.doc('users/carol').set({ handle: 'carol', handleLower: 'carol' }),
    db.doc('cards/walk').set({
      authorId: 'bob', thoughtCore: 'A walk', story: 's', visibility: 'public', anonymous: false,
      publishedAt: Timestamp.fromDate(new Date('2026-09-01T08:00:00Z')),
    }),
  ]);
});

/** Records every multicast; tokens listed in `dead` come back unregistered. */
function fakeFcm(dead: string[] = []) {
  const sent: MulticastMessage[] = [];
  const sender: PushSender = {
    async sendEachForMulticast(message) {
      sent.push(message);
      const responses = message.tokens.map((t) =>
        dead.includes(t)
          ? { success: false, error: { code: 'messaging/registration-token-not-registered' } }
          : { success: true, messageId: `m-${t}` },
      ) as BatchResponse['responses'];
      const successCount = responses.filter((r) => r.success).length;
      return { responses, successCount, failureCount: responses.length - successCount };
    },
  };
  return { sender, sent };
}

const exists = async (path: string) => (await db.doc(path).get()).exists;

describe('the device registry', () => {
  it('keys a device by its install, so signing in as someone else moves it to them', async () => {
    await registerDevice(db, 'alice', 'install-0001', { token: 't1', platform: 'ios', locale: 'zh-Hant-TW', appVersion: '1.0' });
    expect((await db.doc('devices/install-0001').get()).data()).toMatchObject({ userId: 'alice', token: 't1', platform: 'ios', locale: 'zh-TW' });

    await registerDevice(db, 'bob', 'install-0001', { token: 't1', platform: 'ios', locale: 'en' });
    expect((await db.doc('devices/install-0001').get()).get('userId')).toBe('bob');

    // Alice's late sign-out must not take the phone from Bob.
    await unregisterDevice(db, 'alice', 'install-0001');
    expect(await exists('devices/install-0001')).toBe(true);
    await unregisterDevice(db, 'bob', 'install-0001');
    expect(await exists('devices/install-0001')).toBe(false);
  });

  it(`keeps an account's ${MAX_DEVICES} most recently registered installs, forgetting older ones`, async () => {
    for (let i = 0; i < MAX_DEVICES + 3; i++) {
      await registerDevice(db, 'alice', `install-${String(i).padStart(4, '0')}`, { token: `t${i}`, platform: 'android', locale: 'en' });
    }
    await registerDevice(db, 'bob', 'install-bob', { token: 'tb', platform: 'ios', locale: 'en' });
    const alice = await db.collection('devices').where('userId', '==', 'alice').get();
    expect(alice.size).toBe(MAX_DEVICES);
    // The first three registered are the ones gone; someone else's devices are untouched.
    expect(await exists('devices/install-0000')).toBe(false);
    expect(await exists('devices/install-0002')).toBe(false);
    expect(await exists('devices/install-0003')).toBe(true);
    expect(await exists(`devices/install-${String(MAX_DEVICES + 2).padStart(4, '0')}`)).toBe(true);
    expect(await exists('devices/install-bob')).toBe(true);
  });
});

describe('pushNotification', () => {
  beforeEach(async () => {
    await registerDevice(db, 'bob', 'bob-iphone', { token: 'bob-zh', platform: 'ios', locale: 'zh-TW' });
    await registerDevice(db, 'bob', 'bob-pixel', { token: 'bob-en', platform: 'android', locale: 'en-US' });
    await registerDevice(db, 'carol', 'carol-phone', { token: 'carol', platform: 'android', locale: 'en' });
  });

  it("pushes a note to the author's devices, each in its app's language, opening the reply", async () => {
    const { id, notificationId } = await sendNote(db, 'alice', { cardId: 'walk', text: '雨後的散步' });
    const fcm = fakeFcm();
    expect(await pushNotification(db, notificationId, fcm.sender)).toEqual({ sent: 2, pruned: 0 });

    const byToken = Object.fromEntries(fcm.sent.map((m) => [m.tokens.join(), m]));
    expect(Object.keys(byToken).sort()).toEqual(['bob-en', 'bob-zh']);
    expect(byToken['bob-zh'].notification).toEqual({ title: '小明 寄來一張小紙條', body: '「雨後的散步」' });
    expect(byToken['bob-en'].notification).toEqual({ title: '小明 sent you a little note', body: '「雨後的散步」' });
    expect(byToken['bob-en'].data).toEqual({
      notificationId,
      type: 'note',
      route: `/messages/${encodeURIComponent('小明')}?note=${id}&card=walk`,
      // The apps open the thread by uid (the pen name in the route may have changed by the tap).
      fromUserId: 'alice',
    });
    expect(byToken['bob-en'].android?.notification?.channelId).toBe('activity');
    expect((await db.doc(`notifications/${notificationId}`).get()).get('pushedAt')).toBeInstanceOf(Timestamp);
  });

  it('rings once, however often it is asked', async () => {
    const { notificationId } = await sendNote(db, 'alice', { cardId: 'walk', text: 'hi' });
    const fcm = fakeFcm();
    const results = await Promise.all([1, 2, 3].map(() => pushNotification(db, notificationId, fcm.sender)));
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(fcm.sent).toHaveLength(2); // one multicast per language, once
  });

  it("stays silent when a block went up after the bell rang, and for a row that's already read", async () => {
    const { notificationId } = await sendNote(db, 'alice', { cardId: 'walk', text: 'hi' });
    await db.doc('users/bob/blocks/alice').set({ blockedUid: 'alice' });
    const fcm = fakeFcm();
    expect(await pushNotification(db, notificationId, fcm.sender)).toBeNull();

    await db.doc('notifications/read').set({ userId: 'bob', type: 'resonance', payload: { fromUserId: 'carol', fromHandle: 'carol', cardId: 'walk' }, readAt: Timestamp.now() });
    expect(await pushNotification(db, 'read', fcm.sender)).toBeNull();
    expect(fcm.sent).toHaveLength(0);
  });

  it('forgets the devices FCM no longer knows', async () => {
    await db.doc('connections/alice_bob').set({ userIds: ['alice', 'bob'], establishedAt: Timestamp.now() });
    const { notificationId } = await sendMessage(db, 'alice', { to: 'bob', text: '嗨' });
    const fcm = fakeFcm(['bob-zh']);
    expect(await pushNotification(db, notificationId!, fcm.sender)).toEqual({ sent: 1, pruned: 1 });
    expect(fcm.sent.find((m) => m.tokens[0] === 'bob-en')?.data).toEqual({
      notificationId,
      type: 'message',
      route: `/messages/${encodeURIComponent('小明')}`,
      fromUserId: 'alice',
    });
    expect(await exists('devices/bob-iphone')).toBe(false);
    expect(await exists('devices/bob-pixel')).toBe(true);
    expect(await exists('devices/carol-phone')).toBe(true);
  });

  it("puts only the records' words on a lock screen: the sender's real pen name, and a real note's text", async () => {
    // A row forged to look official, pointing at a note that isn't the sender's.
    await db.doc('notes/theirs').set({ fromUserId: 'carol', toUserId: 'bob', cardId: 'walk', text: 'carol wrote this', readAt: null });
    await db.doc('notifications/forged').set({
      userId: 'bob',
      type: 'note',
      payload: { fromUserId: 'alice', fromHandle: 'Resonance 官方', preview: 'Verify your account at evil.example', noteId: 'theirs', cardId: 'walk' },
      readAt: null,
      createdAt: Timestamp.now(),
    });
    const fcm = fakeFcm();
    await pushNotification(db, 'forged', fcm.sender);
    const en = fcm.sent.find((m) => m.tokens[0] === 'bob-en')!;
    expect(en.notification).toEqual({ title: '小明 sent you a little note' });
    expect(en.data?.route).toBe(`/messages/${encodeURIComponent('小明')}?note=theirs&card=walk`);
    expect(JSON.stringify(fcm.sent)).not.toContain('evil.example');
    expect(JSON.stringify(fcm.sent)).not.toContain('Resonance 官方');
  });

  it('sends nothing, and needs no FCM, for someone with no devices', async () => {
    await db.doc('notifications/n1').set({ userId: 'alice', type: 'card_link', payload: { fromUserId: 'bob', fromHandle: 'bob', cardId: 'walk' }, readAt: null, createdAt: Timestamp.now() });
    const fcm = fakeFcm();
    expect(await pushNotification(db, 'n1', fcm.sender)).toEqual({ sent: 0, pruned: 0 });
    expect(fcm.sent).toHaveLength(0);
  });

  it(`sends at most ${MULTICAST_MAX} tokens a call, and forgets dead ones past that many`, async () => {
    // More installs than any account keeps now (registered before the cap, straight into the registry).
    const writer = db.bulkWriter();
    for (let i = 0; i < MULTICAST_MAX + 2; i++) {
      void writer.set(db.doc(`devices/many-${i}`), { userId: 'carol', token: `c${i}`, platform: 'android', locale: 'en', updatedAt: Timestamp.now() });
    }
    await writer.close();
    await db.doc('notifications/n2').set({ userId: 'carol', type: 'card_link', payload: { fromUserId: 'bob', cardId: 'walk' }, readAt: null, createdAt: Timestamp.now() });
    const fcm = fakeFcm(Array.from({ length: MULTICAST_MAX + 2 }, (_, i) => `c${i}`));
    // carol's own phone, and the 502 above (all dead).
    expect(await pushNotification(db, 'n2', fcm.sender)).toEqual({ sent: 1, pruned: MULTICAST_MAX + 2 });
    expect(fcm.sent.map((m) => m.tokens.length)).toEqual([MULTICAST_MAX, 3]);
    expect((await db.collection('devices').where('userId', '==', 'carol').get()).size).toBe(1);
  });
});

describe('an accepted legacy invite', () => {
  it("rings its sender, opening the thread with the one who accepted, under their pen name as it is now", async () => {
    await db.doc('invites/i1').set({ fromUserId: 'bob', toUserId: 'alice', status: 'pending', message: 'hi' });
    await registerDevice(db, 'bob', 'bob-pixel', { token: 'bob-en', platform: 'android', locale: 'en' });
    const { notificationId } = await acceptInvite(db, 'alice', 'i1');
    const fcm = fakeFcm();
    expect(await pushNotification(db, notificationId!, fcm.sender)).toEqual({ sent: 1, pruned: 0 });
    expect(fcm.sent[0].notification?.title).toContain('小明');
    expect(fcm.sent[0].data).toEqual({
      notificationId,
      type: 'invite_accepted',
      route: `/messages/${encodeURIComponent('小明')}`,
      fromUserId: 'alice',
    });
  });

  it('carries no sender uid on a push that opens no thread', async () => {
    await registerDevice(db, 'alice', 'alice-phone', { token: 'alice', platform: 'ios', locale: 'en' });
    await db.doc('notifications/link').set({
      userId: 'alice', type: 'card_link', payload: { fromUserId: 'bob', fromHandle: 'bob', cardId: 'walk' }, readAt: null, createdAt: Timestamp.now(),
    });
    const fcm = fakeFcm();
    await pushNotification(db, 'link', fcm.sender);
    expect(fcm.sent[0].data).toEqual({ notificationId: 'link', type: 'card_link', route: '/card/walk' });
  });
});
