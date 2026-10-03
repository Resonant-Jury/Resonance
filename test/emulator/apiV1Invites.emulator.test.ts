import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, Timestamp, type Firestore } from 'firebase-admin/firestore';
import { ApiFailure } from '@/lib/api/v1/http';
import { acceptInvite } from '@/lib/api/v1/invites';

// Accepting a legacy invite through the v1 API against the Firestore
// emulator — what the web's acceptInvite() used to write from the browser
// under the rules (acceptsInvite, inviteAcceptedBell, blockedBetween), now
// re-checked by the server: the invite, the connection naming it, and the
// sender's bell, in one transaction.

const PROJECT = 'demo-resonance-api-invites';
let app: App;
let db: Firestore;
/** Every invite was sent open for a week (`expiresAt`); this one still is. */
const open = () => Timestamp.fromDate(new Date(Date.now() + 3 * 86_400_000));

beforeAll(() => {
  process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
  app = initializeApp({ projectId: PROJECT }, 'api-v1-invites-test');
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
    db.doc('users/alice').set({ handle: '小安', handleLower: '小安' }),
    db.doc('users/bob').set({ handle: 'bob', handleLower: 'bob' }),
    db.doc('users/carol').set({ handle: 'carol', handleLower: 'carol' }),
    // bob invited alice, a few days ago.
    db.doc('invites/i1').set({ fromUserId: 'bob', toUserId: 'alice', message: 'hi', status: 'pending', expiresAt: open(), createdAt: Timestamp.now() }),
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

const data = async (path: string) => (await db.doc(path).get()).data();
const bells = async () => (await db.collection('notifications').get()).docs.map((d) => ({ id: d.id, ...d.data() }));

describe('acceptInvite (POST /invites/{id}/accept)', () => {
  it('accepts it, connects the two naming the invite, and rings the sender under the real pen name', async () => {
    const { connectionId, notificationId } = await acceptInvite(db, 'alice', 'i1');
    expect(connectionId).toBe('alice_bob');
    expect((await data('invites/i1'))?.status).toBe('accepted');
    expect(await data('connections/alice_bob')).toMatchObject({ userIds: ['alice', 'bob'], inviteId: 'i1' });
    expect((await data('connections/alice_bob'))?.establishedAt).toBeInstanceOf(Timestamp);
    const rung = await bells();
    expect(rung).toEqual([
      expect.objectContaining({
        id: notificationId,
        userId: 'bob',
        type: 'invite_accepted',
        payload: { inviteId: 'i1', fromUserId: 'alice', fromHandle: '小安' },
        readAt: null,
      }),
    ]);
  });

  it('is harmless the second time: the same connection, and no second bell', async () => {
    await acceptInvite(db, 'alice', 'i1');
    const again = await acceptInvite(db, 'alice', 'i1');
    expect(again).toEqual({ connectionId: 'alice_bob', notificationId: null });
    expect(await bells()).toHaveLength(1);
  });

  it('keeps a connection a resonance or a note already made, as it is', async () => {
    const since = Timestamp.fromDate(new Date('2026-09-01T00:00:00Z'));
    await db.doc('connections/alice_bob').set({ userIds: ['alice', 'bob'], establishedAt: since });
    await acceptInvite(db, 'alice', 'i1');
    const conn = await data('connections/alice_bob');
    expect(conn?.inviteId).toBeUndefined();
    expect((conn?.establishedAt as Timestamp).isEqual(since)).toBe(true);
    expect((await data('invites/i1'))?.status).toBe('accepted');
  });

  for (const [blocker, blocked] of [['alice', 'bob'], ['bob', 'alice']]) {
    it(`is refused across a block (${blocker} blocked ${blocked}), writing nothing`, async () => {
      await db.doc(`users/${blocker}/blocks/${blocked}`).set({ blockedUid: blocked, createdAt: Timestamp.now() });
      expect((await failure(acceptInvite(db, 'alice', 'i1'))).code).toBe('blocked');
      expect((await data('invites/i1'))?.status).toBe('pending');
      expect(await data('connections/alice_bob')).toBeUndefined();
      expect(await bells()).toEqual([]);
    });
  }

  it("is only its recipient's to accept: the sender and a stranger find no such invite", async () => {
    expect((await failure(acceptInvite(db, 'bob', 'i1'))).code).toBe('not_found');
    expect((await failure(acceptInvite(db, 'carol', 'i1'))).code).toBe('not_found');
    expect((await failure(acceptInvite(db, 'alice', 'missing'))).code).toBe('not_found');
    expect((await data('invites/i1'))?.status).toBe('pending');
    expect(await bells()).toEqual([]);
  });

  it('refuses one no longer open — declined or withdrawn — without connecting anyone', async () => {
    for (const status of ['declined', 'withdrawn']) {
      await db.doc('invites/i1').update({ status });
      expect((await failure(acceptInvite(db, 'alice', 'i1'))).code).toBe('conflict');
    }
    expect(await data('connections/alice_bob')).toBeUndefined();
    expect(await bells()).toEqual([]);
  });

  it('needs a pen name first (the bell names its sender)', async () => {
    await db.doc('invites/i2').set({ fromUserId: 'bob', toUserId: 'dana', status: 'pending', expiresAt: open() });
    expect((await failure(acceptInvite(db, 'dana', 'i2'))).code).toBe('forbidden');
    await db.doc('users/dana').set({ initials: 'D' });
    expect((await failure(acceptInvite(db, 'dana', 'i2'))).code).toBe('forbidden');
    expect(await data('connections/bob_dana')).toBeUndefined();
  });

  it('refuses one past its date as a conflict, and closes it as expired so the inbox stops offering it', async () => {
    await db.doc('invites/i1').update({ expiresAt: Timestamp.fromDate(new Date(Date.now() - 60_000)) });
    const refused = await failure(acceptInvite(db, 'alice', 'i1'));
    expect(refused.code).toBe('conflict');
    expect(refused.message).toBe('This invite has expired.');
    expect((await data('invites/i1'))?.status).toBe('expired');
    expect(await data('connections/alice_bob')).toBeUndefined();
    expect(await bells()).toEqual([]);
    // Asked again, it is simply no longer open.
    expect((await failure(acceptInvite(db, 'alice', 'i1'))).code).toBe('conflict');
  });

  it('treats one without a date as expired: every invite we sent carried one (the old rules let a client write one without)', async () => {
    for (const expiresAt of [null, 'next week', Date.now() + 86_400_000]) {
      await db.doc('invites/i1').set({ fromUserId: 'bob', toUserId: 'alice', message: 'hi', status: 'pending', expiresAt });
      expect((await failure(acceptInvite(db, 'alice', 'i1'))).code).toBe('conflict');
      expect((await data('invites/i1'))?.status).toBe('expired');
    }
    await db.doc('invites/i1').set({ fromUserId: 'bob', toUserId: 'alice', status: 'pending' });
    expect((await failure(acceptInvite(db, 'alice', 'i1'))).code).toBe('conflict');
    expect(await data('connections/alice_bob')).toBeUndefined();
    expect(await bells()).toEqual([]);
  });

  it('leaves an accepted one accepted, whatever its date has become', async () => {
    await acceptInvite(db, 'alice', 'i1');
    await db.doc('invites/i1').update({ expiresAt: Timestamp.fromDate(new Date(Date.now() - 60_000)) });
    expect(await acceptInvite(db, 'alice', 'i1')).toEqual({ connectionId: 'alice_bob', notificationId: null });
    expect((await data('invites/i1'))?.status).toBe('accepted');
  });
});
