import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, Timestamp, type Firestore } from 'firebase-admin/firestore';
import { ApiFailure } from '@/lib/api/v1/http';
import { publishCard } from '@/lib/api/v1/publish';
import { unfurlCardLinks } from '@/lib/links/cardLinks';
import { verifyImageSignature } from '@/lib/links/imageProxy';
import { createPreviewMemo, type PreviewFetch } from '@/lib/links/preview';

// Publishing through the v1 API against the Firestore emulator — what the web
// editor's submit() does from the client (stamp once, slug, resonance
// connection + notification), with the rules' guarantees re-checked here.

const PROJECT = 'demo-resonance-api-publish';
let app: App;
let db: Firestore;
const slugBase = async (title: string) => (title.includes('雨') ? 'after-the-rain' : 'a-quiet-night');

beforeAll(() => {
  process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
  app = initializeApp({ projectId: PROJECT }, 'api-v1-publish-test');
  db = getFirestore(app);
});

afterAll(async () => {
  await deleteApp(app);
});

beforeEach(async () => {
  await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, {
    method: 'DELETE',
  });
  await Promise.all(
    ['alice', 'bob'].map((id) => db.doc(`users/${id}`).set({ handle: id, handleLower: id })),
  );
  await db.doc('cards/orig').set({ authorId: 'bob', thoughtCore: '一場雨', story: 'x', visibility: 'public', publishedAt: Timestamp.now(), slug: 'bobs-rain' });
});

const draft = (id: string, extra: Record<string, unknown> = {}) =>
  db.doc(`cards/${id}`).set({ authorId: 'alice', thoughtCore: '安靜的夜晚', story: '...', visibility: 'public', publishedAt: null, anonymous: false, ...extra });

async function failure(p: Promise<unknown>): Promise<ApiFailure> {
  const e = await p.then(
    () => null,
    (err: unknown) => err,
  );
  expect(e).toBeInstanceOf(ApiFailure);
  return e as ApiFailure;
}

describe('publishCard', () => {
  it('stamps publishedAt once and gives the card its slug with the handle', async () => {
    await draft('c1');
    const first = await publishCard(db, 'alice', 'c1', slugBase);
    expect(first).toEqual({ id: 'c1', slug: 'a-quiet-night', firstPublish: true, notificationId: null, pendingSlug: null });
    const stamped = (await db.doc('cards/c1').get()).get('publishedAt') as Timestamp;
    expect(stamped).toBeInstanceOf(Timestamp);

    const again = await publishCard(db, 'alice', 'c1', slugBase);
    expect(again).toEqual({ id: 'c1', slug: 'a-quiet-night', firstPublish: false, notificationId: null, pendingSlug: null });
    expect(((await db.doc('cards/c1').get()).get('publishedAt') as Timestamp).isEqual(stamped)).toBe(true);
  });

  it('adds the handle to a slug someone already has', async () => {
    await db.doc('cards/taken').set({ authorId: 'bob', slug: 'a-quiet-night' });
    await draft('c1');
    expect((await publishCard(db, 'alice', 'c1', slugBase)).slug).toBe('a-quiet-night-alice');
  });

  it("publishes even when the slug can't be made (the id is a working URL)", async () => {
    await draft('c1');
    const result = await publishCard(db, 'alice', 'c1', async () => {
      throw new Error('LLM down');
    });
    expect(result).toEqual({ id: 'c1', slug: null, firstPublish: true, notificationId: null, pendingSlug: null });
  });

  it('answers without the slug when it is slow, and writes it once it comes', async () => {
    await draft('c1');
    const slow = async () => {
      await new Promise((r) => setTimeout(r, 300));
      return 'a-quiet-night';
    };
    const started = Date.now();
    const { pendingSlug, ...result } = await publishCard(db, 'alice', 'c1', slow, { slugWaitMs: 50 });
    expect(Date.now() - started).toBeLessThan(300);
    expect(result).toEqual({ id: 'c1', slug: null, firstPublish: true, notificationId: null });
    expect((await db.doc('cards/c1').get()).get('publishedAt')).toBeInstanceOf(Timestamp);
    // The route awaits this after its response (revalidating the page).
    expect(await pendingSlug).toBe('a-quiet-night');
    expect((await db.doc('cards/c1').get()).get('slug')).toBe('a-quiet-night');
  });

  it('leaves every published card with a boolean `anonymous` — the public lists filter on it', async () => {
    await db.doc('cards/old').set({ authorId: 'alice', thoughtCore: '一篇舊稿', story: '...', visibility: 'public', publishedAt: null });
    await publishCard(db, 'alice', 'old', slugBase);
    expect((await db.doc('cards/old').get()).get('anonymous')).toBe(false);
    await draft('anon', { anonymous: true });
    await publishCard(db, 'alice', 'anon', slugBase);
    expect((await db.doc('cards/anon').get()).get('anonymous')).toBe(true);
  });

  it("is not_found for someone else's card, and refuses an untitled one", async () => {
    await draft('c1');
    expect((await failure(publishCard(db, 'bob', 'c1', slugBase))).code).toBe('not_found');
    await draft('c2', { thoughtCore: '  ' });
    expect((await failure(publishCard(db, 'alice', 'c2', slugBase))).code).toBe('invalid_request');
    expect((await db.doc('cards/c1').get()).get('publishedAt')).toBeNull();
  });

  describe('a resonance', () => {
    const notifications = () => db.collection('notifications').where('userId', '==', 'bob').get();

    it("connects the authors and rings the original author's bell, once", async () => {
      await draft('r1', { referenceCardId: 'orig' });
      const first = await publishCard(db, 'alice', 'r1', slugBase);
      const again = await publishCard(db, 'alice', 'r1', slugBase);
      expect((await db.doc('connections/alice_bob').get()).get('userIds')).toEqual(['alice', 'bob']);
      const bell = await notifications();
      expect(bell.size).toBe(1);
      // The route pushes that row after its response; a re-publish rings nothing.
      expect(first.notificationId).toBe(bell.docs[0].id);
      expect(again.notificationId).toBeNull();
      expect(bell.docs[0].data()).toMatchObject({ type: 'resonance', readAt: null, payload: { fromUserId: 'alice', fromHandle: 'alice', cardId: 'orig' } });
    });

    it("connects the authors without waiting for a slow slug", async () => {
      await draft('r1', { referenceCardId: 'orig' });
      let release!: () => void;
      const stalled = () => new Promise<string>((resolve) => (release = () => resolve('a-quiet-night')));
      const result = await publishCard(db, 'alice', 'r1', stalled, { slugWaitMs: 200 });
      expect(result.slug).toBeNull();
      expect(result.notificationId).toBe((await notifications()).docs[0].id);
      expect((await db.doc('connections/alice_bob').get()).exists).toBe(true);
      release();
      expect(await result.pendingSlug).toBe('a-quiet-night');
    });

    it('stays anonymous: no connection, no notification, no handle in the slug', async () => {
      await db.doc('cards/taken').set({ authorId: 'bob', slug: 'a-quiet-night' });
      await draft('r1', { referenceCardId: 'orig', anonymous: true });
      expect((await publishCard(db, 'alice', 'r1', slugBase)).slug).toBe('a-quiet-night-2');
      expect((await db.doc('connections/alice_bob').get()).exists).toBe(false);
      expect((await notifications()).size).toBe(0);
    });

    it("rings an anonymous original's author but connects no one: the connection would name them to the resonator", async () => {
      await db.doc('cards/orig').set({ anonymous: true }, { merge: true });
      await draft('r1', { referenceCardId: 'orig' });
      const result = await publishCard(db, 'alice', 'r1', slugBase);
      expect((await db.doc('connections/alice_bob').get()).exists).toBe(false);
      const bell = await notifications();
      expect(bell.size).toBe(1);
      expect(result.notificationId).toBe(bell.docs[0].id);
    });

    it('reaches no one across a block, in either direction', async () => {
      await db.doc('users/bob/blocks/alice').set({ blockedUid: 'alice' });
      await draft('r1', { referenceCardId: 'orig' });
      await publishCard(db, 'alice', 'r1', slugBase);
      expect((await db.doc('connections/alice_bob').get()).exists).toBe(false);
      expect((await notifications()).size).toBe(0);
    });

    it("reaches no one when the original isn't visible to the resonator", async () => {
      await db.doc('cards/orig').set({ visibility: 'private' }, { merge: true });
      await draft('r1', { referenceCardId: 'orig' });
      await publishCard(db, 'alice', 'r1', slugBase);
      expect((await notifications()).size).toBe(0);
    });
  });
});

