import { Timestamp } from 'firebase-admin/firestore';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeAdminDb, type FakeAdminDb } from '@/../test/fakeAdminDb';
import { LIMITS } from '@/lib/api/rateLimit';
import { unfurlCardLinks } from './cardLinks';
import { verifyImageSignature } from './imageProxy';
import { createPreviewMemo, type PreviewFetch } from './preview';
import type { SafeFetchResult } from './safeFetch';

// A card's story links → its stored previews, with the Admin Firestore and the
// fetch both faked: what is fetched, what is kept, what is written (and what
// never is: the card's dates), and every way it gives up quietly. The same
// against the emulator, through publish and apply: apiV1Publish/apiV1Edits.

const page = (url: string, title: string | null, image = true): SafeFetchResult => ({
  url,
  status: 200,
  contentType: 'text/html',
  charset: 'utf-8',
  body: Buffer.from(
    `<head>${title ? `<meta property="og:title" content="${title}">` : ''}<meta property="og:site_name" content="Example">${
      image ? `<meta property="og:image" content="https://cdn.example.com${new URL(url).pathname}.jpg">` : ''
    }</head>`,
  ),
  truncated: false,
});

/** A fetch that titles every page after its path, remembering what it was asked. */
function sites(overrides: Record<string, () => Promise<SafeFetchResult>> = {}) {
  const asked: string[] = [];
  const fetch = vi.fn<PreviewFetch>(async (url) => {
    asked.push(url);
    return overrides[url] ? overrides[url]() : page(url, `Title of ${new URL(url).pathname}`);
  });
  return { fetch, asked };
}

const UPDATED = Timestamp.fromMillis(1_700_000_000_000);
const EXCERPT_AT = Timestamp.fromMillis(1_700_000_000_000);

