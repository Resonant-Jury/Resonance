import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, Timestamp, type Firestore } from 'firebase-admin/firestore';
import type { BatchResponse, MulticastMessage } from 'firebase-admin/messaging';

// "A card for tonight" against the Firestore emulator with a fake FCM: the
// switches behind /api/v1/me/notifications, the device's time zone, which
// readers are pushed and which card, what the push says (never a pen name),
// that it goes once and within its caps — and the warm-up that builds the
// picks an hour before without counting as the reader opening them.

const mocks = vi.hoisted(() => ({ db: null as Firestore | null, viewer: 'alice' }));
vi.mock('@/lib/auth', () => ({ getCurrentUser: async () => ({ id: mocks.viewer }) }));
vi.mock('@/lib/db/firestore/admin', () => ({ getAdminDb: () => mocks.db }));

const { registerDevice } = await import('@/lib/push/devices');
const { dailyWalkStart, getNotificationSettings, optedIn, updateNotificationSettings } = await import('@/lib/push/settings');
const { PICK_PUSHES, PICKS_CHANNEL, pushPick, pushPicks } = await import('@/lib/push/picks');
const { dailyRecommendations, warmRecommendations } = await import('@/lib/recommend/daily');
const { warmPicks, warmReader, ACTIVE_DAYS } = await import('@/lib/recommend/warm');
const notificationsRoute = await import('@/app/api/v1/me/notifications/route');
type PushSender = import('@/lib/push/send').PushSender;
type FunnelResult = import('@/lib/recommend/funnel').FunnelResult;

const PROJECT = 'demo-resonance-push-picks';
let app: App;
let db: Firestore;

beforeAll(() => {
  process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
  app = initializeApp({ projectId: PROJECT }, 'push-picks-test');
  db = getFirestore(app);
  mocks.db = db;
});

afterAll(async () => {
  await deleteApp(app);
});

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-10-05T12:00:00Z');
const TODAY = '2026-10-05';
const published = Timestamp.fromDate(new Date('2026-09-01T08:00:00Z'));
const item = (cardId: string, reason = `因為 ${cardId}`) => ({ cardId, channel: 'insight' as const, reason, score: 1 });
const card = (id: string, authorId: string, extra: Record<string, unknown> = {}) =>
  db.doc(`cards/${id}`).set({
    authorId,
    thoughtCore: `Title ${id}`,
    story: 'the story',
    visibility: 'public',
    anonymous: false,
    publishedAt: published,
    slug: `slug-${id}`,
    ...extra,
  });
const picks = (uid: string, ids: string[], extra: Record<string, unknown> = {}) =>
  db.doc(`recommendations/${uid}`).set({ date: '2026-10-04', items: ids.map((id) => item(id)), partial: false, ...extra });

beforeEach(async () => {
  await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, {
    method: 'DELETE',
  });
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  mocks.viewer = 'alice';
  await Promise.all([
    db.doc('users/alice').set({ handle: 'alice', handleLower: 'alice' }),
    db.doc('users/bob').set({ handle: '小明', handleLower: '小明' }),
    db.doc('users/carol').set({ handle: 'carol', handleLower: 'carol' }),
  ]);
});

/** Records every multicast; tokens listed in `dead` come back unregistered. */
function fakeFcm(dead: string[] = []) {
  const sent: MulticastMessage[] = [];
  const sender: PushSender = {
    async sendEachForMulticast(message) {
      sent.push(message);
      const responses = message.tokens.map((t) =>
        dead.includes(t) ? { success: false, error: { code: 'messaging/registration-token-not-registered' } } : { success: true, messageId: `m-${t}` },
      ) as BatchResponse['responses'];
      const successCount = responses.filter((r) => r.success).length;
      return { responses, successCount, failureCount: responses.length - successCount };
    },
  };
  return { sender, sent };
}