// What the publish route runs after its response, beside the slug: the story's link previews.
describe('publishCard, then the link previews', () => {
  const PAGE = (url: string) => ({
    url,
    status: 200,
    contentType: 'text/html',
    charset: 'utf-8',
    body: Buffer.from(
      `<head><meta property="og:title" content="Page ${new URL(url).pathname}"><meta property="og:description" content="About it."><meta property="og:image" content="https://cdn.example.com/p.jpg"></head>`,
    ),
    truncated: false,
  });
  const fetchPages = (async (url: string) => PAGE(url)) as unknown as PreviewFetch;

  it("gives the published card its standalone links' previews, signed pictures and all, and leaves its stamps", async () => {
    await draft('c1', { story: '那天的雨。\n\nhttps://example.com/rain\n\n內文裡的 [連結](https://example.com/inline) 不算。\n\n<https://example.com/walk>' });
    await publishCard(db, 'alice', 'c1', slugBase);
    const published = (await db.doc('cards/c1').get()).data()!;
    expect(published).not.toHaveProperty('linkPreviews');

    expect(await unfurlCardLinks(db, 'c1', { fetch: fetchPages, memo: createPreviewMemo() })).toMatchObject({ links: 2, previews: 2, written: true });
    const card = (await db.doc('cards/c1').get()).data()!;
    expect(card.linkPreviewsFor).toEqual(['https://example.com/rain', 'https://example.com/walk']);
    expect(card.linkPreviews).toMatchObject([
      { url: 'https://example.com/rain', title: 'Page /rain', description: 'About it.' },
      { url: 'https://example.com/walk', title: 'Page /walk', description: 'About it.' },
    ]);
    const image = new URL(card.linkPreviews[0].image, 'https://resonance.channel');
    expect(image.pathname).toBe('/api/link-image');
    expect(verifyImageSignature(image.searchParams.get('u')!, image.searchParams.get('s')!)).toBe(true);
    expect((card.updatedAt as Timestamp).isEqual(published.updatedAt)).toBe(true);
    expect((card.excerptAt as Timestamp).isEqual(published.excerptAt)).toBe(true);
    expect((await db.doc('rateLimits/alice_unfurl').get()).get('used')).toBe(2);
  });

  it('leaves a draft without previews (they come with publishing)', async () => {
    await draft('c1', { story: 'https://example.com/rain' });
    expect(await unfurlCardLinks(db, 'c1', { fetch: fetchPages, memo: createPreviewMemo() })).toMatchObject({ written: false });
    expect((await db.doc('cards/c1').get()).data()).not.toHaveProperty('linkPreviews');
  });
});
