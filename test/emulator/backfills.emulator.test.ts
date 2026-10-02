import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, Timestamp, type Firestore } from 'firebase-admin/firestore';
import { backfillAnonymous } from '../../scripts/backfills/anonymous';
import { backfillHandles } from '../../scripts/backfills/handles';
import { cleanUpEdits } from '../../scripts/backfills/orphanEdits';
import { setStorageHost } from '../../scripts/backfills/storageHost';
import { rekeyAnonymousImages, type Storage } from '../../scripts/backfills/rekeyImages';

// The one-off backfills (scripts/backfill.ts) against the Firestore emulator:
// what they change with --apply, and that a dry run changes nothing.

const PROJECT = 'demo-resonance-backfills';
let app: App;
let db: Firestore;
const quiet = () => {};

beforeAll(() => {
  process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
  app = initializeApp({ projectId: PROJECT }, 'backfills-test');
  db = getFirestore(app);
});

afterAll(async () => {
  await deleteApp(app);
});

beforeEach(async () => {
  await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, {
    method: 'DELETE',
  });
});

const data = (path: string) => db.doc(path).get().then((s) => (s.exists ? s.data() : null));
const joined = (iso: string) => Timestamp.fromDate(new Date(iso));

describe('anonymous', () => {
  it('gives every card without a boolean `anonymous` a false one, and leaves the rest', async () => {
    await db.doc('cards/old').set({ authorId: 'a', visibility: 'public' });
    await db.doc('cards/odd').set({ authorId: 'a', anonymous: 'true' });
    await db.doc('cards/anon').set({ authorId: 'a', anonymous: true });
    await db.doc('cards/named').set({ authorId: 'a', anonymous: false });

    expect(await backfillAnonymous(db, { apply: false, log: quiet })).toMatchObject({ cards: 4, missing: 2, updated: 0 });
    expect((await data('cards/old'))!.anonymous).toBeUndefined();

    await backfillAnonymous(db, { apply: true, log: quiet });
    expect((await data('cards/old'))!.anonymous).toBe(false);
    expect((await data('cards/odd'))!.anonymous).toBe(false);
    expect((await data('cards/anon'))!.anonymous).toBe(true);
    expect(await backfillAnonymous(db, { apply: true, log: quiet })).toMatchObject({ missing: 0 });
  });
});

describe('handles', () => {
  beforeEach(async () => {
    await Promise.all([
      db.doc('users/alice').set({ handle: 'Alice', handleLower: 'alice', joinedAt: joined('2026-01-01') }),
      db.doc('users/bob').set({ handle: '小波', handleLower: '小波', joinedAt: joined('2026-01-02') }),
      // Two accounts on one name, written before names were reserved.
      db.doc('users/dup1').set({ handle: 'Echo', handleLower: 'echo', joinedAt: joined('2026-03-01') }),
      db.doc('users/dup2').set({ handle: 'echo', handleLower: 'echo', joinedAt: joined('2026-02-01') }),
      db.doc('users/dots').set({ handle: '..', handleLower: '..' }),
      db.doc('users/carol').set({ handle: 'Carol', handleLower: 'carol' }),
      db.doc('handles/carol').set({ uid: 'carol', handle: 'Carol' }),
      db.doc('users/dave').set({ handle: 'Taken', handleLower: 'taken' }),
      db.doc('handles/taken').set({ uid: 'someone-else', handle: 'Taken' }),
    ]);
  });

  it('reserves each name one account goes by, and reports — never guesses — the rest', async () => {
    const dry = await backfillHandles(db, { apply: false, log: quiet });
    expect(dry.reserved.sort()).toEqual(['alice', '小波']);
    expect(await data('handles/alice')).toBeNull();

    const report = await backfillHandles(db, { apply: true, log: quiet });
    expect(await data('handles/alice')).toMatchObject({ uid: 'alice', handle: 'Alice' });
    expect(await data('handles/小波')).toMatchObject({ uid: 'bob', handle: '小波' });
    // The earliest joined first, for the owner to decide.
    expect(report.duplicates).toEqual([expect.stringMatching(/^echo: dup2 .*, dup1 /)]);
    expect(await data('handles/echo')).toBeNull();
    expect(report.unreservable).toEqual(['..: dots']);
    expect(report.alreadyReserved).toBe(1);
    expect(report.heldByAnother).toEqual(['taken: reserved by someone-else, used by dave']);
    expect(await data('handles/taken')).toMatchObject({ uid: 'someone-else' });

    expect((await backfillHandles(db, { apply: true, log: quiet })).reserved).toEqual([]);
  });
});