/** Alice turned tonight's card on, with a phone in each language. */
async function aliceOptedIn() {
  await updateNotificationSettings(db, 'alice', { picks: true });
  await registerDevice(db, 'alice', 'alice-iphone', { token: 'alice-zh', platform: 'ios', locale: 'zh-TW' });
  await registerDevice(db, 'alice', 'alice-pixel', { token: 'alice-en', platform: 'android', locale: 'en' });
  // Their app last opened yesterday (by this suite's clock).
  await Promise.all(['alice-iphone', 'alice-pixel'].map((id) => db.doc(`devices/${id}`).update({ updatedAt: Timestamp.fromMillis(NOW - DAY) })));
}

/** A reader with tonight's card on, one phone (its token is their uid) last opened yesterday, and yesterday's picks. */
async function reader(uid: string, pickIds: string[]) {
  await updateNotificationSettings(db, uid, { picks: true });
  await registerDevice(db, uid, `${uid}-phone`, { token: uid, platform: 'android', locale: 'en' });
  await db.doc(`devices/${uid}-phone`).update({ updatedAt: Timestamp.fromMillis(NOW - DAY) });
  await picks(uid, pickIds);
}

/** A clock that starts at `at` and runs in real time (a wait loop needs one that moves). */
const clockFrom = (at: number) => {
  const start = Date.now();
  return () => at + (Date.now() - start);
};

describe('notification settings', () => {
  it('are both off until turned on, and turning one on records when', async () => {
    expect(await getNotificationSettings(db, 'alice')).toEqual({ picks: false, connectionCards: false });
    // Nothing to change writes nothing.
    expect(await updateNotificationSettings(db, 'alice', { picks: false, connectionCards: null })).toEqual({ picks: false, connectionCards: false });
    expect((await db.doc('notificationSettings/alice').get()).exists).toBe(false);

    expect(await updateNotificationSettings(db, 'alice', { picks: true })).toEqual({ picks: true, connectionCards: false });
    const on = (await db.doc('notificationSettings/alice').get()).data()!;
    expect(on.picksConsentAt).toBeInstanceOf(Timestamp);
    expect(on.connectionCardsConsentAt).toBeNull();

    // Sent as it is: the consent time stands. Null leaves a switch alone.
    await new Promise((r) => setTimeout(r, 5));
    await updateNotificationSettings(db, 'alice', { picks: true, connectionCards: null });
    expect((await db.doc('notificationSettings/alice').get()).get('picksConsentAt')).toEqual(on.picksConsentAt);

    // Off keeps when they last agreed; the switch says it's off.
    expect(await updateNotificationSettings(db, 'alice', { picks: false, connectionCards: true })).toEqual({ picks: false, connectionCards: true });
    const after = (await db.doc('notificationSettings/alice').get()).data()!;
    expect(after.picksConsentAt).toEqual(on.picksConsentAt);
    expect(after.connectionCardsConsentAt).toBeInstanceOf(Timestamp);
  });

  it('GET/PATCH /api/v1/me/notifications: the viewer\'s own, never kept unchecked, nullish switches, 400 on anything else', async () => {
    const get = (headers: Record<string, string> = {}) => notificationsRoute.GET(new Request('http://localhost/api/v1/me/notifications', { headers }));
    const patch = (body: unknown) =>
      notificationsRoute.PATCH(new Request('http://localhost/api/v1/me/notifications', { method: 'PATCH', body: JSON.stringify(body) }));

    const first = await get({ 'X-Resonance-Cache': '1' });
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ picks: false, connectionCards: false });
    expect(first.headers.get('cache-control')).toBe('private, no-cache');
    const etag = first.headers.get('etag')!;
    expect((await get({ 'If-None-Match': etag })).status).toBe(304);

    const res = await patch({ picks: true, connectionCards: null });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ picks: true, connectionCards: false });
    // The change shows at once: the old answer no longer matches.
    expect((await get({ 'If-None-Match': etag })).status).toBe(200);

    expect((await patch({ picks: 'yes' })).status).toBe(400);
    expect((await patch(null)).status).toBe(400);
    mocks.viewer = 'bob';
    expect(await (await get()).json()).toEqual({ picks: false, connectionCards: false });
  });
});

