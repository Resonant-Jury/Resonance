import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';
import { Timestamp } from 'firebase-admin/firestore';
import { fakeAdminDb, type FakeAdminDb } from '@/../test/fakeAdminDb';
import { imageVersion } from '@/lib/og';

// The share images behind og:image: a public card's cover, and a person's
// profile photo, read from storage by key and served as a JPEG at most
// 1200 px a side — the stored AVIF or WebP isn't shown by every platform.
// Anything that isn't a public, published card's picture on our own storage
// gets the platform cover; nothing about the author is ever read.

let fake: FakeAdminDb;
vi.mock('@/lib/db/firestore/admin', () => ({ getAdminDb: () => fake.db }));
const objects = new Map<string, Uint8Array>();
const getObject = vi.fn(async (key: string) => objects.get(key) ?? null);
vi.mock('@/lib/storage', () => ({ getStorageProvider: () => ({ getObject: (key: string) => getObject(key) }) }));

const { GET: cardImage } = await import('./route');
const { GET: userImage } = await import('../../user/[id]/route');

const BASE = 'https://img.example';
/** The host the storage was served from before (R2_FORMER_PUBLIC_BASES): it serves the same keys. */
const FORMER = 'https://pub-0123.r2.dev';
const COVER = `${BASE}/image/uid-author/2026-10/0b9c6a2e-1f43-4c55-9d8e-2a1c3b4d5e6f.avif`;
const AVATAR = `${BASE}/image/uid-author/2026-10/5d6e7f80-1a2b-4c3d-8e9f-0a1b2c3d4e5f.webp`;
const storageKey = (url: string) => url.slice(BASE.length + 1);

const stored = new Map<string, Uint8Array>();
beforeAll(async () => {
  vi.stubEnv('R2_PUBLIC_BASE', BASE);
  vi.stubEnv('R2_FORMER_PUBLIC_BASES', `${FORMER}/`);
  stored.set(storageKey(COVER),
    await sharp({ create: { width: 2000, height: 1000, channels: 4, background: { r: 200, g: 80, b: 60, alpha: 0.5 } } }).avif().toBuffer());
  stored.set(storageKey(AVATAR), await sharp({ create: { width: 256, height: 256, channels: 3, background: '#357' } }).webp().toBuffer());
});
afterAll(() => vi.unstubAllEnvs());

const card = (extra: Record<string, unknown> = {}) => ({
  authorId: 'uid-author',
  visibility: 'public',
  publishedAt: Timestamp.fromDate(new Date('2026-09-01T00:00:00Z')),
  media: { type: 'image', url: COVER },
  ...extra,
});

beforeEach(() => {
  vi.clearAllMocks();
  objects.clear();
  for (const [key, bytes] of stored) objects.set(key, bytes);
  fake = fakeAdminDb({
    'users/uid-author': { handle: 'quiet-walker', avatarUrl: AVATAR },
    'users/no-photo': { handle: 'plain' },
    'cards/pub1': card(),
    'cards/anon1': card({ anonymous: true }),
    'cards/priv1': card({ visibility: 'private' }),
    'cards/conn1': card({ visibility: 'connections' }),
    'cards/draft1': card({ publishedAt: null }),
    'cards/bare1': card({ media: null }),
    'cards/former1': card({ media: { type: 'image', url: COVER.replace(BASE, FORMER) } }),
    'cards/elsewhere1': card({ media: { type: 'image', url: 'https://evil.example/x.jpg' } }),
    'cards/lookalike1': card({ media: { type: 'image', url: `${BASE}/image/../../secrets/key.png` } }),
    'cards/gone1': card({ media: { type: 'image', url: `${BASE}/image/uid-author/2026-10/missing.avif` } }),
  });
});

const get = (id: string, v?: string) =>
  cardImage(new Request(`http://localhost/api/og/card/${id}${v ? `?v=${v}` : ''}`), { params: Promise.resolve({ id }) });

async function expectJpeg(res: Response, width: number, height: number) {
  expect(res.status).toBe(200);
  expect(res.headers.get('content-type')).toBe('image/jpeg');
  const bytes = Buffer.from(await res.arrayBuffer());
  expect(res.headers.get('content-length')).toBe(String(bytes.byteLength));
  expect(await sharp(bytes).metadata()).toMatchObject({ format: 'jpeg', width, height });
}