describe('edits', () => {
  it('deletes pending edits whose card is gone, and names the author on the others', async () => {
    await db.doc('cards/live').set({ authorId: 'alice' });
    await db.doc('cards/live/edits/current').set({ story: 'revising' });
    await db.doc('cards/gone/edits/current').set({ story: 'left behind' });
    await db.doc('cards/named').set({ authorId: 'bob' });
    await db.doc('cards/named/edits/current').set({ story: 'x', authorId: 'bob' });

    expect(await cleanUpEdits(db, { apply: false, log: quiet })).toEqual({ edits: 3, orphans: 1, unnamed: 1 });
    expect(await data('cards/gone/edits/current')).not.toBeNull();

    await cleanUpEdits(db, { apply: true, log: quiet });
    expect(await data('cards/gone/edits/current')).toBeNull();
    expect((await data('cards/live/edits/current'))!.authorId).toBe('alice');
    expect((await data('cards/named/edits/current'))!.authorId).toBe('bob');
  });
});

describe('storage-host', () => {
  it("names the storage's public host for the rules", async () => {
    await setStorageHost(db, 'https://img.resonance.test/', { apply: false, log: quiet });
    expect(await data('config/storage')).toBeNull();
    await setStorageHost(db, 'https://img.resonance.test/', { apply: true, log: quiet });
    expect(await data('config/storage')).toEqual({ host: 'img.resonance.test' });
  });
});

describe('rekey-images', () => {
  const BASE = 'https://img.resonance.test';
  const oldCover = `${BASE}/image/bob/2026-05/cover.webp`;
  const oldInline = `${BASE}/image/bob/2026-05/inline.webp`;

  function fakeStorage() {
    const copies: [string, string][] = [];
    const deleted: string[] = [];
    const storage: Storage = {
      copyObject: async (from, to) => void copies.push([from, to]),
      deleteObject: async (key) => void deleted.push(key),
    };
    return { storage, copies, deleted };
  }

  beforeEach(async () => {
    await db.doc('cards/anon').set({
      authorId: 'bob', anonymous: true,
      media: { type: 'image', url: oldCover, label: 'c' },
      story: `Before.\n\n![a street](${oldInline})\n\nAfter, and [elsewhere](https://example.com).`,
    });
    await db.doc('cards/anon/edits/current').set({ media: { type: 'image', url: oldCover, label: 'c' }, story: 'revising' });
    // Signed: its author is on its byline anyway.
    await db.doc('cards/signed').set({ authorId: 'bob', anonymous: false, media: { type: 'image', url: oldCover } });
    // Already under a key that names no one.
    await db.doc('cards/fresh').set({ authorId: 'bob', anonymous: true, media: { type: 'image', url: `${BASE}/image/2026-10/new.webp` } });
  });

  it("moves an anonymous card's pictures (cover and story, its pending edit too) to keys that name no one, on record as its author's", async () => {
    const { storage, copies } = fakeStorage();
    expect(await rekeyAnonymousImages(db, storage, { apply: false, publicBase: BASE, log: quiet })).toMatchObject({ documents: 2, pictures: 2, moved: 0 });
    expect(copies).toEqual([]);

    await rekeyAnonymousImages(db, storage, { apply: true, publicBase: BASE, log: quiet });
    expect(copies.map(([from]) => from).sort()).toEqual(['image/bob/2026-05/cover.webp', 'image/bob/2026-05/inline.webp']);
    for (const [, to] of copies) expect(to).toMatch(/^image\/2026-05\/[0-9a-f-]{36}\.webp$/);

    const card = (await data('cards/anon'))!;
    const edit = (await data('cards/anon/edits/current'))!;
    expect(JSON.stringify(card)).not.toContain('/bob/');
    expect(JSON.stringify(edit)).not.toContain('/bob/');
    expect(card.story).toContain('After, and [elsewhere](https://example.com).');
    expect(edit.media.url).toBe(card.media.url);
    const records = (await db.collection('uploads').get()).docs.map((d) => d.data());
    expect(records).toHaveLength(2);
    for (const r of records) expect(r).toMatchObject({ ownerId: 'bob', kind: 'image' });

    // A signed card keeps its picture; a second run has nothing left to move.
    expect((await data('cards/signed'))!.media.url).toBe(oldCover);
    expect(await rekeyAnonymousImages(db, storage, { apply: true, publicBase: BASE, log: quiet })).toMatchObject({ pictures: 0 });
  });

  it('deletes the old copies only when asked — on a later run, by the records', async () => {
    const { storage, deleted } = fakeStorage();
    await rekeyAnonymousImages(db, storage, { apply: true, publicBase: BASE, log: quiet });
    expect(deleted).toEqual([]);
    await rekeyAnonymousImages(db, storage, { apply: true, deleteOld: true, publicBase: BASE, log: quiet });
    expect(deleted.sort()).toEqual(['image/bob/2026-05/cover.webp', 'image/bob/2026-05/inline.webp']);
    await rekeyAnonymousImages(db, storage, { apply: true, deleteOld: true, publicBase: BASE, log: quiet });
    expect(deleted).toHaveLength(2);
  });
});
