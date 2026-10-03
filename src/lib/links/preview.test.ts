import type { Firestore } from 'firebase-admin/firestore';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { verifyImageSignature } from './imageProxy';
import { REMEMBER_NO_PREVIEW_MS, REMEMBER_PREVIEW_MS, UNFURL_DEADLINE_MS, createPreviewMemo, fetchLinkPreview, unfurlMessage } from './preview';
import { SafeFetchError, type SafeFetchOptions, type SafeFetchResult } from './safeFetch';

// What a message gets from its link: the fetch is replaced by a fake that
// serves canned pages (the real one has its own suite), so these cover what is
// kept of a page, what is written, and everything that must leave a message
// alone.

type Fetch = (url: string, options: SafeFetchOptions) => Promise<SafeFetchResult>;

const pageOf = (html: string, url = 'https://example.com/post', charset: string | null = 'utf-8'): SafeFetchResult => ({
  url,
  status: 200,
  contentType: 'text/html',
  charset,
  body: Buffer.from(html),
  truncated: false,
});

const GOOD = `<html><head>
  <meta property="og:title" content="A rainy walk">
  <meta property="og:description" content="Notes from a walk after the rain.">
  <meta property="og:site_name" content="Example">
  <meta property="og:image" content="/img/cover.png">
</head><body></body></html>`;

let warn: ReturnType<typeof vi.spyOn>;
let error: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  error = vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('fetchLinkPreview', () => {
  it('turns a page into the card: title, description, site name and a signed picture path', async () => {
    const fetch = vi.fn<Fetch>(async () => pageOf(GOOD));
    const preview = (await fetchLinkPreview('https://example.com/post', { fetch }))!;
    expect(preview).toMatchObject({
      url: 'https://example.com/post',
      title: 'A rainy walk',
      description: 'Notes from a walk after the rain.',
      siteName: 'Example',
    });
    // The picture is ours: a relative path to the proxy, signed for the page's own image URL.
    const params = new URL(preview.image!, 'https://resonance.channel').searchParams;
    expect(preview.image!.startsWith('/api/link-image?')).toBe(true);
    expect(params.get('u')).toBe('https://example.com/img/cover.png');
    expect(verifyImageSignature(params.get('u')!, params.get('s')!)).toBe(true);
    expect(fetch).toHaveBeenCalledWith('https://example.com/post', expect.objectContaining({ mode: 'page' }));
  });

  it('keeps the link as it was written, though the page lives somewhere else, and finds its picture there', async () => {
    const fetch = vi.fn<Fetch>(async () => pageOf(GOOD, 'https://www.example.org/final/place'));
    const preview = (await fetchLinkPreview('https://short.example/x', { fetch }))!;
    expect(preview.url).toBe('https://short.example/x');
    const u = new URL(preview.image!, 'https://resonance.channel').searchParams.get('u');
    expect(u).toBe('https://www.example.org/img/cover.png');
  });

  it('leaves out what the page did not say, and has no picture without one', async () => {
    const fetch = vi.fn<Fetch>(async () => pageOf('<head><title>Only a title</title></head>'));
    expect(await fetchLinkPreview('https://example.com/', { fetch })).toEqual({ url: 'https://example.com/', title: 'Only a title' });
  });

  it('is nothing for a page without a title', async () => {
    const fetch = vi.fn<Fetch>(async () => pageOf('<head><meta property="og:image" content="/a.png"></head>'));
    expect(await fetchLinkPreview('https://example.com/', { fetch })).toBeNull();
    expect(await fetchLinkPreview('https://example.com/', { fetch: async () => pageOf('') })).toBeNull();
  });

  it('is nothing — and says why, but not where — for a page it may not or cannot fetch', async () => {
    for (const reason of ['blocked', 'timeout', 'dns', 'status', 'content_type', 'too_large', 'redirects', 'network'] as const) {
      const fetch = vi.fn<Fetch>(async () => {
        throw new SafeFetchError(reason);
      });
      expect(await fetchLinkPreview('https://private-looking.example/secret/path?token=abc', { fetch })).toBeNull();
    }
    expect(warn).toHaveBeenCalledTimes(8);
    const logged = JSON.stringify(warn.mock.calls);
    expect(logged).toContain('private-looking.example');
    expect(logged).not.toContain('/secret/path');
    expect(logged).not.toContain('token=abc');
  });

  it('does not swallow a fault of our own', async () => {
    const fetch = vi.fn<Fetch>(async () => {
      throw new TypeError('a bug');
    });
    await expect(fetchLinkPreview('https://example.com/', { fetch })).rejects.toThrow('a bug');
  });

  it('shows nothing of a page that tries to be more than text', async () => {
    const hostile = `<head>
      <title>&lt;img src=x onerror=alert(1)&gt;Free &lt;b&gt;gift&lt;/b&gt;&#8238;gnp.exe</title>
      <meta property="og:description" content="<script>alert(1)</script>Click &amp; win &#x202e;txt.exe javascript:alert(1)">
      <meta property="og:site_name" content="  Bank\u0000   of\n  Trust  ">
      <meta property="og:image" content="javascript:alert(1)">
      <meta property="og:image:secure_url" content="data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=">
      <meta property="og:image:url" content="https://user:pw@evil.example/a.png">
    </head>`;
    const preview = (await fetchLinkPreview('https://example.com/', { fetch: async () => pageOf(hostile) }))!;
    for (const text of [preview.title, preview.description!, preview.siteName!]) {
      expect(text).not.toMatch(/[<>\u202e\u0000\n]/);
    }
    expect(preview.title).toBe('Free gift gnp.exe');
    expect(preview.siteName).toBe('Bank of Trust');
    // No usable picture among the three: the card has none.
    expect(preview.image).toBeUndefined();
    expect(Object.keys(preview).sort()).toEqual(['description', 'siteName', 'title', 'url']);
  });

  it('goes without the picture rather than without the card when nothing can sign it', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('LINK_PREVIEW_SECRET', '');
    vi.stubEnv('FIREBASE_PRIVATE_KEY', '');
    vi.stubEnv('FIRESTORE_EMULATOR_HOST', '');
    const preview = (await fetchLinkPreview('https://example.com/post', { fetch: async () => pageOf(GOOD) }))!;
    expect(preview.title).toBe('A rainy walk');
    expect(preview.image).toBeUndefined();
    expect(error).toHaveBeenCalled();
  });
});

