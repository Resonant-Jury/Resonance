import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Timestamp } from 'firebase-admin/firestore';
import { resolveSitemap } from 'next/dist/build/webpack/loaders/metadata/resolve-route-data';
import { fakeAdminDb, type FakeAdminDb } from '@/../test/fakeAdminDb';
import { SITEMAP_MAX_CARDS } from '@/lib/seo';

// /sitemap.xml from the Admin SDK's cards (faked in memory): only cards a
// signed-out reader's card page shows with their story — public, published,
// not anonymous — and nothing about who wrote them.

let fake: FakeAdminDb;
let failRead = false;
vi.mock('@/lib/db/firestore/admin', () => ({
  getAdminDb: () => {
    if (failRead) throw new Error('Firestore unavailable');
    return fake.db;
  },
}));

const { default: sitemap, revalidate } = await import('./sitemap');

const BASE = 'https://resonance.channel';
const at = (iso: string) => Timestamp.fromDate(new Date(iso));
/** A card document; a field given as `undefined` is left out of it. */
const card = (over: Record<string, unknown>) =>
  Object.fromEntries(
    Object.entries({
      authorId: 'uid-alice',
      thoughtCore: 'A title',
      story: 'A story',
      visibility: 'public',
      anonymous: false,
      publishedAt: at('2026-09-01T08:00:00Z'),
      ...over,
    }).filter(([, v]) => v !== undefined),
  );
const urls = async () => (await sitemap()).map((e) => e.url);

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', BASE);
  failRead = false;
  fake = fakeAdminDb({});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('/sitemap.xml', () => {
  it('lists the landing and policy pages in both locales, each naming the other (hreflang)', async () => {
    const entries = await sitemap();
    expect(entries.map((e) => e.url)).toEqual(
      ['', '/privacy', '/terms', '/support', '/child-safety'].flatMap((p) => [`${BASE}/en${p}`, `${BASE}/zh-TW${p}`]),
    );
    for (const e of entries) {
      const path = e.url.replace(/^https:\/\/resonance\.channel\/(en|zh-TW)/, '');
      expect(e.alternates).toEqual({ languages: { en: `${BASE}/en${path}`, 'zh-TW': `${BASE}/zh-TW${path}` } });
    }
  });

  it('lists public, published, signed cards by slug — and never an anonymous, non-public, unpublished or slugless one', async () => {
    fake = fakeAdminDb({
      'cards/c-public': card({ slug: 'a-quiet-turning-point' }),
      'cards/c-anon': card({ slug: 'an-unsigned-letter', anonymous: true }),
      'cards/c-legacy': card({ slug: 'before-anonymity-was-recorded', anonymous: undefined }),
      'cards/c-private': card({ slug: 'my-own-notes', visibility: 'private' }),
      'cards/c-connections': card({ slug: 'for-friends-only', visibility: 'connections' }),
      'cards/c-draft': card({ slug: 'still-writing', publishedAt: null }),
      'cards/c-unstamped': card({ slug: 'never-stamped', publishedAt: undefined }),
      'cards/c-forged': card({ slug: 'top-of-the-feed', publishedAt: '2099-01-01' }),
      'cards/c-future': card({ slug: 'from-the-future', publishedAt: at('2099-01-01T00:00:00Z') }),
      'cards/c-slugless': card({}),
    });

    const cards = (await urls()).filter((u) => u.includes('/card/'));
    expect(cards).toEqual([`${BASE}/en/card/a-quiet-turning-point`, `${BASE}/zh-TW/card/a-quiet-turning-point`]);
    // One query, for exactly those cards; no author (or anything else) is read.
    expect(fake.reads).toEqual(['cards?visibility==public&anonymous==false&publishedAt!=null']);
  });

  it('names each card in both locales with hreflang, dated by its last edit', async () => {
    fake = fakeAdminDb({
      'cards/c1': card({ slug: 'edited-later', updatedAt: at('2026-09-10T12:00:00Z') }),
      'cards/c2': card({ slug: 'never-edited', publishedAt: at('2026-08-01T00:00:00Z') }),
      // An updatedAt the author's own write put there (not a server stamp) is no date.
      'cards/c3': card({ slug: 'odd-stamp', publishedAt: at('2026-07-01T00:00:00Z'), updatedAt: at('2099-01-01T00:00:00Z') }),
      'cards/c4': card({ slug: 'odd-string', publishedAt: at('2026-06-01T00:00:00Z'), updatedAt: 'yesterday' }),
    });
    const entries = (await sitemap()).filter((e) => e.url.includes('/card/'));
    expect(entries.map((e) => [e.url, (e.lastModified as Date).toISOString()])).toEqual([
      [`${BASE}/en/card/edited-later`, '2026-09-10T12:00:00.000Z'],
      [`${BASE}/zh-TW/card/edited-later`, '2026-09-10T12:00:00.000Z'],
      [`${BASE}/en/card/never-edited`, '2026-08-01T00:00:00.000Z'],
      [`${BASE}/zh-TW/card/never-edited`, '2026-08-01T00:00:00.000Z'],
      [`${BASE}/en/card/odd-stamp`, '2026-07-01T00:00:00.000Z'],
      [`${BASE}/zh-TW/card/odd-stamp`, '2026-07-01T00:00:00.000Z'],
      [`${BASE}/en/card/odd-string`, '2026-06-01T00:00:00.000Z'],
      [`${BASE}/zh-TW/card/odd-string`, '2026-06-01T00:00:00.000Z'],
    ]);
    expect(entries[1].alternates).toEqual({
      languages: { en: `${BASE}/en/card/edited-later`, 'zh-TW': `${BASE}/zh-TW/card/edited-later` },
    });
  });

  it('keeps the XML well-formed whatever a slug holds (Next writes URLs into it unescaped)', async () => {
    fake = fakeAdminDb({ 'cards/c1': card({ slug: 'q&a-<night>' }) });
    const xml = resolveSitemap(await sitemap());
    expect(xml).toContain(`<loc>${BASE}/en/card/q%26a-%3Cnight%3E</loc>`);
    expect(xml).toContain(`<xhtml:link rel="alternate" hreflang="zh-TW" href="${BASE}/zh-TW/card/q%26a-%3Cnight%3E" />`);
    expect(xml).not.toMatch(/&(?!amp;|lt;|gt;|quot;|apos;)/);
  });

  it(`lists at most ${SITEMAP_MAX_CARDS} cards, the newest`, async () => {
    const docs: Record<string, Record<string, unknown>> = {};
    const start = Date.parse('2026-01-01T00:00:00Z');
    for (let i = 0; i < SITEMAP_MAX_CARDS + 5; i++) {
      docs[`cards/c${i}`] = card({ slug: `card-${i}`, publishedAt: Timestamp.fromMillis(start + i * 60_000) });
    }
    fake = fakeAdminDb(docs);
    const cards = (await urls()).filter((u) => u.startsWith(`${BASE}/en/card/`));
    expect(cards).toHaveLength(SITEMAP_MAX_CARDS);
    expect(cards[0]).toBe(`${BASE}/en/card/card-${SITEMAP_MAX_CARDS + 4}`);
    expect(cards).not.toContain(`${BASE}/en/card/card-4`);
  });

  it('still lists the pages when the cards cannot be read', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    failRead = true;
    expect(await urls()).toHaveLength(10);
    expect(error).toHaveBeenCalledWith('sitemap: card read failed', expect.any(Error));
  });

  it('is rebuilt at most hourly', () => {
    expect(revalidate).toBe(3600);
  });
});