describe('the device registry', () => {
  it("keeps the device's time zone when the runtime knows it, and nothing when it doesn't", async () => {
    await registerDevice(db, 'alice', 'install-tz', { token: 't', platform: 'ios', locale: 'zh-TW', timeZone: 'Asia/Taipei' });
    expect((await db.doc('devices/install-tz').get()).get('timeZone')).toBe('Asia/Taipei');
    await registerDevice(db, 'alice', 'install-tz', { token: 't', platform: 'android', timeZone: 'GMT+08:00' });
    expect((await db.doc('devices/install-tz').get()).get('timeZone')).toBeNull();
    // An older build says nothing.
    await registerDevice(db, 'alice', 'install-old', { token: 't', platform: 'android' });
    expect((await db.doc('devices/install-old').get()).get('timeZone')).toBeNull();
  });
});

describe('pushPick', () => {
  it("pushes the first pick, in each phone's language, opening the card — and never names its author", async () => {
    await aliceOptedIn();
    await Promise.all([card('c1', 'bob'), picks('alice', ['c1'])]);
    const { sender, sent } = fakeFcm();

    expect(await pushPick(db, 'alice', sender, { now: NOW })).toEqual({ outcome: 'sent', cardId: 'c1', sent: 2 });
    expect(sent).toHaveLength(2);
    const zh = sent.find((m) => m.tokens.includes('alice-zh'))!;
    const en = sent.find((m) => m.tokens.includes('alice-en'))!;
    expect(zh.notification).toEqual({ title: '今晚的一張卡片', body: 'Title c1\n因為 c1' });
    expect(en.notification).toEqual({ title: 'A card for tonight', body: 'Title c1\nA card that might resonate with you' });
    for (const m of sent) {
      expect(m.data).toEqual({ type: 'pick', cardId: 'c1', route: '/card/slug-c1' });
      expect(m.android?.notification?.channelId).toBe(PICKS_CHANNEL);
      expect(m.apns?.payload?.aps).toMatchObject({ threadId: 'picks' });
      expect(JSON.stringify(m)).not.toContain('小明');
      expect(JSON.stringify(m)).not.toContain('bob');
    }
    const log = (await db.doc(`${PICK_PUSHES}/alice`).get()).data()!;
    expect(log.recent).toEqual([{ cardId: 'c1', at: Timestamp.fromMillis(NOW) }]);
    expect(log.sentAt).toEqual([Timestamp.fromMillis(NOW)]);
  });

  it('goes once: a second run the same day, or two at once, rings no more', async () => {
    await aliceOptedIn();
    await Promise.all([card('c1', 'bob'), card('c2', 'carol'), picks('alice', ['c1', 'c2'])]);
    const { sender, sent } = fakeFcm();
    const both = await Promise.all([pushPick(db, 'alice', sender, { now: NOW }), pushPick(db, 'alice', sender, { now: NOW })]);
    expect(both.map((r) => r.outcome).sort()).toEqual(['claimed', 'sent']);
    expect(await pushPick(db, 'alice', sender, { now: NOW + 60_000 })).toEqual({ outcome: 'sent-today' });
    expect(sent).toHaveLength(2); // the one push, in two languages
    // Tomorrow, the next card — never the same one within 30 days.
    expect(await pushPick(db, 'alice', sender, { now: NOW + DAY })).toMatchObject({ outcome: 'sent', cardId: 'c2' });
    expect(await pushPick(db, 'alice', sender, { now: NOW + 2 * DAY })).toEqual({ outcome: 'no-card' });
  });

  it('sends at most three in any seven days', async () => {
    await aliceOptedIn();
    await Promise.all(['c1', 'c2', 'c3', 'c4', 'c5'].map((id) => card(id, 'bob')));
    await picks('alice', ['c1', 'c2', 'c3', 'c4', 'c5']);
    const { sender } = fakeFcm();
    const outcomes = [];
    for (let d = 0; d < 8; d++) outcomes.push((await pushPick(db, 'alice', sender, { now: NOW + d * DAY })).outcome);
    expect(outcomes).toEqual(['sent', 'sent', 'sent', 'week-cap', 'week-cap', 'week-cap', 'week-cap', 'sent']);
  });

  it("leaves a reader who opened their picks today alone — a warm build ahead of them doesn't count", async () => {
    await aliceOptedIn();
    await card('c1', 'bob');
    const { sender, sent } = fakeFcm();
    await picks('alice', ['c1'], { date: TODAY, askedOn: TODAY });
    expect(await pushPick(db, 'alice', sender, { now: NOW })).toEqual({ outcome: 'opened-today' });
    await picks('alice', ['c1'], { date: TODAY, warm: true, askedOn: '2026-10-04' });
    expect(await pushPick(db, 'alice', sender, { now: NOW })).toMatchObject({ outcome: 'sent' });
    expect(sent.length).toBeGreaterThan(0);
  });

  it("skips their own card, one they answered, and one no longer public and published — a draft answer doesn't count", async () => {
    await aliceOptedIn();
    await Promise.all([
      card('own', 'alice'),
      card('answered', 'bob'),
      db.doc('cards/myReply').set({ authorId: 'alice', thoughtCore: 'R', story: '', visibility: 'private', publishedAt: published, referenceCardId: 'answered' }),
      card('private', 'bob', { visibility: 'private' }),
      card('connections', 'bob', { visibility: 'connections' }),
      card('draft', 'bob', { publishedAt: null }),
      card('drafted', 'carol'),
      db.doc('cards/myDraftReply').set({ authorId: 'alice', thoughtCore: 'D', story: '', visibility: 'public', publishedAt: null, referenceCardId: 'drafted' }),
      picks('alice', ['own', 'answered', 'private', 'connections', 'draft', 'deleted', 'drafted']),
    ]);
    const { sender } = fakeFcm();
    expect(await pushPick(db, 'alice', sender, { now: NOW })).toMatchObject({ outcome: 'sent', cardId: 'drafted' });
  });

  it('keeps a named card from across a block, either way — never an anonymous one', async () => {
    await aliceOptedIn();
    await Promise.all([
      card('byBob', 'bob'),
      card('byCarol', 'carol'),
      card('maskedBob', 'bob', { anonymous: true }),
      db.doc('users/alice/blocks/bob').set({ blockedUid: 'bob' }),
      db.doc('users/carol/blocks/alice').set({ blockedUid: 'alice' }),
      picks('alice', ['byBob', 'byCarol', 'maskedBob']),
    ]);
    const { sender, sent } = fakeFcm();
    expect(await pushPick(db, 'alice', sender, { now: NOW })).toMatchObject({ outcome: 'sent', cardId: 'maskedBob' });
    // An anonymous card's push names no one either.
    expect(JSON.stringify(sent)).not.toMatch(/小明|bob/);
  });

  it('pushes no one who turned it off or has no device, and forgets tokens FCM gave up on', async () => {
    await card('c1', 'bob');
    await picks('alice', ['c1']);
    const { sender, sent } = fakeFcm(['alice-en']);
    expect(await pushPick(db, 'alice', sender, { now: NOW })).toEqual({ outcome: 'opted-out' });
    await updateNotificationSettings(db, 'alice', { picks: true });
    expect(await pushPick(db, 'alice', sender, { now: NOW })).toEqual({ outcome: 'no-device' });
    expect(sent).toEqual([]);
    expect((await db.doc(`${PICK_PUSHES}/alice`).get()).exists).toBe(false);

    await aliceOptedIn();
    expect(await pushPick(db, 'alice', sender, { now: NOW })).toMatchObject({ outcome: 'sent', sent: 1 });
    expect((await db.doc('devices/alice-pixel').get()).exists).toBe(false);
    expect((await db.doc('devices/alice-iphone').get()).exists).toBe(true);
  });
});