/** A Firestore with only the two calls the unfurl makes, over a map of paths. */
function stubDb(docs: Record<string, Record<string, unknown>>, updateError?: unknown) {
  const reads: string[] = [];
  const updates: { path: string; data: Record<string, unknown> }[] = [];
  const db = {
    doc: (path: string) => ({
      get: async () => {
        reads.push(path);
        const data = docs[path];
        return { exists: data !== undefined, get: (field: string) => data?.[field] };
      },
      update: async (data: Record<string, unknown>) => {
        if (updateError) throw updateError;
        updates.push({ path, data });
        docs[path] = { ...docs[path], ...data };
      },
    }),
  } as unknown as Firestore;
  return { db, docs, reads, updates };
}

const MESSAGE = 'conversations/alice_bob/messages/m1';

/** `unfurlMessage` with a memory of its own, so one case's links are not remembered by the next. */
const unfurl = (db: Firestore, conversationId: string, messageId: string, deps: Parameters<typeof unfurlMessage>[3] = {}) =>
  unfurlMessage(db, conversationId, messageId, { memo: createPreviewMemo(), ...deps });

describe('unfurlMessage', () => {
  it('writes the preview of the first link onto the message', async () => {
    const { db, docs, updates } = stubDb({ [MESSAGE]: { senderId: 'alice', text: '看看這個 https://example.com/post，很有趣' } });
    const fetch = vi.fn<Fetch>(async () => pageOf(GOOD));
    const preview = await unfurl(db, 'alice_bob', 'm1', { fetch });
    expect(preview).toMatchObject({ url: 'https://example.com/post', title: 'A rainy walk' });
    expect(updates).toHaveLength(1);
    expect(updates[0].path).toBe(MESSAGE);
    expect(Object.keys(updates[0].data)).toEqual(['preview']);
    expect(docs[MESSAGE].preview).toEqual(preview);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][0]).toBe('https://example.com/post');
  });

  it('previews a www. link as https, and only the first link', async () => {
    const { db } = stubDb({ [MESSAGE]: { text: 'www.example.com/a and https://other.example/b' } });
    const fetch = vi.fn<Fetch>(async () => pageOf(GOOD));
    await unfurl(db, 'alice_bob', 'm1', { fetch });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][0]).toBe('https://www.example.com/a');
  });

  it('skips a first link the rules refuse and previews the next', async () => {
    const { db } = stubDb({ [MESSAGE]: { text: 'http://localhost/admin then https://example.com/ok' } });
    const fetch = vi.fn<Fetch>(async () => pageOf(GOOD));
    await unfurl(db, 'alice_bob', 'm1', { fetch });
    expect(fetch.mock.calls.map((c) => c[0])).toEqual(['https://example.com/ok']);
  });

  it('does nothing for a message with no link, with only a link the rules refuse, or with no text', async () => {
    for (const text of ['just words', 'http://localhost/', 'https://user@evil.example/', 'javascript:alert(1)', 'http://10.0.0.1:8080/x', '', undefined]) {
      const { db, updates } = stubDb({ [MESSAGE]: { text } });
      const fetch = vi.fn<Fetch>(async () => pageOf(GOOD));
      expect(await unfurl(db, 'alice_bob', 'm1', { fetch }), String(text)).toBeNull();
      expect(fetch).not.toHaveBeenCalled();
      expect(updates).toHaveLength(0);
    }
  });

  it('does nothing for a message that is gone, or that already has its preview (a second run, a retry)', async () => {
    const gone = stubDb({});
    const fetch = vi.fn<Fetch>(async () => pageOf(GOOD));
    expect(await unfurl(gone.db, 'alice_bob', 'm1', { fetch })).toBeNull();

    const done = stubDb({ [MESSAGE]: { text: 'https://example.com/', preview: { url: 'https://example.com/', title: 'Already' } } });
    expect(await unfurl(done.db, 'alice_bob', 'm1', { fetch })).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
    expect(done.updates).toHaveLength(0);
  });

  it('touches only the one message it was asked for: ids that are not ids read nothing', async () => {
    const { db, reads } = stubDb({ [MESSAGE]: { text: 'https://example.com/' } });
    const fetch = vi.fn<Fetch>(async () => pageOf(GOOD));
    for (const [conversation, message] of [['alice_bob/../../users/alice', 'm1'], ['alice_bob', 'm1/../../x'], ['', 'm1'], ['alice_bob', ''], ['a b', 'm1'], ['alice_bob', 'x'.repeat(129)]]) {
      expect(await unfurl(db, conversation, message, { fetch })).toBeNull();
    }
    expect(reads).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('writes nothing for a page with no title or one it cannot fetch', async () => {
    const empty = stubDb({ [MESSAGE]: { text: 'https://example.com/' } });
    expect(await unfurl(empty.db, 'alice_bob', 'm1', { fetch: async () => pageOf('<head></head>') })).toBeNull();
    expect(empty.updates).toHaveLength(0);

    const refused = stubDb({ [MESSAGE]: { text: 'https://example.com/' } });
    const fetch = async (): Promise<SafeFetchResult> => {
      throw new SafeFetchError('blocked');
    };
    expect(await unfurl(refused.db, 'alice_bob', 'm1', { fetch })).toBeNull();
    expect(refused.updates).toHaveLength(0);
  });

  it('lets a message deleted meanwhile go without a preview, but not hide other failures', async () => {
    const notFound = Object.assign(new Error('NOT_FOUND'), { code: 5 });
    const deleted = stubDb({ [MESSAGE]: { text: 'https://example.com/' } }, notFound);
    expect(await unfurl(deleted.db, 'alice_bob', 'm1', { fetch: async () => pageOf(GOOD) })).toBeNull();

    const broken = stubDb({ [MESSAGE]: { text: 'https://example.com/' } }, Object.assign(new Error('UNAVAILABLE'), { code: 14 }));
    await expect(unfurl(broken.db, 'alice_bob', 'm1', { fetch: async () => pageOf(GOOD) })).rejects.toThrow('UNAVAILABLE');
  });

  it(`gives the fetch a deadline of ${UNFURL_DEADLINE_MS} ms at most, and stops when the caller does`, async () => {
    expect(UNFURL_DEADLINE_MS).toBeLessThanOrEqual(8000);
    const { db, updates } = stubDb({ [MESSAGE]: { text: 'https://example.com/slow' } });
    let seen: AbortSignal | undefined;
    const slow = vi.fn<Fetch>(
      (_url, options) =>
        new Promise((_resolve, reject) => {
          seen = options.signal;
          options.signal?.addEventListener('abort', () => reject(new SafeFetchError('timeout')));
        }),
    );
    const caller = new AbortController();
    const started = unfurl(db, 'alice_bob', 'm1', { fetch: slow, signal: caller.signal });
    await vi.waitFor(() => expect(seen).toBeDefined());
    expect(seen!.aborted).toBe(false);
    caller.abort();
    expect(await started).toBeNull();
    expect(seen!.aborted).toBe(true);
    expect(updates).toHaveLength(0);
  });
  describe('a link sent again', () => {
    const two = () => stubDb({ 'conversations/alice_bob/messages/m1': { text: 'https://example.com/post' }, 'conversations/alice_bob/messages/m2': { text: 'again https://example.com/post' } });

    it('is fetched from its site once, however many messages carry it', async () => {
      const { db, updates } = two();
      const memo = createPreviewMemo();
      const fetch = vi.fn<Fetch>(async () => pageOf(GOOD));
      const a = await unfurlMessage(db, 'alice_bob', 'm1', { fetch, memo });
      const b = await unfurlMessage(db, 'alice_bob', 'm2', { fetch, memo });
      expect(fetch).toHaveBeenCalledTimes(1);
      // Both messages still get their card.
      expect(b).toEqual(a);
      expect(updates.map((u) => u.path)).toEqual(['conversations/alice_bob/messages/m1', 'conversations/alice_bob/messages/m2']);
    });

    it('shares one fetch among messages that arrive together', async () => {
      const { db } = two();
      const memo = createPreviewMemo();
      let release!: () => void;
      const fetch = vi.fn<Fetch>(async () => {
        await new Promise<void>((resolve) => (release = resolve));
        return pageOf(GOOD);
      });
      const both = Promise.all([unfurlMessage(db, 'alice_bob', 'm1', { fetch, memo }), unfurlMessage(db, 'alice_bob', 'm2', { fetch, memo })]);
      await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
      release();
      expect((await both).map((p) => p?.title)).toEqual(['A rainy walk', 'A rainy walk']);
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it('is asked again after a while: a page that said nothing is forgotten sooner than one that did', async () => {
      let now = 5_000_000;
      const memo = createPreviewMemo({ now: () => now });
      const { db } = stubDb({
        'conversations/alice_bob/messages/m1': { text: 'https://example.com/empty' },
        'conversations/alice_bob/messages/m2': { text: 'https://example.com/empty' },
        'conversations/alice_bob/messages/m3': { text: 'https://example.com/post' },
        'conversations/alice_bob/messages/m4': { text: 'https://example.com/post' },
        'conversations/alice_bob/messages/m5': { text: 'https://example.com/post' },
      });
      const fetch = vi.fn<Fetch>(async (url) => pageOf(url.endsWith('/empty') ? '<head></head>' : GOOD));

      await unfurlMessage(db, 'alice_bob', 'm1', { fetch, memo });
      await unfurlMessage(db, 'alice_bob', 'm3', { fetch, memo });
      expect(fetch).toHaveBeenCalledTimes(2);

      now += REMEMBER_NO_PREVIEW_MS + 1; // the empty page is forgotten, the good one is not
      await unfurlMessage(db, 'alice_bob', 'm2', { fetch, memo });
      await unfurlMessage(db, 'alice_bob', 'm4', { fetch, memo });
      expect(fetch.mock.calls.map((c) => c[0])).toEqual(['https://example.com/empty', 'https://example.com/post', 'https://example.com/empty']);

      now += REMEMBER_PREVIEW_MS; // now the good one is too
      await unfurlMessage(db, 'alice_bob', 'm5', { fetch, memo });
      expect(fetch).toHaveBeenCalledTimes(4);
    });

    it('is not remembered when the fetch broke in a way that says nothing about the page', async () => {
      const { db } = two();
      const memo = createPreviewMemo();
      const fetch = vi.fn<Fetch>().mockRejectedValueOnce(new Error('out of memory')).mockResolvedValue(pageOf(GOOD));
      await expect(unfurlMessage(db, 'alice_bob', 'm1', { fetch, memo })).rejects.toThrow('out of memory');
      expect((await unfurlMessage(db, 'alice_bob', 'm2', { fetch, memo }))?.title).toBe('A rainy walk');
    });
  });
});
