import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, Timestamp, type Firestore } from 'firebase-admin/firestore';
import type { BatchResponse, MulticastMessage } from 'firebase-admin/messaging';
import { sendMessage, sendNote } from '@/lib/api/v1/conversations';
import { acceptInvite } from '@/lib/api/v1/invites';
import { PUSH_BODY_CHARS, pushMessage } from '@/lib/push/chat';
import { MAX_DEVICES, registerDevice, unregisterDevice } from '@/lib/push/devices';
import { MESSAGES_CHANNEL, MULTICAST_MAX, pushNotification, type PushSender } from '@/lib/push/send';

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
    // A note on an anonymous card stays out of the thread: its bell row is what rings.
    db.doc('cards/masked').set({
      authorId: 'bob', thoughtCore: 'Unsigned', story: 's', visibility: 'public', anonymous: true,
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

  it('keeps what a build says it can do with a push, tidied: unique, well-formed, at most eight', async () => {
    await registerDevice(db, 'alice', 'install-caps', { token: 't', platform: 'android', locale: 'en', capabilities: ['chat-push', 'chat-push', 'Not Valid', 'x'.repeat(33), 'future-thing'] });
    expect((await db.doc('devices/install-caps').get()).get('capabilities')).toEqual(['chat-push', 'future-thing']);
    await registerDevice(db, 'alice', 'install-many', { token: 't', platform: 'android', capabilities: Array.from({ length: 12 }, (_, i) => `cap-${i}`) });
    expect((await db.doc('devices/install-many').get()).get('capabilities')).toHaveLength(8);
    // An older build says nothing; a later registration without it clears what was there.
    await registerDevice(db, 'alice', 'install-caps', { token: 't', platform: 'android', locale: 'en' });
    expect((await db.doc('devices/install-caps').get()).get('capabilities')).toEqual([]);
    await registerDevice(db, 'alice', 'install-null', { token: 't', platform: 'ios', capabilities: null });
    expect((await db.doc('devices/install-null').get()).get('capabilities')).toEqual([]);
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

  // Opening the writer's thread would zero the author's unread count there —
  // which the writer can watch — and invite a reply under the author's name.
  it("pushes a note on an anonymous card to the author's devices, each in its app's language, opening the card — never the writer's thread", async () => {
    const { notificationId, push } = await sendNote(db, 'alice', { cardId: 'masked', text: '雨後的散步' });
    expect(push).toBeNull();
    const fcm = fakeFcm();
    expect(await pushNotification(db, notificationId!, fcm.sender)).toEqual({ sent: 2, pruned: 0 });

    const byToken = Object.fromEntries(fcm.sent.map((m) => [m.tokens.join(), m]));
    expect(Object.keys(byToken).sort()).toEqual(['bob-en', 'bob-zh']);
    expect(byToken['bob-zh'].notification).toEqual({ title: '小明 寄來一張小紙條', body: '「雨後的散步」' });
    expect(byToken['bob-en'].notification).toEqual({ title: '小明 sent you a little note', body: '「雨後的散步」' });
    // No sender's uid either: nothing here opens a conversation with her.
    expect(byToken['bob-en'].data).toEqual({ notificationId, type: 'note', route: '/card/masked' });
    expect(byToken['bob-en'].android?.notification?.channelId).toBe('activity');
    expect((await db.doc(`notifications/${notificationId}`).get()).get('pushedAt')).toBeInstanceOf(Timestamp);
  });

  it('opens the card for a resonance on an anonymous card too; a named one opens the thread as before', async () => {
    await db.doc('cards/aliceAnswer').set({
      authorId: 'alice', thoughtCore: 'An answer', story: 's', visibility: 'public', anonymous: false,
      publishedAt: Timestamp.fromDate(new Date('2026-09-02T08:00:00Z')),
    });
    const { resonateWith } = await import('@/lib/api/v1/resonate');
    const { notificationId } = await resonateWith(db, 'alice', 'masked', 'aliceAnswer');
    const fcm = fakeFcm();
    await pushNotification(db, notificationId!, fcm.sender);
    expect(fcm.sent.find((m) => m.tokens[0] === 'bob-en')!.data).toEqual({ notificationId, type: 'resonance', route: '/card/masked' });

    await db.doc('notifications/named').set({
      userId: 'bob', type: 'resonance', payload: { fromUserId: 'alice', fromHandle: 'alice', cardId: 'walk' }, readAt: null, createdAt: Timestamp.now(),
    });
    const named = fakeFcm();
    await pushNotification(db, 'named', named.sender);
    expect(named.sent.find((m) => m.tokens[0] === 'bob-en')!.data).toEqual({
      notificationId: 'named', type: 'resonance', route: `/messages/${encodeURIComponent('小明')}`, fromUserId: 'alice',
    });
  });

  it('rings once, however often it is asked', async () => {
    const { notificationId } = await sendNote(db, 'alice', { cardId: 'masked', text: 'hi' });
    const fcm = fakeFcm();
    const results = await Promise.all([1, 2, 3].map(() => pushNotification(db, notificationId!, fcm.sender)));
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(fcm.sent).toHaveLength(2); // one multicast per language, once
  });

  it("stays silent when a block went up after the bell rang, and for a row that's already read", async () => {
    const { notificationId } = await sendNote(db, 'alice', { cardId: 'masked', text: 'hi' });
    await db.doc('users/bob/blocks/alice').set({ blockedUid: 'alice' });
    const fcm = fakeFcm();
    expect(await pushNotification(db, notificationId!, fcm.sender)).toBeNull();

    await db.doc('notifications/read').set({ userId: 'bob', type: 'resonance', payload: { fromUserId: 'carol', fromHandle: 'carol', cardId: 'walk' }, readAt: Timestamp.now() });
    expect(await pushNotification(db, 'read', fcm.sender)).toBeNull();
    expect(fcm.sent).toHaveLength(0);
  });

  it('forgets the devices FCM no longer knows', async () => {
    // A message bell as an older server wrote it (it had no `pushedAt`): still pushed, once.
    await db.doc('notifications/old-message').set({
      userId: 'bob', type: 'message', payload: { fromUserId: 'alice', fromHandle: 'alice' }, readAt: null, createdAt: Timestamp.now(),
    });
    const fcm = fakeFcm(['bob-zh']);
    expect(await pushNotification(db, 'old-message', fcm.sender)).toEqual({ sent: 1, pruned: 1 });
    expect(fcm.sent.find((m) => m.tokens[0] === 'bob-en')?.data).toEqual({
      notificationId: 'old-message',
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
    await db.doc('invites/i1').set({ fromUserId: 'bob', toUserId: 'alice', status: 'pending', message: 'hi', expiresAt: Timestamp.fromDate(new Date(Date.now() + 86_400_000)) });
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

describe('pushMessage', () => {
  /** Every token that was sent to, with the message it got. */
  const deliveries = (sent: MulticastMessage[]) => Object.fromEntries(sent.flatMap((m) => m.tokens.map((t) => [t, m] as const)));
  const route = `/messages/${encodeURIComponent('小明')}`;

  beforeEach(async () => {
    await db.doc('connections/alice_bob').set({ userIds: ['alice', 'bob'], establishedAt: Timestamp.now() });
    // Bob has five installs: two of the new Android build (one per language), an older Android build, and two iPhones.
    await registerDevice(db, 'bob', 'bob-pixel-zh', { token: 'pixel-zh', platform: 'android', locale: 'zh-TW', capabilities: ['chat-push'] });
    await registerDevice(db, 'bob', 'bob-pixel-en', { token: 'pixel-en', platform: 'android', locale: 'en', capabilities: ['chat-push'] });
    await registerDevice(db, 'bob', 'bob-old-android', { token: 'old-en', platform: 'android', locale: 'en' });
    await registerDevice(db, 'bob', 'bob-iphone', { token: 'iphone-zh', platform: 'ios', locale: 'zh-TW' });
    await registerDevice(db, 'bob', 'bob-ipad', { token: 'ipad-en', platform: 'ios', locale: 'en', capabilities: ['chat-push'] });
  });

  const send = (text: string, extra: Record<string, unknown> = {}) =>
    sendMessage(db, 'alice', { to: 'bob', text, ...extra }).then((sent) => sent.push!);

  it("gives a build that draws its own notification the message as data, and every other device a notification the system shows", async () => {
    const push = await send('明天一起去散步嗎？');
    const fcm = fakeFcm();
    expect(await pushMessage(db, push, fcm.sender)).toEqual({ sent: 5, pruned: 0 });

    const at = deliveries(fcm.sent);
    expect(Object.keys(at).sort()).toEqual(['ipad-en', 'iphone-zh', 'old-en', 'pixel-en', 'pixel-zh']);
    const sentAt = String((await db.doc(`conversations/alice_bob/messages/${push.messageId}`).get()).get('sentAt').toMillis());

    // The new Android build: data only, high priority, no notification of its own, everything its notification needs.
    for (const token of ['pixel-zh', 'pixel-en']) {
      expect(at[token]).toEqual({
        tokens: [token],
        data: {
          type: 'message',
          conversationId: 'alice_bob',
          messageId: push.messageId,
          fromUserId: 'alice',
          toUserId: 'bob',
          fromHandle: '小明',
          title: '小明',
          body: '明天一起去散步嗎？',
          route,
          sentAt,
        },
        android: { priority: 'high' },
      });
      expect(at[token].notification).toBeUndefined();
    }

    // Everyone else: the pen name and the words as the notification, a conversation replacing its own on Android and grouped on iOS.
    for (const token of ['old-en', 'iphone-zh', 'ipad-en']) {
      // (Devices that read the same words share a multicast: `tokens` is theirs together.)
      const { tokens, ...rest } = at[token];
      expect(tokens).toContain(token);
      expect(rest).toEqual({
        notification: { title: '小明', body: '明天一起去散步嗎？' },
        data: { type: 'message', route, fromUserId: 'alice', conversationId: 'alice_bob', messageId: push.messageId },
        android: { priority: 'high', notification: { channelId: MESSAGES_CHANNEL, tag: 'alice_bob' } },
        apns: { payload: { aps: { sound: 'default', threadId: 'alice_bob' } } },
      });
    }
    expect(MESSAGES_CHANNEL).toBe('messages');
  });

  it('sends one multicast for each language and kind of device', async () => {
    const fcm = fakeFcm();
    await pushMessage(db, await send('hi'), fcm.sender);
    const groups = fcm.sent.map((m) => [m.tokens.slice().sort().join('+'), m.notification ? 'notification' : 'data']).sort();
    expect(groups).toEqual([
      ['ipad-en+old-en', 'notification'],
      ['iphone-zh', 'notification'],
      ['pixel-en', 'data'],
      ['pixel-zh', 'data'],
    ]);
  });

  it('says "shared a card" in the device\'s own language for a message that is only a card', async () => {
    const push = await send('', { cardRef: 'walk' });
    const fcm = fakeFcm();
    await pushMessage(db, push, fcm.sender);
    const at = deliveries(fcm.sent);
    expect(at['pixel-zh'].data?.body).toBe('分享了一張卡片');
    expect(at['pixel-en'].data?.body).toBe('Shared a card');
    expect(at['iphone-zh'].notification?.body).toBe('分享了一張卡片');
    expect(at['old-en'].notification?.body).toBe('Shared a card');
  });

  it(`carries at most ${PUSH_BODY_CHARS} characters of the message, never cutting through an emoji`, async () => {
    const fcm = fakeFcm();
    await pushMessage(db, await send('🌧️'.repeat(150)), fcm.sender);
    const body = deliveries(fcm.sent)['pixel-en'].data!.body;
    expect(Array.from(body)).toHaveLength(PUSH_BODY_CHARS);
    expect(body.endsWith('🌧') || body.endsWith('️')).toBe(true);

    const trimmed = fakeFcm();
    await pushMessage(db, await send('   spaces around   '), trimmed.sender);
    expect(deliveries(trimmed.sent)['pixel-en'].data!.body).toBe('spaces around');
  });

  it("takes the words from the records: the sender's pen name as it is now, and the stored message", async () => {
    const push = await send('the real words');
    await db.doc('users/alice').set({ handle: 'renamed', handleLower: 'renamed' });
    const fcm = fakeFcm();
    await pushMessage(db, { ...push, from: 'alice' }, fcm.sender);
    const at = deliveries(fcm.sent);
    expect(at['pixel-en'].data).toMatchObject({ title: 'renamed', fromHandle: 'renamed', body: 'the real words', route: '/messages/renamed' });
    expect(at['old-en'].notification).toEqual({ title: 'renamed', body: 'the real words' });
  });

  it('rings for every message of a conversation, and the first one only through here, never twice', async () => {
    const first = await send('one');
    // The first message also wrote a bell row; it is marked pushed, so the bell's own push has nothing to say.
    const [bell] = (await db.collection('notifications').where('userId', '==', 'bob').get()).docs;
    expect(bell.get('type')).toBe('message');
    expect(bell.get('pushedAt')).toBeInstanceOf(Timestamp);
    const fcm = fakeFcm();
    expect(await pushNotification(db, bell.id, fcm.sender)).toBeNull();
    expect(fcm.sent).toHaveLength(0);

    await pushMessage(db, first, fcm.sender);
    await pushMessage(db, await send('two'), fcm.sender);
    await pushMessage(db, await send('three'), fcm.sender);
    expect(fcm.sent.filter((m) => m.tokens.includes('iphone-zh')).map((m) => m.notification?.body)).toEqual(['one', 'two', 'three']);
  });

  it('stays silent across a block, in either direction, and for a connection the recipient muted', async () => {
    const push = await send('hello');
    const fcm = fakeFcm();

    await db.doc('users/bob/blocks/alice').set({ blockedUid: 'alice' });
    expect(await pushMessage(db, push, fcm.sender)).toBeNull();
    await db.doc('users/bob/blocks/alice').delete();

    await db.doc('users/alice/blocks/bob').set({ blockedUid: 'bob' });
    expect(await pushMessage(db, push, fcm.sender)).toBeNull();
    await db.doc('users/alice/blocks/bob').delete();

    await db.doc('connections/alice_bob').update({ muted: [{ by: 'bob' }] });
    expect(await pushMessage(db, push, fcm.sender)).toBeNull();
    expect(fcm.sent).toHaveLength(0);
  });

  it("rings when only the sender muted the connection, or the mute is not one we know", async () => {
    const push = await send('hello');
    for (const muted of [[{ by: 'alice' }], [], true, null, [{ by: 7 }, 'bob', null]]) {
      await db.doc('connections/alice_bob').update({ muted });
      const fcm = fakeFcm();
      expect(await pushMessage(db, push, fcm.sender), JSON.stringify(muted)).toMatchObject({ sent: 5 });
    }
  });

  it("rings nothing for a message that isn't what the request says: another sender, a missing message, mismatched ids", async () => {
    const push = await send('hello');
    const fcm = fakeFcm();
    await db.doc('users/carol/blocks/nobody').set({});
    expect(await pushMessage(db, { ...push, from: 'carol', to: 'bob', conversationId: 'bob_carol' }, fcm.sender)).toBeNull();
    // A real message, claimed to be from someone who did not send it.
    await db.doc('conversations/bob_carol/messages/forged').set({ senderId: 'bob', text: 'x', sentAt: Timestamp.now() });
    expect(await pushMessage(db, { conversationId: 'bob_carol', messageId: 'forged', from: 'carol', to: 'bob' }, fcm.sender)).toBeNull();
    expect(await pushMessage(db, { ...push, messageId: 'nope' }, fcm.sender)).toBeNull();
    expect(await pushMessage(db, { ...push, conversationId: 'alice_carol' }, fcm.sender)).toBeNull();
    expect(await pushMessage(db, { ...push, to: 'alice' }, fcm.sender)).toBeNull();
    expect(await pushMessage(db, { ...push, messageId: '../x' }, fcm.sender)).toBeNull();
    expect(await pushMessage(db, { ...push, from: '', conversationId: '' }, fcm.sender)).toBeNull();
    expect(fcm.sent).toHaveLength(0);
  });

  describe('a note in the thread', () => {
    it("rings through here, once — its bell row says nothing more — with the note's words and its kind", async () => {
      const sent = await sendNote(db, 'alice', { cardId: 'walk', text: '謝謝你寫下這段散步' });
      const fcm = fakeFcm();
      expect(await pushNotification(db, sent.notificationId!, fcm.sender)).toBeNull();
      expect(fcm.sent).toHaveLength(0);

      expect(await pushMessage(db, sent.push!, fcm.sender)).toEqual({ sent: 5, pruned: 0 });
      const at = deliveries(fcm.sent);
      const sentAt = String((await db.doc(`conversations/alice_bob/messages/${sent.id}`).get()).get('sentAt').toMillis());
      expect(at['pixel-en'].data).toEqual({
        type: 'message',
        conversationId: 'alice_bob',
        messageId: sent.id,
        fromUserId: 'alice',
        toUserId: 'bob',
        fromHandle: '小明',
        title: '小明',
        body: '謝謝你寫下這段散步',
        route,
        sentAt,
        kind: 'note',
      });
      const { tokens, ...rest } = at['iphone-zh'];
      expect(tokens).toEqual(['iphone-zh']);
      expect(rest).toEqual({
        notification: { title: '小明', body: '謝謝你寫下這段散步' },
        data: { type: 'message', route, fromUserId: 'alice', conversationId: 'alice_bob', messageId: sent.id, kind: 'note' },
        android: { priority: 'high', notification: { channelId: MESSAGES_CHANNEL, tag: 'alice_bob' } },
        apns: { payload: { aps: { sound: 'default', threadId: 'alice_bob' } } },
      });
    });

    it('stays silent for a connection the author muted, as every message does', async () => {
      await db.doc('connections/alice_bob').update({ muted: [{ by: 'bob' }] });
      const sent = await sendNote(db, 'alice', { cardId: 'walk', text: 'hi' });
      const fcm = fakeFcm();
      expect(await pushMessage(db, sent.push!, fcm.sender)).toBeNull();
      expect(await pushNotification(db, sent.notificationId!, fcm.sender)).toBeNull();
      expect(fcm.sent).toHaveLength(0);
    });

    it('marks only a kind it knows: a plain message carries none', async () => {
      const fcm = fakeFcm();
      await pushMessage(db, await send('plain'), fcm.sender);
      await db.doc('conversations/alice_bob/messages/odd').set({ senderId: 'alice', text: 'x', sentAt: Timestamp.now(), kind: 'something-new' });
      await pushMessage(db, { conversationId: 'alice_bob', messageId: 'odd', from: 'alice', to: 'bob' }, fcm.sender);
      expect(fcm.sent.every((m) => !('kind' in (m.data ?? {})))).toBe(true);
    });

    it('leaves a note on an anonymous card to its bell row: the activity push, opening the reply', async () => {
      const sent = await sendNote(db, 'alice', { cardId: 'masked', text: '匿名卡片的紙條' });
      expect(sent.push).toBeNull();
      const fcm = fakeFcm();
      expect(await pushNotification(db, sent.notificationId!, fcm.sender)).toEqual({ sent: 5, pruned: 0 });
      const at = deliveries(fcm.sent);
      expect(at['pixel-en'].notification).toEqual({ title: '小明 sent you a little note', body: '「匿名卡片的紙條」' });
      expect(at['pixel-en'].android?.notification?.channelId).toBe('activity');
    });
  });

  it('sends nothing, and needs no FCM, for someone with no devices', async () => {
    await db.doc('connections/alice_carol').set({ userIds: ['alice', 'carol'], establishedAt: Timestamp.now() });
    const { push } = await sendMessage(db, 'alice', { to: 'carol', text: 'hi' });
    const fcm = fakeFcm();
    expect(await pushMessage(db, push!, fcm.sender)).toEqual({ sent: 0, pruned: 0 });
    expect(fcm.sent).toHaveLength(0);
  });

  it('forgets the devices FCM no longer knows, whichever kind of push they got', async () => {
    const fcm = fakeFcm(['pixel-zh', 'iphone-zh']);
    expect(await pushMessage(db, await send('hello'), fcm.sender)).toEqual({ sent: 3, pruned: 2 });
    expect(await exists('devices/bob-pixel-zh')).toBe(false);
    expect(await exists('devices/bob-iphone')).toBe(false);
    expect(await exists('devices/bob-pixel-en')).toBe(true);
    expect(await exists('devices/bob-old-android')).toBe(true);
  });

  it(`sends at most ${MULTICAST_MAX} tokens a call`, async () => {
    const writer = db.bulkWriter();
    for (let i = 0; i < MULTICAST_MAX + 2; i++) {
      void writer.set(db.doc(`devices/many-${i}`), { userId: 'dave', token: `d${i}`, platform: 'android', locale: 'en', capabilities: ['chat-push'], updatedAt: Timestamp.now() });
    }
    await writer.close();
    await db.doc('conversations/alice_dave/messages/m1').set({ senderId: 'alice', text: 'hi', sentAt: Timestamp.now() });
    const fcm = fakeFcm();
    expect(await pushMessage(db, { conversationId: 'alice_dave', messageId: 'm1', from: 'alice', to: 'dave' }, fcm.sender)).toEqual({ sent: MULTICAST_MAX + 2, pruned: 0 });
    expect(fcm.sent.map((m) => m.tokens.length)).toEqual([MULTICAST_MAX, 2]);
  });
});

describe('a letter (a note between two people not connected)', () => {
  beforeEach(async () => {
    await registerDevice(db, 'bob', 'bob-pixel', { token: 'bob-pixel', platform: 'android', locale: 'en', capabilities: ['chat-push'] });
    await registerDevice(db, 'alice', 'alice-iphone', { token: 'alice-iphone', platform: 'ios', locale: 'zh-TW' });
  });

  it("rings the card's author through the chat push with no connection between them, and the author's answer rings its writer", async () => {
    const note = await sendNote(db, 'alice', { cardId: 'walk', text: '一封寄給陌生人的紙條' });
    expect(await exists('connections/alice_bob')).toBe(false);
    const fcm = fakeFcm();
    expect(await pushMessage(db, note.push!, fcm.sender)).toEqual({ sent: 1, pruned: 0 });
    expect(fcm.sent[0].data).toMatchObject({ type: 'message', conversationId: 'alice_bob', messageId: note.id, fromUserId: 'alice', toUserId: 'bob', body: '一封寄給陌生人的紙條', kind: 'note' });

    const reply = await sendMessage(db, 'bob', { to: 'alice', text: '收到了，謝謝' });
    expect(await exists('connections/alice_bob')).toBe(true);
    expect(await pushMessage(db, reply.push!, fcm.sender)).toEqual({ sent: 1, pruned: 0 });
    expect(fcm.sent[1]).toMatchObject({
      tokens: ['alice-iphone'],
      notification: { title: 'bob', body: '收到了，謝謝' },
      data: { type: 'message', fromUserId: 'bob', conversationId: 'alice_bob', messageId: reply.id },
    });
    expect(fcm.sent[1].data).not.toHaveProperty('kind');
  });

  it('rings nothing for a fourth note left before an answer: it was never written', async () => {
    for (let i = 0; i < 3; i++) await sendNote(db, 'alice', { cardId: 'walk', text: `note ${i}` });
    await expect(sendNote(db, 'alice', { cardId: 'walk', text: 'one too many' })).rejects.toMatchObject({ code: 'conflict' });
    expect((await db.collection('conversations/alice_bob/messages').get()).size).toBe(3);
    expect((await db.collection('notifications').get()).size).toBe(3);
  });
});