describe('pushPicks', () => {
  it('walks everyone who turned it on, a few at a time, and starts no one past its deadline', async () => {
    await aliceOptedIn();
    await updateNotificationSettings(db, 'carol', { picks: true });
    await updateNotificationSettings(db, 'bob', { connectionCards: true });
    await Promise.all([card('c1', 'bob'), picks('alice', ['c1']), picks('bob', ['c1'])]);
    const { sender, sent } = fakeFcm();
    expect(await pushPicks(db, sender, { now: NOW })).toEqual({ readers: 2, outcomes: { sent: 1, 'no-device': 1 }, deferred: 0 });
    expect(sent.flatMap((m) => m.tokens).sort()).toEqual(['alice-en', 'alice-zh']);

    const late = await pushPicks(db, sender, { now: NOW + DAY, deadline: 0, clock: () => 1 });
    expect(late).toEqual({ readers: 0, outcomes: {}, deferred: 2 });
  });

  // Review: both crons walked from the first id every day, so a run that ran
  // out of time left the same last readers out every day.
  it("leaves a different stretch of readers each day when a run hasn't time for everyone", async () => {
    const [first, second] = [dailyWalkStart(NOW), dailyWalkStart(NOW + DAY)];
    expect(first).not.toBe(second);
    // The first reader each day's walk meets: just past that day's start.
    const [ann, ben] = [`${first}0`, `${second}0`];
    await card('c1', 'carol');
    await reader(ann, ['c1']);
    await reader(ben, ['c1']);

    /** A run with time for one reader: the clock runs out as the first push goes. */
    const oneReader = async (now: number) => {
      const { sender: fcm, sent } = fakeFcm();
      let late = false;
      const sender: PushSender = { sendEachForMulticast: (m) => ((late = true), fcm.sendEachForMulticast(m)) };
      const run = await pushPicks(db, sender, { now, deadline: 1, clock: () => (late ? 1 : 0), concurrency: 1 });
      return { run, pushed: sent.flatMap((m) => m.tokens) };
    };
    expect(await oneReader(NOW)).toEqual({ run: { readers: 1, outcomes: { sent: 1 }, deferred: 1 }, pushed: [ann] });
    expect(await oneReader(NOW + DAY)).toEqual({ run: { readers: 1, outcomes: { sent: 1 }, deferred: 1 }, pushed: [ben] });
  });
});

