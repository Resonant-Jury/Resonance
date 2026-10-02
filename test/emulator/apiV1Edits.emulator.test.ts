import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, Timestamp, type Firestore } from 'firebase-admin/firestore';
import { ApiFailure } from '@/lib/api/v1/http';
import { applyCardEdit } from '@/lib/api/v1/edits';

// Applying a published card's pending edit through the v1 API against the
// Firestore emulator — what saving changes in an editor (web or app) does:
// the buffer becomes the live fields and is gone.

const PROJECT = 'demo-resonance-api-edits';
let app: App;
let db: Firestore;
const published = Timestamp.fromDate(new Date('2026-09-01T08:00:00Z'));

beforeAll(() => {
  process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
  app = initializeApp({ projectId: PROJECT }, 'api-v1-edits-test');
  db = getFirestore(app);
});

afterAll(async () => {
  await deleteApp(app);
});

beforeEach(async () => {
  await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, {
    method: 'DELETE',
  });
  await db.doc('users/alice').set({ handle: '小安', handleLower: '小安' });
  await db.doc('cards/live').set({
    authorId: 'alice',
    thoughtCore: '安靜的夜晚',
    story: '原本的故事',
    tags: ['夜'],
    visibility: 'public',
    anonymous: false,
    media: { type: 'image', url: 'https://cdn/old.avif', label: 'old' },
    accentHue: 55,
    slug: 'a-quiet-night',
    publishedAt: published,
    readCount: 7,
    resonanceCount: 2,
  });
});

const buffer = (extra: Record<string, unknown> = {}, omit: string[] = []) => {
  const values: Record<string, unknown> = {
    thoughtCore: '更安靜的夜晚',
    story: '改過的故事',
    tags: ['夜', '雨'],
    visibility: 'connections',
    anonymous: false,
    media: { type: 'image', url: 'https://cdn/new.avif', label: 'new' },
    accentHue: 215,
    updatedAt: Timestamp.now(),
    ...extra,
  };
  for (const key of omit) delete values[key];
  return db.doc('cards/live/edits/current').set(values);
};

async function failure(p: Promise<unknown>): Promise<ApiFailure> {
  const e = await p.then(
    () => null,
    (err: unknown) => err,
  );
  expect(e).toBeInstanceOf(ApiFailure);
  return e as ApiFailure;
}

describe('applyCardEdit', () => {
  it('makes the working copy the live card and clears it, keeping the date, slug and counts', async () => {
    await buffer();
    await expect(applyCardEdit(db, 'alice', 'live')).resolves.toEqual({
      id: 'live',
      slug: 'a-quiet-night',
      applied: true,
      // The route revalidates these after its response: the card under both
      // names, the profile listing it, and the landing page it was public on
      // (this edit took it to connections-only).
      stale: ['/card/live', '/card/a-quiet-night', '/u/小安', `/u/${encodeURIComponent('小安')}`, '/'],
    });
    const card = (await db.doc('cards/live').get()).data()!;
    expect(card).toMatchObject({
      thoughtCore: '更安靜的夜晚',
      story: '改過的故事',
      tags: ['夜', '雨'],
      visibility: 'connections',
      media: { url: 'https://cdn/new.avif' },
      accentHue: 215,
      slug: 'a-quiet-night',
      readCount: 7,
      resonanceCount: 2,
    });
    expect((card.publishedAt as Timestamp).isEqual(published)).toBe(true);
    expect(card.updatedAt).toBeInstanceOf(Timestamp);
    expect((await db.doc('cards/live/edits/current').get()).exists).toBe(false);
  });

  it('removes the cover when the revision removed it (the web client cannot: it drops undefined)', async () => {
    await buffer({ accentHue: null }, ['media']);
    await applyCardEdit(db, 'alice', 'live');
    const card = (await db.doc('cards/live').get()).data()!;
    expect(card.media).toBeUndefined();
    expect(card.accentHue).toBeNull();
  });

  it('copies only the editable fields from the buffer', async () => {
    await buffer({ authorId: 'mallory', readCount: 999, publishedAt: null, slug: 'stolen', visibility: 'everyone' });
    await applyCardEdit(db, 'alice', 'live');
    const card = (await db.doc('cards/live').get()).data()!;
    expect(card).toMatchObject({ authorId: 'alice', readCount: 7, slug: 'a-quiet-night', visibility: 'public' });
    expect(card.publishedAt).not.toBeNull();
  });

  it('changes nothing when there is no pending edit (a retry after success)', async () => {
    await expect(applyCardEdit(db, 'alice', 'live')).resolves.toEqual({ id: 'live', slug: 'a-quiet-night', applied: false, stale: [] });
    expect((await db.doc('cards/live').get()).get('story')).toBe('原本的故事');
  });

  it("is not_found for someone else's card, and leaves both documents alone", async () => {
    await buffer();
    expect((await failure(applyCardEdit(db, 'bob', 'live'))).code).toBe('not_found');
    expect((await failure(applyCardEdit(db, 'alice', 'missing'))).code).toBe('not_found');
    expect((await db.doc('cards/live').get()).get('story')).toBe('原本的故事');
    expect((await db.doc('cards/live/edits/current').get()).exists).toBe(true);
  });

  it("refuses a revision past a card's limits (a buffer written before the rules held it to them), leaving the card", async () => {
    for (const extra of [
      { story: 'x'.repeat(200_001) },
      { thoughtCore: 'x'.repeat(201) },
      { tags: ['x'.repeat(1001)] },
      { media: { type: 'image', url: 'javascript:alert(1)' } },
      { media: { type: 'image', url: 'https://img.example/c.webp', label: 'x'.repeat(201) } },
      { accentHue: 9999 },
    ]) {
      await buffer(extra);
      expect((await failure(applyCardEdit(db, 'alice', 'live'))).code).toBe('invalid_request');
    }
    expect((await db.doc('cards/live').get()).get('story')).toBe('原本的故事');
  });

  it("takes a new cover only from our own storage, where the server knows it — and keeps the card's older one", async () => {
    const base = process.env.R2_PUBLIC_BASE;
    process.env.R2_PUBLIC_BASE = 'https://img.resonance.test';
    try {
      await buffer({ media: { type: 'image', url: 'https://tracker.example/p.gif', label: 'p' } });
      expect((await failure(applyCardEdit(db, 'alice', 'live'))).code).toBe('invalid_request');
      // The cover it already had (from before), kept as it is.
      await buffer({ media: { type: 'image', url: 'https://cdn/old.avif', label: 'old' } });
      await expect(applyCardEdit(db, 'alice', 'live')).resolves.toMatchObject({ applied: true });
      await buffer({ media: { type: 'image', url: 'https://img.resonance.test/image/2026-10/n.webp', label: 'n' } });
      await expect(applyCardEdit(db, 'alice', 'live')).resolves.toMatchObject({ applied: true });
    } finally {
      if (base === undefined) delete process.env.R2_PUBLIC_BASE;
      else process.env.R2_PUBLIC_BASE = base;
    }
  });

  it('refuses an untitled revision and a draft', async () => {
    await buffer({ thoughtCore: '  ' });
    expect((await failure(applyCardEdit(db, 'alice', 'live'))).code).toBe('invalid_request');
    expect((await db.doc('cards/live/edits/current').get()).exists).toBe(true);
    await db.doc('cards/draft').set({ authorId: 'alice', thoughtCore: '草稿', story: '', visibility: 'public', publishedAt: null });
    expect((await failure(applyCardEdit(db, 'alice', 'draft'))).code).toBe('invalid_request');
  });
});
