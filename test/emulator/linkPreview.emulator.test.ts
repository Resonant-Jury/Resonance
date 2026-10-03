import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, Timestamp, type Firestore } from 'firebase-admin/firestore';
import { sendMessage } from '@/lib/api/v1/conversations';
import { createPreviewMemo, unfurlMessage as unfurlWith } from '@/lib/links/preview';
import { verifyImageSignature } from '@/lib/links/imageProxy';
import type { SafeFetchResult } from '@/lib/links/safeFetch';

// A message's link preview against the Firestore emulator: written onto the
// message by `unfurlMessage` (the fetch is a fake — the real one has its own
// suite), leaving the rest of the message and its conversation as they were.

const PROJECT = 'demo-resonance-link-preview';
let app: App;
let db: Firestore;

beforeAll(() => {
  process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
  app = initializeApp({ projectId: PROJECT }, 'link-preview-test');
  db = getFirestore(app);
});

afterAll(async () => {
  await deleteApp(app);
});

beforeEach(async () => {
  await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, {
    method: 'DELETE',
  });
  await Promise.all(['alice', 'bob'].map((id) => db.doc(`users/${id}`).set({ handle: id, handleLower: id })));
  await db.doc('connections/alice_bob').set({ userIds: ['alice', 'bob'], establishedAt: Timestamp.now() });
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

const page = (html: string, url = 'https://example.com/post'): SafeFetchResult => ({
  url,
  status: 200,
  contentType: 'text/html',
  charset: 'utf-8',
  body: Buffer.from(html),
  truncated: false,
});

const PAGE = `<head>
  <meta property="og:title" content="A rainy walk">
  <meta property="og:description" content="Notes from a walk after the rain.">
  <meta property="og:site_name" content="Example">
  <meta property="og:image" content="https://cdn.example.com/cover.jpg">
</head>`;

// A memory of its own for every call, so what one case fetched is not remembered by the next.
const unfurlMessage = (...[database, conversationId, messageId, deps]: Parameters<typeof unfurlWith>) =>
  unfurlWith(database, conversationId, messageId, { memo: createPreviewMemo(), ...deps });

const messageAt = (id: string) => db.doc(`conversations/alice_bob/messages/${id}`);

describe('unfurlMessage', () => {
  it('writes the preview onto the message, and nothing else of it or of the conversation changes', async () => {
    const sent = await sendMessage(db, 'alice', { to: 'bob', text: '這篇很好 https://example.com/post，你看看' });
    const before = (await messageAt(sent.id).get()).data()!;
    const conversationBefore = (await db.doc('conversations/alice_bob').get()).data()!;
    expect(before).not.toHaveProperty('preview');

    const fetchPage = vi.fn(async () => page(PAGE));
    const preview = await unfurlMessage(db, sent.conversationId, sent.id, { fetch: fetchPage });
    expect(fetchPage).toHaveBeenCalledTimes(1);

    const after = (await messageAt(sent.id).get()).data()!;
    expect(after.preview).toEqual(preview);
    expect(after.preview).toMatchObject({
      url: 'https://example.com/post',
      title: 'A rainy walk',
      description: 'Notes from a walk after the rain.',
      siteName: 'Example',
    });
    const image = new URL(after.preview.image, 'https://resonance.channel');
    expect(image.pathname).toBe('/api/link-image');
    expect(image.searchParams.get('u')).toBe('https://cdn.example.com/cover.jpg');
    expect(verifyImageSignature(image.searchParams.get('u')!, image.searchParams.get('s')!)).toBe(true);

    const { preview: _written, ...rest } = after;
    expect(rest).toEqual(before);
    expect((await db.doc('conversations/alice_bob').get()).data()).toEqual(conversationBefore);
  });

  it('is done once: a message that has its preview is not fetched again', async () => {
    const sent = await sendMessage(db, 'alice', { to: 'bob', text: 'https://example.com/post' });
    const fetchPage = vi.fn(async () => page(PAGE));
    await unfurlMessage(db, sent.conversationId, sent.id, { fetch: fetchPage });
    await unfurlMessage(db, sent.conversationId, sent.id, { fetch: fetchPage });
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });

  it('leaves a message with no link, a refused link or a page without a title as it was', async () => {
    const plain = await sendMessage(db, 'alice', { to: 'bob', text: 'no link here' });
    const refused = await sendMessage(db, 'alice', { to: 'bob', text: 'http://localhost:3000/admin and https://user@evil.example/' });
    const untitled = await sendMessage(db, 'alice', { to: 'bob', text: 'https://example.com/blank' });
    const fetchPage = vi.fn(async () => page('<head></head>'));
    for (const sent of [plain, refused, untitled]) {
      expect(await unfurlMessage(db, sent.conversationId, sent.id, { fetch: fetchPage })).toBeNull();
      expect((await messageAt(sent.id).get()).data()).not.toHaveProperty('preview');
    }
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });

  it('writes nothing, and fails nothing, for a message deleted while its page was being fetched', async () => {
    const sent = await sendMessage(db, 'alice', { to: 'bob', text: 'https://example.com/post' });
    const slow = vi.fn(async () => {
      await messageAt(sent.id).delete();
      return page(PAGE);
    });
    expect(await unfurlMessage(db, sent.conversationId, sent.id, { fetch: slow })).toBeNull();
    // Not even a document with only a preview in it.
    expect((await messageAt(sent.id).get()).exists).toBe(false);
  });

  it('reads a message that is not there as nothing to do', async () => {
    const fetchPage = vi.fn(async () => page(PAGE));
    expect(await unfurlMessage(db, 'alice_bob', 'never-sent', { fetch: fetchPage })).toBeNull();
    expect(fetchPage).not.toHaveBeenCalled();
  });
});