describe('the walk over opted-in readers', () => {
  it('goes from just past its start to the end, then round to it, a page at a time, each reader once', async () => {
    for (const uid of ['a1', 'b1', 'c1', 'd1', 'e1']) await updateNotificationSettings(db, uid, { picks: true });
    await updateNotificationSettings(db, 'c2', { connectionCards: true });
    const walk = async (opts: Parameters<typeof optedIn>[2]) => {
      const pages: string[][] = [];
      for await (const page of optedIn(db, 'picks', opts)) pages.push(page);
      return pages;
    };
    expect(await walk({ from: 'c1', pageSize: 2 })).toEqual([['d1', 'e1'], ['a1', 'b1'], ['c1']]);
    // A start that is no one's id, and one past everyone.
    expect(await walk({ from: 'b5', pageSize: 10 })).toEqual([['c1', 'd1', 'e1'], ['a1', 'b1']]);
    expect(await walk({ from: 'zz', pageSize: 2 })).toEqual([['a1', 'b1'], ['c1', 'd1'], ['e1']]);
    expect(await walk({ pageSize: 3 })).toEqual([['a1', 'b1', 'c1'], ['d1', 'e1']]);
  });
});

describe('the warm-up', () => {
  const built = (ids: string[]): FunnelResult => ({ items: ids.map((id) => item(id)), partial: false });

  it("builds an active reader's stale picks as warm, which the evening's push then sends from", async () => {
    await aliceOptedIn();
    await Promise.all([card('c1', 'bob'), card('fresh', 'carol'), picks('alice', ['c1'])]);
    const build = vi.fn(async () => built(['fresh']));
    expect(await warmReader(db, 'alice', { now: NOW, build, clock: () => NOW })).toBe('built');
    expect(build).toHaveBeenCalledWith('alice', { now: expect.any(Function) });
    const stored = (await db.doc('recommendations/alice').get()).data()!;
    expect(stored).toMatchObject({ date: TODAY, warm: true });
    expect(stored.askedOn).toBeUndefined();

    const { sender } = fakeFcm();
    expect(await pushPick(db, 'alice', sender, { now: NOW + 3_600_000 })).toMatchObject({ outcome: 'sent', cardId: 'fresh' });
    // Today's picks are there: no second build.
    expect(await warmReader(db, 'alice', { now: NOW, build, clock: () => NOW })).toBe('not-tonight');
  });

  it("spends no build on a reader who won't be pushed tonight or already has today's picks", async () => {
    const build = vi.fn(async () => built(['x']));
    const warm = (now = NOW) => warmReader(db, 'alice', { now, build, clock: () => now });
    await updateNotificationSettings(db, 'alice', { picks: true });
    expect(await warm()).toBe('inactive'); // no device at all

    // Their app last registered more than 14 days ago.
    await registerDevice(db, 'alice', 'alice-pixel', { token: 'alice-en', platform: 'android', locale: 'en' });
    const registered = ((await db.doc('devices/alice-pixel').get()).get('updatedAt') as Timestamp).toMillis();
    expect(await warm(registered + (ACTIVE_DAYS + 1) * DAY)).toBe('inactive');

    const now = registered + DAY;
    const today = new Date(now).toISOString().slice(0, 10);
    await picks('alice', ['x'], { askedOn: today });
    expect(await warm(now)).toBe('opened-today');
    await picks('alice', ['x'], { date: today });
    expect(await warm(now)).toBe('fresh');
    await picks('alice', ['x']);
    await db.doc(`${PICK_PUSHES}/alice`).set({ sentAt: [Timestamp.fromMillis(now - 60_000)], recent: [] });
    expect(await warm(now)).toBe('not-tonight');
    expect(build).not.toHaveBeenCalled();
  });

  it("records the reader's own ask — on a build of theirs, or once a day when they're answered from what's stored", async () => {
    await picks('alice', ['x'], { date: TODAY, warm: true });
    const build = vi.fn(async () => built(['y']));
    const served = await dailyRecommendations(db, 'alice', { build, now: () => NOW });
    expect(served.status).toBe('fresh');
    expect(served.asked).not.toBeNull();
    await served.asked!();
    expect((await db.doc('recommendations/alice').get()).get('askedOn')).toBe(TODAY);
    expect((await dailyRecommendations(db, 'alice', { build, now: () => NOW })).asked).toBeNull();

    // Yesterday's warm picks, rebuilt on the reader's request: their ask, no longer warm.
    await picks('bob', ['x'], { warm: true });
    const stale = await dailyRecommendations(db, 'bob', { build, now: () => NOW });
    await stale.refresh!();
    expect((await db.doc('recommendations/bob').get()).data()).toMatchObject({ date: TODAY, askedOn: TODAY });
    expect((await db.doc('recommendations/bob').get()).get('warm')).toBeUndefined();
  });

  it('warms every opted-in reader who needs it, starts none past its deadline, and gives each build the run\'s end', async () => {
    await aliceOptedIn();
    await updateNotificationSettings(db, 'carol', { picks: true });
    await picks('alice', ['x']);
    const build = vi.fn(async () => built(['y']));
    const buildDeadline = NOW + 295_000;
    expect(await warmPicks(db, { build, clock: () => NOW, buildDeadline })).toEqual({ readers: 2, outcomes: { built: 1, inactive: 1 }, deferred: 0 });
    // Review: a build started at 239 s had no deadline of its own, only its LLM steps' timeouts.
    expect(build).toHaveBeenCalledWith('alice', { now: expect.any(Function), deadline: buildDeadline });
    expect(await warmPicks(db, { build, clock: () => NOW, deadline: NOW })).toEqual({ readers: 0, outcomes: {}, deferred: 2 });
    expect(build).toHaveBeenCalledTimes(1);
  });

  it("warms a different stretch of readers each day when a run hasn't time for everyone", async () => {
    const [first, second] = [dailyWalkStart(NOW), dailyWalkStart(NOW + DAY)];
    const [ann, ben] = [`${first}0`, `${second}0`];
    await reader(ann, ['x']);
    await reader(ben, ['x']);

    /** A run with time for one build: the clock runs out as the first one starts. */
    const oneBuild = async (at: number) => {
      let late = false;
      const build = vi.fn(async (_uid: string) => ((late = true), built(['y'])));
      const run = await warmPicks(db, { build, clock: () => (late ? at + 1 : at), deadline: at + 1, concurrency: 1 });
      return { run, built: build.mock.calls.map(([uid]) => uid) };
    };
    expect(await oneBuild(NOW)).toEqual({ run: { readers: 1, outcomes: { built: 1 }, deferred: 1 }, built: [ann] });
    expect(await oneBuild(NOW + DAY)).toEqual({ run: { readers: 1, outcomes: { built: 1 }, deferred: 1 }, built: [ben] });
  });

  // Review: a reader who opened the app while the warm-up was building their
  // first picks waited for that build — which records no ask — and their own
  // ask was dropped, so they were pushed that evening anyway.
  it("records the ask of a reader who opens their picks while the warm-up is building them, or after it failed", async () => {
    await aliceOptedIn();
    await card('c1', 'bob');
    let finish!: (r: FunnelResult) => void;
    const warmBuild = vi.fn(() => new Promise<FunnelResult>((resolve) => (finish = resolve)));
    const warming = warmRecommendations(db, 'alice', { build: warmBuild, now: () => NOW });
    await vi.waitFor(() => expect(warmBuild).toHaveBeenCalled());

    const own = vi.fn(async () => built(['own']));
    const opening = dailyRecommendations(db, 'alice', { build: own, now: clockFrom(NOW), budgetMs: 5_000 });
    setTimeout(() => finish(built(['c1'])), 300);
    const served = await opening;
    expect(served).toMatchObject({ items: [item('c1')], status: 'fresh' });
    expect(own).not.toHaveBeenCalled();
    expect(await warming).toBe('built');
    expect(served.asked).not.toBeNull();
    await served.asked!();
    expect((await db.doc('recommendations/alice').get()).data()).toMatchObject({ warm: true, askedOn: TODAY });
    const { sender, sent } = fakeFcm();
    expect(await pushPick(db, 'alice', sender, { now: NOW + 3_600_000 })).toEqual({ outcome: 'opened-today' });
    expect(sent).toEqual([]);

    // A warm build that fails while Bob waits: nothing to show, and his ask still goes on record.
    let fail!: () => void;
    const failing = warmRecommendations(db, 'bob', { build: () => new Promise<FunnelResult>((_, reject) => (fail = () => reject(new Error('down')))), now: () => NOW });
    await vi.waitFor(() => expect(fail).toBeDefined());
    const waiting = dailyRecommendations(db, 'bob', { build: own, now: clockFrom(NOW), budgetMs: 5_000 });
    setTimeout(() => fail(), 300);
    const empty = await waiting;
    expect(await failing).toBe('failed');
    expect(empty).toMatchObject({ items: [], status: 'stale' });
    expect(empty.asked).not.toBeNull();
    await empty.asked!();
    expect((await db.doc('recommendations/bob').get()).get('askedOn')).toBe(TODAY);
  });
});
