import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, Timestamp, type Firestore } from 'firebase-admin/firestore';
import {
  DELETION_GRACE_DAYS,
  getAccountDeletion,
  purgeAccount,
  purgeDueAccounts,
  scheduleAccountDeletion,
} from '@/lib/account/deletion';
import { exportAccountData, exportAccountJson } from '@/lib/account/export';
import { sendNote } from '@/lib/api/v1/conversations';

// Account purge against the real Firestore emulator. Alice is deleted; Bob is
// connected to her, resonated with her card, and messaged her. Everything that
// is Alice's (or only exists because of her) must go; everything that is
// Bob's own must stay.

const PROJECT = 'demo-resonance-test';
let app: App;
let db: Firestore;

beforeAll(() => {
  process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
  app = initializeApp({ projectId: PROJECT }, 'account-purge-test');
  db = getFirestore(app);
});

afterAll(async () => {
  await deleteApp(app);
});

beforeEach(async () => {
  const host = process.env.FIRESTORE_EMULATOR_HOST;
  await fetch(`http://${host}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, {
    method: 'DELETE',
  });
});

async function seedWorld() {
  const now = new Date();
  const set = (path: string, data: Record<string, unknown>) => db.doc(path).set(data);
  await Promise.all([
    set('users/alice', { handle: 'alice', handleLower: 'alice' }),
    set('users/alice/bookmarks/bob-card', { cardId: 'bob-card', createdAt: now }),
    set('users/alice/blocks/carol', { blockedUid: 'carol', createdAt: now }),
    set('users/bob', { handle: 'bob', handleLower: 'bob' }),
    set('users/bob/bookmarks/alice-card', { cardId: 'alice-card', createdAt: now }),

    set('cards/alice-card', { authorId: 'alice', thoughtCore: 'A', story: 's', visibility: 'public' }),
    set('cards/alice-card/edits/current', { story: 'draft' }),
    set('cards/alice-draft', { authorId: 'alice', thoughtCore: 'D', story: 's', visibility: 'private' }),
    set('cards/bob-card', { authorId: 'bob', thoughtCore: 'B', story: 's', visibility: 'public' }),
    // Bob's resonance card responding to Alice's — Bob's own writing, kept.
    set('cards/bob-reply', {
      authorId: 'bob',
      thoughtCore: 'R',
      story: 's',
      visibility: 'public',
      referenceCardId: 'alice-card',
    }),

    set('thoughtMaps/alice/nodes/alice-card', { cardId: 'alice-card', x: 0, y: 0 }),
    set('thoughtMaps/bob/nodes/bob-card', { cardId: 'bob-card', x: 0, y: 0 }),

    set('connections/alice_bob', { userIds: ['alice', 'bob'] }),
    set('conversations/alice_bob', { participants: ['alice', 'bob'], lastMessage: null }),
    set('conversations/alice_bob/messages/m1', { senderId: 'alice', text: 'hi' }),
    set('conversations/alice_bob/messages/m2', { senderId: 'bob', text: 'hey' }),
    set('conversations/bob_carol', { participants: ['bob', 'carol'], lastMessage: null }),

    set('invites/i1', { fromUserId: 'alice', toUserId: 'carol', status: 'pending' }),
    set('invites/i2', { fromUserId: 'carol', toUserId: 'alice', status: 'pending' }),
    set('invites/i3', { fromUserId: 'bob', toUserId: 'carol', status: 'pending' }),

    set('resonances/bob-card_alice', { cardId: 'bob-card', userId: 'alice' }),
    set('resonances/alice-card_bob', { cardId: 'alice-card', userId: 'bob' }),
    set('resonances/bob-card_carol', { cardId: 'bob-card', userId: 'carol' }),

    set('notes/n1', { fromUserId: 'alice', toUserId: 'bob', text: 'x' }),
    set('notes/n2', { fromUserId: 'bob', toUserId: 'alice', text: 'y' }),
    set('notes/n3', { fromUserId: 'bob', toUserId: 'carol', text: 'z' }),

    set('cardLinks/bob-card_alice-card', { sourceAuthorId: 'bob', targetAuthorId: 'alice' }),
    set('cardLinks/alice-card_bob-card', { sourceAuthorId: 'alice', targetAuthorId: 'bob' }),

    set('notifications/to-alice', { userId: 'alice', type: 'note', payload: { fromUserId: 'bob' } }),
    set('notifications/from-alice', { userId: 'bob', type: 'resonance', payload: { fromUserId: 'alice' } }),
    set('notifications/bob-own', { userId: 'bob', type: 'note', payload: { fromUserId: 'carol' } }),

    set('quotas/alice_2026-09-27', { userId: 'alice', inviteCount: 1 }),
    set('cardVectors/alice-card__insight', { cardId: 'alice-card', authorId: 'alice' }),
    set('cardVectors/bob-card__insight', { cardId: 'bob-card', authorId: 'bob' }),
    set('userProfiles/alice', { centroid: [1, 2] }),
    set('recommendations/alice', { items: [] }),
    set('reports/r1', { reporterId: 'alice', targetUserId: 'carol' }),
    set('reports/r2', { reporterId: 'carol', targetUserId: 'alice' }),
    set('devices/alice-phone-1', { userId: 'alice', token: 't1', platform: 'ios', locale: 'en' }),
    set('devices/bob-phone-1', { userId: 'bob', token: 't2', platform: 'android', locale: 'en' }),
    set('rateLimits/alice_note', { userId: 'alice', bucket: 'note', windowStart: 1, used: 3 }),
    set('rateLimits/bob_note', { userId: 'bob', bucket: 'note', windowStart: 1, used: 1 }),

    // Pen-name reservations (lib/db/firestore/handles).
    set('handles/alice', { uid: 'alice', handle: 'alice' }),
    set('handles/bob', { uid: 'bob', handle: 'bob' }),
    // Whose each stored picture is: keys name no one (lib/storage/uploads).
    set('uploads/a1', { ownerId: 'alice', key: 'image/2026-10/a1.webp', kind: 'image' }),
    set('uploads/b1', { ownerId: 'bob', key: 'image/2026-10/b1.webp', kind: 'image' }),
    // What reports kept of the reported content: it goes with either account.
    set('reportEvidence/r1', { reportId: 'r1', reporterId: 'alice', targetUserId: 'carol', profile: { handle: 'carol' } }),
    set('reportEvidence/r2', { reportId: 'r2', reporterId: 'carol', targetUserId: 'alice', card: { story: 'what alice wrote' } }),
    set('reportEvidence/r3', { reportId: 'r3', reporterId: 'bob', targetUserId: 'carol', profile: { handle: 'carol' } }),
    // A pending edit whose card an older app deleted from the client, and Bob's own.
    set('cards/gone-card/edits/current', { authorId: 'alice', story: 'unpublished words' }),
    set('cards/bob-card/edits/current', { authorId: 'bob', story: 'bob revising' }),
  ]);
}

async function exists(path: string): Promise<boolean> {
  return (await db.doc(path).get()).exists;
}

describe('scheduleAccountDeletion', () => {
  it("stops pushing to the account's phones at once (its sessions are revoked, so the apps can't unregister)", async () => {
    await seedWorld();
    await scheduleAccountDeletion(db, 'alice');
    expect(await exists('devices/alice-phone-1')).toBe(false);
    expect(await exists('devices/bob-phone-1')).toBe(true);
  });
});

describe('purgeAccount', () => {
  it('removes everything of the deleted user and nothing of anyone else', async () => {
    await seedWorld();
    const deleteAuthUser = vi.fn(async () => {});
    const deleteStoragePrefix = vi.fn(async () => 0);
    const deleteStorageObject = vi.fn(async () => {});
    await scheduleAccountDeletion(db, 'alice');

    await purgeAccount({ db, deleteAuthUser, deleteStoragePrefix, deleteStorageObject }, 'alice');

    const gone = [
      'users/alice',
      'users/alice/bookmarks/bob-card',
      'users/alice/blocks/carol',
      'cards/alice-card',
      'cards/alice-card/edits/current',
      'cards/alice-draft',
      'thoughtMaps/alice/nodes/alice-card',
      'connections/alice_bob',
      'conversations/alice_bob',
      'conversations/alice_bob/messages/m1',
      'conversations/alice_bob/messages/m2',
      'invites/i1',
      'invites/i2',
      'resonances/bob-card_alice',
      'resonances/alice-card_bob', // Bob's resonance record on Alice's deleted card
      'notes/n1',
      'notes/n2',
      'cardLinks/bob-card_alice-card',
      'cardLinks/alice-card_bob-card',
      'notifications/to-alice',
      'notifications/from-alice',
      'quotas/alice_2026-09-27',
      'cardVectors/alice-card__insight',
      'userProfiles/alice',
      'recommendations/alice',
      'reports/r1',
      'devices/alice-phone-1',
      'rateLimits/alice_note',
      'accountDeletions/alice',
      'handles/alice',
      'uploads/a1',
      'reportEvidence/r1',
      'reportEvidence/r2',
      'cards/gone-card/edits/current',
    ];
    const kept = [
      'users/bob',
      'users/bob/bookmarks/alice-card',
      'cards/bob-card',
      'cards/bob-reply',
      'thoughtMaps/bob/nodes/bob-card',
      'conversations/bob_carol',
      'invites/i3',
      'resonances/bob-card_carol',
      'notes/n3',
      'notifications/bob-own',
      'cardVectors/bob-card__insight',
      'reports/r2', // reports about the deleted user stay for moderation history
      'devices/bob-phone-1',
      'rateLimits/bob_note',
      'handles/bob',
      'uploads/b1',
      'reportEvidence/r3',
      'cards/bob-card/edits/current',
    ];

    const stillThere = (await Promise.all(gone.map(async (p) => ((await exists(p)) ? p : null)))).filter(Boolean);
    const missing = (await Promise.all(kept.map(async (p) => ((await exists(p)) ? null : p)))).filter(Boolean);
    expect(stillThere).toEqual([]);
    expect(missing).toEqual([]);

    expect(deleteAuthUser).toHaveBeenCalledWith('alice');
    // Older keys carry the uid; newer ones are found by their records.
    expect(deleteStoragePrefix).toHaveBeenCalledWith('image/alice/');
    expect(deleteStorageObject.mock.calls).toEqual([['image/2026-10/a1.webp']]);
  });

  it('removes a note carried into the thread, with the note itself and its bell, whichever of the two is deleted', async () => {
    for (const [sender, deleted] of [['alice', 'alice'], ['bob', 'alice']] as const) {
      await seedWorld();
      const author = sender === 'alice' ? 'bob' : 'alice';
      await db.doc(`cards/${author}-card`).update({ publishedAt: new Date(), anonymous: false });
      const note = await sendNote(db, sender, { cardId: `${author}-card`, text: 'a note in our thread' });
      expect(await exists(`conversations/alice_bob/messages/${note.id}`)).toBe(true);

      await purgeAccount({ db, deleteAuthUser: vi.fn(async () => {}) }, deleted);
      expect(await exists(`conversations/alice_bob/messages/${note.id}`)).toBe(false);
      expect(await exists('conversations/alice_bob')).toBe(false);
      expect(await exists(`notes/${note.id}`)).toBe(false);
      expect(await exists(`notifications/${note.notificationId}`)).toBe(false);
      await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
    }
  });

  it('still deletes the account when storage cleanup fails', async () => {
    await seedWorld();
    const deleteAuthUser = vi.fn(async () => {});
    const deleteStoragePrefix = vi.fn(async () => {
      throw new Error('R2 unavailable');
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});

    await purgeAccount({ db, deleteAuthUser, deleteStoragePrefix }, 'alice');

    expect(await exists('users/alice')).toBe(false);
    expect(deleteAuthUser).toHaveBeenCalledWith('alice');
  });
});

describe('the pages that showed the account', () => {
  it('are named for the cron to revalidate: each published card by id and slug, the profile, the landing page', async () => {
    await seedWorld();
    await db.doc('cards/alice-card').update({ slug: 'a-card', publishedAt: new Date() });
    const revalidate = vi.fn();
    const report = await purgeAccount({ db, deleteAuthUser: vi.fn(async () => {}), revalidate }, 'alice');
    // alice-draft was never published: no page of it was ever cached. The
    // public card may be on the landing page.
    expect(report.pages).toEqual(['/card/alice-card', '/card/a-card', '/u/alice', '/']);
    expect(revalidate).toHaveBeenCalledWith(report.pages);
  });

  it('never keep the account from being deleted when revalidating fails', async () => {
    await seedWorld();
    await db.doc('cards/alice-card').update({ publishedAt: new Date() });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const deleteAuthUser = vi.fn(async () => {});
    await purgeAccount({ db, deleteAuthUser, revalidate: () => { throw new Error('no cache here'); } }, 'alice');
    expect(await exists('users/alice')).toBe(false);
    expect(deleteAuthUser).toHaveBeenCalledWith('alice');
  });
});

describe('purgeDueAccounts', () => {
  it('purges only requests whose grace period has ended', async () => {
    await seedWorld();
    const requested = new Date('2026-09-01T00:00:00Z');
    await scheduleAccountDeletion(db, 'alice', requested);
    await scheduleAccountDeletion(db, 'bob', new Date('2026-09-25T00:00:00Z'));
    const deleteAuthUser = vi.fn(async () => {});

    const dayAfterGrace = new Date(requested.getTime() + (DELETION_GRACE_DAYS + 1) * 86_400_000);
    const run = await purgeDueAccounts({ db, deleteAuthUser }, { now: dayAfterGrace });

    expect(run).toEqual({ purged: ['alice'], failed: [], deferred: [] });
    expect(await exists('users/alice')).toBe(false);
    expect(await exists('users/bob')).toBe(true);
    expect(await getAccountDeletion(db, 'bob')).not.toBeNull();
  });

  /** A prolific account: many cards (each with a pending edit) and conversations full of messages. */
  async function prolific(uid: string, cards: number, conversations = 0) {
    const writer = db.bulkWriter();
    void writer.set(db.doc(`users/${uid}`), { handle: uid, handleLower: uid });
    for (let i = 0; i < cards; i++) {
      void writer.set(db.doc(`cards/${uid}-${i}`), { authorId: uid, thoughtCore: 't', story: 's', visibility: 'public', publishedAt: new Date(), slug: `${uid}-slug-${i}` });
      void writer.set(db.doc(`cards/${uid}-${i}/edits/current`), { story: 'pending' });
    }
    for (let c = 0; c < conversations; c++) {
      const id = `${uid}_z${c}`;
      void writer.set(db.doc(`conversations/${id}`), { participants: [uid, `z${c}`] });
      for (let m = 0; m < 5; m++) void writer.set(db.doc(`conversations/${id}/messages/m${m}`), { senderId: m % 2 ? uid : `z${c}`, text: `${m}` });
    }
    await writer.close();
  }

  const count = async (q: FirebaseFirestore.Query) => (await q.count().get()).data().count;

  // Each card and conversation used to be deleted one after another: an
  // account with many, or several due the same day, could outrun the cron's
  // 300 s and leave purges later than promised.
  it('purges a prolific account whole, its cards and conversations side by side', async () => {
    await prolific('pat', 120, 12);
    await scheduleAccountDeletion(db, 'pat', new Date('2026-09-01T00:00:00Z'));
    const revalidate = vi.fn();
    const run = await purgeDueAccounts({ db, deleteAuthUser: vi.fn(async () => {}), revalidate }, { now: new Date('2026-10-01T00:00:00Z') });
    expect(run).toEqual({ purged: ['pat'], failed: [], deferred: [] });
    expect(await count(db.collection('cards'))).toBe(0);
    expect(await count(db.collectionGroup('edits'))).toBe(0);
    expect(await count(db.collectionGroup('messages'))).toBe(0);
    expect(await exists('users/pat')).toBe(false);
    expect(revalidate.mock.calls[0][0]).toEqual(expect.arrayContaining(['/card/pat-0', '/card/pat-slug-119', '/u/pat', '/']));
  });

  it('starts nothing once its time is up: the longest overdue first, the rest left with their requests for the next run', async () => {
    await prolific('pat', 3);
    await prolific('quinn', 3);
    await scheduleAccountDeletion(db, 'quinn', new Date('2026-09-02T00:00:00Z'));
    await scheduleAccountDeletion(db, 'pat', new Date('2026-09-01T00:00:00Z'));
    let now = 0;
    // Each purge takes "a minute" (its sign-in account is deleted last).
    const deleteAuthUser = vi.fn(async () => void (now += 60_000));
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const run = await purgeDueAccounts(
      { db, deleteAuthUser },
      { now: new Date('2026-10-01T00:00:00Z'), budgetMs: 30_000, concurrency: 1, clock: () => now },
    );
    expect(run).toEqual({ purged: ['pat'], failed: [], deferred: ['quinn'] });
    expect(await exists('users/quinn')).toBe(true);
    expect(await count(db.collection('cards').where('authorId', '==', 'quinn'))).toBe(3);
    expect(await getAccountDeletion(db, 'quinn')).not.toBeNull();

    expect(await purgeDueAccounts({ db, deleteAuthUser }, { now: new Date('2026-10-02T00:00:00Z') })).toEqual({ purged: ['quinn'], failed: [], deferred: [] });
    expect(await exists('users/quinn')).toBe(false);
  });

  it('stops part way through an account cleanly: its profile and request stay until the next run finishes it', async () => {
    await prolific('pat', 40);
    await scheduleAccountDeletion(db, 'pat', new Date('2026-09-01T00:00:00Z'));
    let calls = 0;
    // Time is up a few cards in.
    const clock = () => (++calls > 6 ? 1_000_000 : 0);
    const deleteAuthUser = vi.fn(async () => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const run = await purgeDueAccounts({ db, deleteAuthUser }, { now: new Date('2026-10-01T00:00:00Z'), budgetMs: 1000, clock });
    expect(run).toEqual({ purged: [], failed: [], deferred: ['pat'] });
    const left = await count(db.collection('cards').where('authorId', '==', 'pat'));
    expect(left).toBeGreaterThan(0);
    expect(left).toBeLessThan(40);
    expect(await exists('users/pat')).toBe(true);
    expect(await getAccountDeletion(db, 'pat')).not.toBeNull();
    expect(deleteAuthUser).not.toHaveBeenCalled();

    expect((await purgeDueAccounts({ db, deleteAuthUser }, { now: new Date('2026-10-02T00:00:00Z') })).purged).toEqual(['pat']);
    expect(await count(db.collection('cards').where('authorId', '==', 'pat'))).toBe(0);
    expect(await exists('users/pat')).toBe(false);
    expect(deleteAuthUser).toHaveBeenCalledWith('pat');
  });
});

describe('exportAccountData', () => {
  it('contains the user\'s own writing only', async () => {
    await seedWorld();
    const data = await exportAccountData(db, 'alice');

    expect(data.profile?.handle).toBe('alice');
    expect(data.cards.map((c) => c.id).sort()).toEqual(['alice-card', 'alice-draft']);
    expect(data.bookmarks.map((b) => b.id)).toEqual(['bob-card']);
    expect(data.thoughtMap.nodes.map((n) => n.id)).toEqual(['alice-card']);
    expect(data.notesSent.map((n) => n.id)).toEqual(['n1']);
    expect(data.messagesSent.map((m) => m.id)).toEqual(['m1']);
    // Plain JSON — no Firestore Timestamp objects survive.
    expect(typeof data.bookmarks[0].createdAt).toBe('string');
    expect(data.messagesSent[0]).toEqual({ conversationId: 'alice_bob', id: 'm1', senderId: 'alice', text: 'hi' });
  });

  // Whom a note reached is not the writer's to keep: on an anonymous card it
  // is the author no one may know, and a note withheld across a block (sent to
  // an anonymous card's author either of them blocked) reached no one — the
  // two must look alike, or the export would tell who wrote the card.
  it("keeps each note as its writer's words and card, never whom it reached or whether they read it", async () => {
    const at = Timestamp.fromDate(new Date('2026-09-30T00:00:00Z'));
    await db.doc('notes/delivered').set({ cardId: 'anon', fromUserId: 'alice', toUserId: 'bob', text: 'hello', readAt: at, createdAt: at });
    await db.doc('notes/withheld').set({ cardId: 'anon', fromUserId: 'alice', toUserId: null, text: 'hello', readAt: null, createdAt: at });
    const { notesSent } = await exportAccountData(db, 'alice');
    const { id: _a, ...delivered } = notesSent.find((n) => n.id === 'delivered')!;
    const { id: _b, ...withheld } = notesSent.find((n) => n.id === 'withheld')!;
    expect(delivered).toEqual({ cardId: 'anon', fromUserId: 'alice', text: 'hello', createdAt: '2026-09-30T00:00:00.000Z' });
    expect(withheld).toEqual(delivered);
  });

  // The backup was built whole in memory and sent as one indented JSON body:
  // a prolific writer's could pass the platform's ~4.5 MB response limit —
  // on the very step that comes before deleting the account.
  it('streams a large backup a page at a time, as compact JSON that parses whole', async () => {
    await seedWorld();
    const writer = db.bulkWriter();
    for (let i = 0; i < 230; i++) void writer.set(db.doc(`cards/bulk-${String(i).padStart(3, '0')}`), { authorId: 'alice', thoughtCore: `t${i}`, story: 'x'.repeat(2000) });
    for (let m = 0; m < 150; m++) void writer.set(db.doc(`conversations/alice_bob/messages/bulk-${m}`), { senderId: 'alice', text: `${m}` });
    await writer.close();

    const pieces: string[] = [];
    for await (const piece of exportAccountJson(db, 'alice', new Date('2026-10-01T00:00:00Z'))) pieces.push(piece);
    // Sent as it is read: the first piece already carries the profile, and the rest come in many pieces.
    expect(pieces[0]).toContain('"profile":{');
    expect(pieces.length).toBeGreaterThan(10);
    const text = pieces.join('');
    expect(text).not.toContain('\n');
    const data = JSON.parse(text);
    expect(data.exportedAt).toBe('2026-10-01T00:00:00.000Z');
    expect(data.cards).toHaveLength(232);
    expect(new Set(data.cards.map((c: { id: string }) => c.id)).size).toBe(232);
    expect(data.messagesSent).toHaveLength(151);
    expect(Object.keys(data)).toEqual(['exportedAt', 'profile', 'cards', 'bookmarks', 'thoughtMap', 'notesSent', 'messagesSent']);
    expect(await exportAccountData(db, 'alice', new Date('2026-10-01T00:00:00Z'))).toEqual(data);
  });

  it('is a complete, empty backup for an account with nothing in it', async () => {
    expect(await exportAccountData(db, 'nobody', new Date('2026-10-01T00:00:00Z'))).toEqual({
      exportedAt: '2026-10-01T00:00:00.000Z',
      profile: null,
      cards: [],
      bookmarks: [],
      thoughtMap: { nodes: [], edges: [], groups: [] },
      notesSent: [],
      messagesSent: [],
    });
  });
});
