import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, Timestamp, type Firestore } from 'firebase-admin/firestore';
import { backfillAnonymous } from '../../scripts/backfills/anonymous';
import { backfillHandles } from '../../scripts/backfills/handles';
import { cleanUpEdits } from '../../scripts/backfills/orphanEdits';
import { setStorageHost } from '../../scripts/backfills/storageHost';
import { rekeyAnonymousImages, type Storage } from '../../scripts/backfills/rekeyImages';
import { rehostImages } from '../../scripts/backfills/rehostImages';
import { backfillLinkPreviews } from '../../scripts/backfills/linkPreviews';
import type { PreviewFetch } from '@/lib/links/preview';

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

  it('keeps the host it replaces, and the configured former ones, as former hosts — once each, never the current one', async () => {
    await db.doc('config/storage').set({ host: 'pub-1.r2.dev', formerHosts: ['pub-0.r2.dev', 'img.resonance.test'] });
    const formerBases = ['https://pub-0.r2.dev/', 'https://pub-2.r2.dev'];

    await setStorageHost(db, 'https://img.resonance.test', { apply: false, formerBases, log: quiet });
    expect(await data('config/storage')).toEqual({ host: 'pub-1.r2.dev', formerHosts: ['pub-0.r2.dev', 'img.resonance.test'] });

    expect(await setStorageHost(db, 'https://img.resonance.test', { apply: true, formerBases, log: quiet }))
      .toMatchObject({ host: 'img.resonance.test', previous: 'pub-1.r2.dev' });
    expect(await data('config/storage')).toEqual({ host: 'img.resonance.test', formerHosts: ['pub-0.r2.dev', 'pub-1.r2.dev', 'pub-2.r2.dev'] });

    // Run again: nothing new.
    await setStorageHost(db, 'https://img.resonance.test', { apply: true, formerBases, log: quiet });
    expect((await data('config/storage'))!.formerHosts).toEqual(['pub-0.r2.dev', 'pub-1.r2.dev', 'pub-2.r2.dev']);
  });
});

