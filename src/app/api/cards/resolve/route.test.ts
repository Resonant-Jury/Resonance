import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Timestamp } from 'firebase-admin/firestore';
import { fakeAdminDb, type FakeAdminDb } from '@/../test/fakeAdminDb';

let fake: FakeAdminDb;
vi.mock('@/lib/db/firestore/admin', () => ({ getAdminDb: () => fake.db }));

import { GET } from './route';

const resolve = (key: string) => GET(new Request(`http://localhost/api/cards/resolve?key=${encodeURIComponent(key)}`));

beforeEach(() => {
  fake = fakeAdminDb({
    'cards/doc1': { slug: 'a-quiet-morning', visibility: 'public', publishedAt: Timestamp.fromMillis(1_000) },
    'cards/secret': { slug: 'hidden-thoughts', visibility: 'private', publishedAt: Timestamp.fromMillis(2_000) },
  });
});

// The card page's slug lookup: an id (never content), the same for everyone,
// so a hit may sit in the CDN — for an hour, not a day, since a deleted
// card's slug can be given to a new card — and a miss never does.
describe('GET /api/cards/resolve', () => {
  it('answers a slug with its id, cacheable by the CDN for an hour', async () => {
    const res = await resolve('a-quiet-morning');
    expect(await res.json()).toEqual({ id: 'doc1' });
    expect(res.headers.get('cache-control')).toBe('public, s-maxage=3600, stale-while-revalidate=86400');
  });

  it('answers a legacy doc id with itself, cached the same way', async () => {
    const res = await resolve('doc1');
    expect(await res.json()).toEqual({ id: 'doc1' });
    expect(res.headers.get('cache-control')).toContain('s-maxage=3600');
  });

  it('gives the id of a private card too — and nothing else of it', async () => {
    const res = await resolve('hidden-thoughts');
    expect(await res.json()).toEqual({ id: 'secret' });
  });

  it('never lets a miss be cached (the slug may be assigned a moment later)', async () => {
    const res = await resolve('not-yet-a-card');
    expect(await res.json()).toEqual({ id: null });
    expect(res.headers.get('cache-control')).toBe('no-store');

    const empty = await GET(new Request('http://localhost/api/cards/resolve'));
    expect(await empty.json()).toEqual({ id: null });
    expect(empty.headers.get('cache-control')).toBe('no-store');
  });
});