function expectPlatformCover(res: Response) {
  expect(res.status).toBe(302);
  expect(res.headers.get('location')).toBe('/og-cover.jpg');
  expect(res.headers.get('cache-control')).toBe('public, max-age=60, s-maxage=60');
}

describe('GET /api/og/card/{id}', () => {
  it("serves a public card's AVIF cover as a JPEG within 1200 px, cached by the CDN for a day under its version", async () => {
    const res = await get('pub1', imageVersion(COVER));
    await expectJpeg(res, 1200, 600);
    expect(res.headers.get('cache-control')).toBe('public, max-age=86400, s-maxage=86400');
    expect(getObject).toHaveBeenCalledWith(storageKey(COVER));

  });

  it('reads a cover still on the former storage host by the same key', async () => {
    await expectJpeg(await get('former1', imageVersion(COVER.replace(BASE, FORMER))), 1200, 600);
    expect(getObject).toHaveBeenCalledWith(storageKey(COVER));
  });

  it('sends any other version on to the current one, drawing nothing for it', async () => {
    // An older cover's URL (the page predates the new cover), none, or a made-up one.
    for (const v of [imageVersion(`${BASE}/image/uid-author/2026-09/old.avif`), undefined, 'made-up']) {
      const res = await get('pub1', v);
      expect(res.status).toBe(302);
      expect(res.headers.get('location')).toBe(`/api/og/card/pub1?v=${imageVersion(COVER)}`);
      expect(res.headers.get('cache-control')).toBe('public, max-age=300, s-maxage=300');
    }
    expect(getObject).not.toHaveBeenCalled();
  });

  it("serves an anonymous card's cover without reading anything about its author", async () => {
    await expectJpeg(await get('anon1', imageVersion(COVER)), 1200, 600);
    expect(fake.reads).toEqual(['cards/anon1']);
  });

  it.each([
    ['a private card', 'priv1'],
    ['a connections-only card', 'conn1'],
    ['a draft', 'draft1'],
    ['a card without a picture', 'bare1'],
    ['no such card', 'nope'],
    ['a stored picture that is gone', 'gone1'],
  ])('sends %s to the platform cover', async (_, id) => {
    expectPlatformCover(await get(id, id === 'gone1' ? imageVersion(`${BASE}/image/uid-author/2026-10/missing.avif`) : undefined));
  });

  it('never reads a picture that is not on our storage, or only looks like it', async () => {
    expectPlatformCover(await get('elsewhere1'));
    expectPlatformCover(await get('lookalike1'));
    expect(getObject).not.toHaveBeenCalled();
  });

  it('reads nothing for an id that is not one', async () => {
    expectPlatformCover(await get('..%2Fusers%2Fuid-author'));
    expectPlatformCover(await get('a/b'));
    expect(fake.reads).toEqual([]);
  });

  // Firestore refuses to read a document id shaped `__x__` (it keeps them for itself): asked, it would throw — a 500.
  it('sends an id Firestore keeps for itself to the platform cover without reading it', async () => {
    expectPlatformCover(await get('__x__'));
    expectPlatformCover(await get('__name__'));
    expect(fake.reads).toEqual([]);
  });
});

describe('GET /api/og/user/{id}', () => {
  const user = (id: string, v?: string) =>
    userImage(new Request(`http://localhost/api/og/user/${id}${v ? `?v=${v}` : ''}`), { params: Promise.resolve({ id }) });

  it("serves a person's profile photo as a JPEG", async () => {
    const res = await user('uid-author', imageVersion(AVATAR));
    await expectJpeg(res, 256, 256);
    expect(res.headers.get('cache-control')).toBe('public, max-age=86400, s-maxage=86400');
  });

  it('sends someone without a photo, or gone, to the platform cover', async () => {
    expectPlatformCover(await user('no-photo'));
    expectPlatformCover(await user('nobody'));
  });

  it('sends an id Firestore keeps for itself to the platform cover without reading it', async () => {
    expectPlatformCover(await user('__x__'));
    expect(fake.reads).toEqual([]);
  });
});