describe('rehost-images', () => {
  const NOW = 'https://img.resonance.test';
  const BEFORE = 'https://pub-0123.r2.dev';
  const cover = `${BEFORE}/image/2026-05/cover.webp`;
  const inline = `${BEFORE}/image/2026-05/inline.webp`;
  const avatar = `${BEFORE}/image/2026-05/avatar.webp`;
  const at = Timestamp.fromDate(new Date('2026-05-01T00:00:00Z'));
  const story = `Before.\n\n![a street](${inline} "title")\n\n![kept](${NOW}/image/2026-10/new.webp) and [elsewhere](https://example.com), `
    + `a lookalike ${BEFORE}.evil.example/image/x.webp.`;

  beforeEach(async () => {
    await db.doc('users/alice').set({ handle: 'alice', avatarUrl: avatar, joinedAt: at });
    await db.doc('users/bob').set({ handle: 'bob', avatarUrl: `${NOW}/image/2026-10/bob.webp` });
    await db.doc('users/carol').set({ handle: 'carol', avatarUrl: 'https://elsewhere.example/c.png' });
    await db.doc('users/dave').set({ handle: 'dave' });
    await db.doc('cards/c1').set({
      authorId: 'alice', anonymous: false, visibility: 'public', thoughtCore: 'T', tags: ['a'],
      media: { type: 'image', url: cover, label: 'c' }, story,
      publishedAt: at, updatedAt: at, excerpt: 'Before.', excerptAt: at, readMinutes: 1, slug: 's',
    });
    await db.doc('cards/c1/edits/current').set({ media: { type: 'image', url: cover, label: 'c' }, story: `Revising ![x](${inline})`, updatedAt: at, authorId: 'alice' });
    await db.doc('cards/c2').set({ authorId: 'bob', media: { type: 'image', url: 'https://legacy.example/old.jpg' }, story: 'No pictures.', updatedAt: at });
    // What was reported, as it was: evidence is never rewritten.
    await db.doc('reportEvidence/r1').set({ card: { media: { type: 'image', url: cover }, story }, profile: { avatarUrl: avatar } });
  });

  async function snapshot() {
    const paths = ['users/alice', 'users/bob', 'users/carol', 'users/dave', 'cards/c1', 'cards/c1/edits/current', 'cards/c2', 'reportEvidence/r1'];
    return Object.fromEntries(await Promise.all(paths.map(async (p) => [p, await data(p)] as const)));
  }

  it('moves every stored picture URL on a former host to the same key on the current one, and changes nothing else', async () => {
    const before = await snapshot();
    const dry = await rehostImages(db, { apply: false, publicBase: NOW, formerBases: [`${BEFORE}/`], log: quiet });
    expect(dry).toMatchObject({ users: { read: 4, rewritten: 1 }, cards: { read: 2, rewritten: 1 }, edits: { read: 1, rewritten: 1 }, pictures: 3 });
    expect(await snapshot()).toEqual(before);

    expect(await rehostImages(db, { apply: true, publicBase: NOW, formerBases: [BEFORE], log: quiet })).toMatchObject({ notWritten: 0 });
    const after = await snapshot();
    const moved = (value: unknown) => JSON.parse(JSON.stringify(value).split(`${BEFORE}/image/`).join(`${NOW}/image/`));
    expect(after['users/alice']).toEqual({ ...before['users/alice'], avatarUrl: `${NOW}/image/2026-05/avatar.webp` });
    expect(after['cards/c1']).toEqual({
      ...before['cards/c1'],
      media: { type: 'image', url: `${NOW}/image/2026-05/cover.webp`, label: 'c' },
      story: moved(story),
    });
    // Its dates and summary stay as they were: nothing reads as edited, nothing moves in a list.
    expect(after['cards/c1']!.updatedAt).toEqual(at);
    expect(after['cards/c1']!.excerptAt).toEqual(at);
    expect(after['cards/c1']!.story).toContain(`${BEFORE}.evil.example/image/x.webp`);
    expect(after['cards/c1/edits/current']).toEqual({
      ...before['cards/c1/edits/current'],
      media: { type: 'image', url: `${NOW}/image/2026-05/cover.webp`, label: 'c' },
      story: `Revising ![x](${NOW}/image/2026-05/inline.webp)`,
    });
    for (const p of ['users/bob', 'users/carol', 'users/dave', 'cards/c2', 'reportEvidence/r1']) expect(after[p], p).toEqual(before[p]);

    // A second run has nothing left to move.
    expect(await rehostImages(db, { apply: true, publicBase: NOW, formerBases: [BEFORE], log: quiet }))
      .toMatchObject({ users: { rewritten: 0 }, cards: { rewritten: 0 }, edits: { rewritten: 0 }, pictures: 0 });
  });

  it('needs a former host to move from', async () => {
    await expect(rehostImages(db, { apply: false, publicBase: NOW, formerBases: [`${NOW}/`], log: quiet })).rejects.toThrow(/R2_FORMER_PUBLIC_BASES/);
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

describe('link-previews', () => {
  const stamp = Timestamp.fromDate(new Date('2026-09-01T08:00:00Z'));
  const asked: string[] = [];
  const fetchPages = (async (url: string) => {
    asked.push(url);
    return {
      url,
      status: 200,
      contentType: 'text/html',
      charset: 'utf-8',
      body: Buffer.from(`<head><meta property="og:title" content="Page ${new URL(url).pathname}"></head>`),
      truncated: false,
    };
  }) as unknown as PreviewFetch;
  const published = (story: string, extra: Record<string, unknown> = {}) => ({
    authorId: 'a',
    story,
    visibility: 'public',
    publishedAt: stamp,
    updatedAt: stamp,
    excerptAt: stamp,
    ...extra,
  });

  beforeEach(async () => {
    asked.length = 0;
    await Promise.all([
      db.doc('cards/old').set(published('一段。\n\nhttps://example.com/old\n\n[第二篇](https://example.com/two)')),
      // Done already: same links as its previews were made for (one of them said nothing).
      db.doc('cards/done').set(
        published('https://example.com/done\n\nhttps://example.com/quiet', {
          linkPreviews: [{ url: 'https://example.com/done', title: 'Done' }],
          linkPreviewsFor: ['https://example.com/done', 'https://example.com/quiet'],
        }),
      ),
      // Its story changed outside publish/apply (an older app build): the gone link's preview goes.
      db.doc('cards/moved').set(
        published('https://example.com/new', {
          linkPreviews: [{ url: 'https://example.com/gone', title: 'Gone' }],
          linkPreviewsFor: ['https://example.com/gone'],
        }),
      ),
      db.doc('cards/plain').set(published('沒有連結，只有 [行內的](https://example.com/inline)。')),
      db.doc('cards/draft').set(published('https://example.com/draft', { publishedAt: null })),
    ]);
  });

  it('counts the published cards whose previews are not for their links, and changes nothing without --apply', async () => {
    const report = await backfillLinkPreviews(db, { apply: false, log: quiet, fetch: fetchPages });
    expect(report).toEqual({ cards: 4, candidates: 2, links: 3, written: 0, previews: 0 });
    expect(asked).toEqual([]);
    expect(await data('cards/old')).not.toHaveProperty('linkPreviews');
  });

  it('unfurls them as a save would — no budget charged, no stamp moved — and is done after one run', async () => {
    const report = await backfillLinkPreviews(db, { apply: true, log: quiet, fetch: fetchPages });
    expect(report).toMatchObject({ candidates: 2, written: 2, previews: 3 });
    expect(asked.sort()).toEqual(['https://example.com/new', 'https://example.com/old', 'https://example.com/two']);

    const old = (await data('cards/old'))!;
    expect(old.linkPreviews).toEqual([
      { url: 'https://example.com/old', title: 'Page /old' },
      { url: 'https://example.com/two', title: 'Page /two' },
    ]);
    expect((old.updatedAt as Timestamp).isEqual(stamp)).toBe(true);
    expect((old.excerptAt as Timestamp).isEqual(stamp)).toBe(true);
    expect((await data('cards/moved'))!.linkPreviews).toEqual([{ url: 'https://example.com/new', title: 'Page /new' }]);
    expect(await data('cards/plain')).not.toHaveProperty('linkPreviews');
    expect(await data('cards/draft')).not.toHaveProperty('linkPreviews');
    expect(await data('rateLimits/a_unfurl')).toBeNull();

    expect(await backfillLinkPreviews(db, { apply: true, log: quiet, fetch: fetchPages })).toMatchObject({ candidates: 0, written: 0 });
  });
});