let store: FakeAdminDb;
const card = () => store.docs['cards/c1'];
const published = (story: string, extra: Record<string, unknown> = {}) => ({
  authorId: 'alice',
  thoughtCore: 'A walk',
  story,
  visibility: 'public',
  publishedAt: Timestamp.fromMillis(1_690_000_000_000),
  updatedAt: UPDATED,
  excerptAt: EXCERPT_AT,
  excerpt: 'x',
  ...extra,
});
const unfurl = (deps: Parameters<typeof unfurlCardLinks>[2] = {}) => unfurlCardLinks(store.db, 'c1', { memo: createPreviewMemo(), ...deps });

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('unfurlCardLinks', () => {
  it("stores each standalone link's preview in reading order, and never the card's dates", async () => {
    store = fakeAdminDb({
      'cards/c1': published('開頭。\n\nhttps://example.com/b\n\n中間有 [一個行內連結](https://example.com/inline)。\n\n[第二篇](https://example.com/a)\n\n> <https://example.com/c>'),
    });
    const { fetch, asked } = sites();
    const result = await unfurl({ fetch });
    expect(result).toEqual({ links: 3, fetched: 3, previews: 3, written: true, overBudget: false });
    expect(asked.sort()).toEqual(['https://example.com/a', 'https://example.com/b', 'https://example.com/c']);

    expect(card().linkPreviewsFor).toEqual(['https://example.com/b', 'https://example.com/a', 'https://example.com/c']);
    const previews = card().linkPreviews as { url: string; title: string; siteName: string; image: string }[];
    expect(previews.map((p) => [p.url, p.title, p.siteName])).toEqual([
      ['https://example.com/b', 'Title of /b', 'Example'],
      ['https://example.com/a', 'Title of /a', 'Example'],
      ['https://example.com/c', 'Title of /c', 'Example'],
    ]);
    const image = new URL(previews[0].image, 'https://resonance.channel');
    expect(image.pathname).toBe('/api/link-image');
    expect(verifyImageSignature(image.searchParams.get('u')!, image.searchParams.get('s')!)).toBe(true);
    // A preview is not an edit: nothing a feed or a list goes by moves.
    expect(card().updatedAt).toBe(UPDATED);
    expect(card().excerptAt).toBe(EXCERPT_AT);
    // The author's budget paid for the three links fetched.
    expect(store.docs['rateLimits/alice_unfurl']).toMatchObject({ used: 3 });
  });

  it("gives a story's YouTube links their cards from YouTube's oEmbed answer (backlog 15)", async () => {
    store = fakeAdminDb({ 'cards/c1': published('一首歌。\n\nhttps://youtu.be/dQw4w9WgXcQ\n\n[另一首](https://www.youtube.com/watch?v=abcdefghijk)') });
    const fetch = vi.fn<PreviewFetch>(async (url, options) => {
      expect(options.mode).toBe('json');
      const id = new URL(new URL(url).searchParams.get('url')!).searchParams.get('v');
      const answer = { title: `Video ${id}`, author_name: 'A channel', thumbnail_url: `https://i.ytimg.com/vi/${id}/hqdefault.jpg` };
      return { url, status: 200, contentType: 'application/json', charset: null, body: Buffer.from(JSON.stringify(answer)), truncated: false };
    });
    const result = await unfurl({ fetch });
    expect(result).toMatchObject({ links: 2, previews: 2, written: true });
    expect(card().linkPreviews).toMatchObject([
      { url: 'https://youtu.be/dQw4w9WgXcQ', title: 'Video dQw4w9WgXcQ', description: 'A channel', siteName: 'YouTube' },
      { url: 'https://www.youtube.com/watch?v=abcdefghijk', title: 'Video abcdefghijk', siteName: 'YouTube' },
    ]);
    expect(fetch.mock.calls.every(([url]) => url.startsWith('https://www.youtube.com/oembed?'))).toBe(true);
  });

  it('reuses what is stored for links still in the story, drops the rest, and fetches only the new ones', async () => {
    const kept = { url: 'https://example.com/kept', title: 'Kept as it was' };
    const gone = { url: 'https://example.com/gone', title: 'No longer in the story' };
    store = fakeAdminDb({
      'cards/c1': published('https://example.com/new\n\nhttps://example.com/kept', {
        linkPreviews: [gone, kept],
        linkPreviewsFor: ['https://example.com/gone', 'https://example.com/kept'],
      }),
    });
    const { fetch, asked } = sites();
    expect(await unfurl({ fetch })).toMatchObject({ links: 2, fetched: 1, previews: 2, written: true });
    expect(asked).toEqual(['https://example.com/new']);
    expect(card().linkPreviews).toEqual([expect.objectContaining({ url: 'https://example.com/new', title: 'Title of /new' }), kept]);
    expect(card().linkPreviewsFor).toEqual(['https://example.com/new', 'https://example.com/kept']);
  });

  it('writes nothing when nothing changed, and fetches nothing', async () => {
    store = fakeAdminDb({ 'cards/c1': published('https://example.com/a') });
    await unfurl({ fetch: sites().fetch });
    const writes = store.writes.length;
    const { fetch } = sites();
    expect(await unfurl({ fetch })).toEqual({ links: 1, fetched: 0, previews: 1, written: false, overBudget: false });
    expect(fetch).not.toHaveBeenCalled();
    expect(store.writes).toHaveLength(writes);
  });

  it('keeps only the links of the story as it is when the previews are written (an edit saved meanwhile)', async () => {
    store = fakeAdminDb({ 'cards/c1': published('https://example.com/a\n\nhttps://example.com/b') });
    const { fetch } = sites({
      'https://example.com/a': async () => {
        // The author saves again while the pages are being fetched: /b goes, /c comes.
        card().story = 'https://example.com/a\n\nhttps://example.com/c';
        return page('https://example.com/a', 'Title of /a');
      },
    });
    await unfurl({ fetch });
    expect((card().linkPreviews as { url: string }[]).map((p) => p.url)).toEqual(['https://example.com/a']);
    // /c is the next unfurl's (the save that added it starts one).
    expect(card().linkPreviewsFor).toEqual(['https://example.com/a', 'https://example.com/c']);
  });

  it('remembers a link that said nothing as tried, without a preview', async () => {
    store = fakeAdminDb({ 'cards/c1': published('https://example.com/quiet\n\nhttps://example.com/a') });
    const { fetch } = sites({ 'https://example.com/quiet': async () => page('https://example.com/quiet', null) });
    expect(await unfurl({ fetch })).toMatchObject({ links: 2, previews: 1, written: true });
    expect((card().linkPreviews as { url: string }[]).map((p) => p.url)).toEqual(['https://example.com/a']);
    expect(card().linkPreviewsFor).toEqual(['https://example.com/quiet', 'https://example.com/a']);
  });

  it('removes both fields once the story has no standalone link left', async () => {
    store = fakeAdminDb({
      'cards/c1': published('只剩文字了。', {
        linkPreviews: [{ url: 'https://example.com/a', title: 'A' }],
        linkPreviewsFor: ['https://example.com/a'],
      }),
    });
    expect(await unfurl({ fetch: sites().fetch })).toMatchObject({ links: 0, written: true });
    expect(card()).not.toHaveProperty('linkPreviews');
    expect(card()).not.toHaveProperty('linkPreviewsFor');
    // And a story that never had one is not written at all.
    store = fakeAdminDb({ 'cards/c1': published('只是文字。') });
    expect(await unfurl({ fetch: sites().fetch })).toMatchObject({ written: false });
    expect(store.writes).toEqual([]);
  });

  it('fetches at most ten links, three at a time', async () => {
    store = fakeAdminDb({ 'cards/c1': published(Array.from({ length: 14 }, (_, i) => `https://example.com/${i}`).join('\n\n')) });
    let running = 0;
    let most = 0;
    const fetch = vi.fn<PreviewFetch>(async (url) => {
      most = Math.max(most, ++running);
      await new Promise((r) => setTimeout(r, 5));
      running--;
      return page(url, 'T');
    });
    expect(await unfurl({ fetch })).toMatchObject({ links: 10, fetched: 10, previews: 10 });
    expect(fetch).toHaveBeenCalledTimes(10);
    expect(most).toBe(3);
  });

  it('gives up on what is still loading at the deadline and stores what came', async () => {
    store = fakeAdminDb({ 'cards/c1': published('https://example.com/slow\n\nhttps://example.com/a') });
    const { fetch } = sites({ 'https://example.com/slow': () => new Promise<SafeFetchResult>(() => {}) });
    const started = Date.now();
    expect(await unfurl({ fetch, deadlineMs: 60 })).toMatchObject({ links: 2, previews: 1, written: true });
    expect(Date.now() - started).toBeLessThan(2000);
    expect((card().linkPreviews as { url: string }[]).map((p) => p.url)).toEqual(['https://example.com/a']);
  });

  it('never throws for a page: a fetch that fails unexpectedly just has no preview', async () => {
    store = fakeAdminDb({ 'cards/c1': published('https://example.com/broken\n\nhttps://example.com/a') });
    const { fetch } = sites({ 'https://example.com/broken': async () => Promise.reject(new TypeError('boom')) });
    expect(await unfurl({ fetch })).toMatchObject({ previews: 1, written: true });
  });

  it("over the author's budget, fetches nothing new (and still drops what the story lost)", async () => {
    store = fakeAdminDb({
      'cards/c1': published('https://example.com/new', {
        linkPreviews: [{ url: 'https://example.com/gone', title: 'Gone' }],
        linkPreviewsFor: ['https://example.com/gone'],
      }),
      'rateLimits/alice_unfurl': { userId: 'alice', bucket: 'unfurl', windowStart: Date.now(), used: LIMITS.unfurl.max },
    });
    const { fetch } = sites();
    expect(await unfurl({ fetch })).toMatchObject({ links: 1, fetched: 0, previews: 0, written: true, overBudget: true });
    expect(fetch).not.toHaveBeenCalled();
    expect(card().linkPreviews).toEqual([]);
    expect(card().linkPreviewsFor).toEqual(['https://example.com/new']);
  });

  it('charges nothing when told not to (the backfill)', async () => {
    store = fakeAdminDb({ 'cards/c1': published('https://example.com/a') });
    expect(await unfurl({ fetch: sites().fetch, charge: false })).toMatchObject({ previews: 1 });
    expect(store.docs).not.toHaveProperty('rateLimits/alice_unfurl');
  });

  it('leaves a draft, a missing card and a malformed id alone', async () => {
    store = fakeAdminDb({ 'cards/c1': published('https://example.com/a', { publishedAt: null }) });
    const { fetch } = sites();
    expect(await unfurl({ fetch })).toMatchObject({ written: false, links: 0 });
    expect(await unfurlCardLinks(store.db, 'missing', { fetch })).toMatchObject({ written: false });
    expect(await unfurlCardLinks(store.db, 'a/b', { fetch })).toMatchObject({ written: false });
    expect(fetch).not.toHaveBeenCalled();
    expect(store.writes).toEqual([]);
  });

  it('writes nothing for a card deleted while its links were being fetched', async () => {
    store = fakeAdminDb({ 'cards/c1': published('https://example.com/a') });
    const { fetch } = sites({
      'https://example.com/a': async () => {
        delete store.docs['cards/c1'];
        return page('https://example.com/a', 'A');
      },
    });
    expect(await unfurl({ fetch, charge: false })).toMatchObject({ written: false, links: 1 });
    expect(store.docs['cards/c1']).toBeUndefined();
  });

  it('keeps only what is safe to show of a stored preview (a picture from anywhere but our route goes)', async () => {
    store = fakeAdminDb({
      'cards/c1': published('https://example.com/a', {
        linkPreviews: [{ url: 'https://example.com/a', title: 'A', image: 'https://tracker.example/p.gif' }],
        linkPreviewsFor: ['https://example.com/a'],
      }),
    });
    await unfurl({ fetch: sites().fetch });
    expect(card().linkPreviews).toEqual([{ url: 'https://example.com/a', title: 'A' }]);
  });
});
