import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- Firebase boundary mocks ------------------------------------------------
// The messages module is exercised against a mocked SDK: tests cover the pair
// id conventions and the send, which is one call to the server (the rules
// refuse conversation and message writes from the browser).
vi.mock('./init', () => ({ getClientDb: vi.fn(() => ({})) }));

type MockUser = { uid: string; getIdToken: () => Promise<string> };
const mockAuth = { currentUser: { uid: 'bbb', getIdToken: async () => 'id-token' } as MockUser | null };
vi.mock('@/lib/auth/firebase/client', () => ({
  getFirebaseClientAuth: vi.fn(() => mockAuth),
}));

const batch = { set: vi.fn(), update: vi.fn(), commit: vi.fn() };
// Query pieces come back as plain descriptions, so a test can read the query a read was made with.
vi.mock('firebase/firestore/lite', () => ({
  collection: vi.fn((_db: unknown, ...path: string[]) => ({ collection: path.join('/') })),
  doc: vi.fn((_db: unknown, ...path: string[]) => ({ id: 'new-doc', path: path.join('/') })),
  documentId: vi.fn(() => '__name__'),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  increment: vi.fn((n: number) => ({ __increment: n })),
  limit: vi.fn((n: number) => ({ limit: n })),
  onSnapshot: vi.fn(),
  orderBy: vi.fn((field: string, dir: string) => ({ orderBy: [field, dir] })),
  query: vi.fn((ref: unknown, ...parts: unknown[]) => ({ ref, parts })),
  serverTimestamp: vi.fn(() => ({ __serverTimestamp: true })),
  setDoc: vi.fn(),
  startAfter: vi.fn((...values: unknown[]) => ({ startAfter: values })),
  Timestamp: class {
    constructor(
      readonly seconds: number,
      readonly nanoseconds: number,
    ) {}
  },
  updateDoc: vi.fn(),
  where: vi.fn(),
  writeBatch: vi.fn(() => batch),
}));

// The open thread's listener (the full SDK, loaded on demand).
type Listened = { id: string; data: Record<string, unknown> };
const listener = vi.hoisted(() => ({
  onDocs: null as ((docs: Listened[], meta?: { fromCache: boolean }) => void) | null,
  stop: vi.fn(),
  listenNewest: vi.fn(),
}));
vi.mock('./realtime', () => ({ listenNewest: listener.listenNewest }));

import { getDoc, getDocs } from 'firebase/firestore/lite';
import {
  conversationId,
  getConversation,
  getOlderMessages,
  listenConversations,
  listenThread,
  otherParticipant,
  sendMessage,
  type ThreadWindow,
} from './messages';

const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) =>
  new Response(JSON.stringify({ conversationId: 'aaa_bbb', id: 'm1' }), { status: 201 }),
);
vi.stubGlobal('fetch', fetchMock);
const sent = () => JSON.parse(String(fetchMock.mock.calls[0][1]?.body));

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.currentUser = { uid: 'bbb', getIdToken: async () => 'id-token' };
  fetchMock.mockClear();
});

describe('pair id conventions', () => {
  it('sorts the two uids into the connection pair id', () => {
    expect(conversationId('bbb', 'aaa')).toBe('aaa_bbb');
    expect(conversationId('aaa', 'bbb')).toBe('aaa_bbb');
  });

  it('resolves the other participant from either side', () => {
    expect(otherParticipant('aaa_bbb', 'bbb')).toBe('aaa');
    expect(otherParticipant('aaa_bbb', 'aaa')).toBe('bbb');
  });
});

describe('sendMessage', () => {
  it('sends through the API to the person, trimmed, with the ID token', async () => {
    await expect(sendMessage('aaa', '  hello there  ')).resolves.toEqual({ conversationId: 'aaa_bbb', id: 'm1' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/v1/messages');
    expect(init?.method).toBe('POST');
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer id-token');
    expect(sent()).toEqual({ to: 'aaa', text: 'hello there', cardRef: null, noteRef: null, replyTo: null, clientId: null });
    expect(batch.commit).not.toHaveBeenCalled();
  });

  it('rejects empty and over-length messages without sending', async () => {
    await expect(sendMessage('aaa', '   ')).rejects.toThrow();
    await expect(sendMessage('aaa', 'x'.repeat(2001))).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('attaches a shared card and a note reply', async () => {
    await sendMessage('aaa', '', { cardRef: 'card-1', noteRef: { cardId: 'card-9', noteId: 'note-9' } });
    expect(sent()).toEqual({
      to: 'aaa',
      text: '',
      cardRef: 'card-1',
      noteRef: { cardId: 'card-9', noteId: 'note-9' },
      replyTo: null,
      clientId: null,
    });
  });

  it('names the message it answers and the id it was written under', async () => {
    await sendMessage('aaa', 'yes', { replyTo: 'm7', clientId: 'Abcdefghij0123456789' });
    expect(sent()).toMatchObject({ text: 'yes', replyTo: 'm7', clientId: 'Abcdefghij0123456789' });
  });

  it('allows an empty body only when a card is attached', async () => {
    await expect(sendMessage('aaa', '   ')).rejects.toThrow();
    await expect(sendMessage('aaa', '   ', { cardRef: 'card-1' })).resolves.toBeTruthy();
  });

  it('sends only as the account that wrote it', async () => {
    await expect(sendMessage('aaa', 'hi', { as: 'someone-else' })).rejects.toThrow('Signed in as someone else');
    expect(fetchMock).not.toHaveBeenCalled();
    await expect(sendMessage('aaa', 'hi', { as: 'bbb' })).resolves.toBeTruthy();
  });

  it("surfaces the server's refusal (not connected, blocked)", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { code: 'forbidden', message: 'You can message people you are connected with.' } }), { status: 403 }),
    );
    await expect(sendMessage('aaa', 'hi')).rejects.toThrow('You can message people you are connected with.');
  });
});

describe('the listeners (thread, conversations)', () => {
  /** A Timestamp as the full SDK hands it over: not Lite's class, the same shape. */
  const fullSdkTimestamp = (iso: string, nanoseconds = 0) => ({
    seconds: Date.parse(iso) / 1000,
    nanoseconds,
    toDate: () => new Date(Date.parse(iso) + Math.floor(nanoseconds / 1e6)),
  });
  /** The messages of the window the listener reported, as heard (newest first). */
  const heardMessages = (heard: ReturnType<typeof vi.fn>, call = 0) =>
    (heard.mock.calls[call][0] as ThreadWindow).entries.map((e) => e.message);

  beforeEach(() => {
    listener.listenNewest.mockImplementation(
      (_path: string[], _field: string, _max: number, onDocs: (docs: Listened[], meta?: { fromCache: boolean }) => void) => {
        // An answer from the server unless a test says otherwise.
        listener.onDocs = (docs, meta = { fromCache: false }) => onDocs(docs, meta);
        return listener.stop;
      },
    );
  });

  it("hears a thread's newest messages at the times they were sent, each with where the page before it starts", async () => {
    const heard = vi.fn();
    listenThread('aaa_bbb', heard);
    await vi.waitFor(() => expect(listener.listenNewest).toHaveBeenCalled());
    expect(listener.listenNewest.mock.calls[0].slice(0, 3)).toEqual([['conversations', 'aaa_bbb', 'messages'], 'sentAt', 50]);

    listener.onDocs!(
      [
        { id: 'm2', data: { senderId: 'aaa', text: 'and you?', sentAt: fullSdkTimestamp('2026-09-01T08:05:00Z', 123_456_789) } },
        { id: 'm1', data: { senderId: 'bbb', text: 'hello', sentAt: fullSdkTimestamp('2026-09-01T08:00:00Z'), cardRef: 'walk' } },
      ],
      { fromCache: false },
    );
    const window = heard.mock.calls[0][0] as ThreadWindow;
    expect(window.fromCache).toBe(false);
    const messages = heardMessages(heard);
    expect(messages.map((m) => m.id)).toEqual(['m2', 'm1']);
    expect(messages[1]).toMatchObject({ senderId: 'bbb', text: 'hello', cardRef: 'walk' });
    expect(messages[1].sentAt.toISOString()).toBe('2026-09-01T08:00:00.000Z');
    expect(messages[0].sentAt.toISOString()).toBe('2026-09-01T08:05:00.123Z');
    // The cursor keeps the send time to the nanosecond, as Firestore orders by it.
    expect(window.entries[0].cursor).toEqual({ seconds: Date.parse('2026-09-01T08:05:00Z') / 1000, nanoseconds: 123_456_789, id: 'm2' });

    listener.onDocs!([], { fromCache: true });
    expect((heard.mock.calls[1][0] as ThreadWindow).fromCache).toBe(true);
  });

  it('carries a reply quote and a link preview, and drops a preview that is not safe to show', async () => {
    const heard = vi.fn();
    listenThread('aaa_bbb', heard);
    await vi.waitFor(() => expect(listener.listenNewest).toHaveBeenCalled());
    const sentAt = fullSdkTimestamp('2026-09-01T08:00:00Z');
    listener.onDocs!([
      {
        id: 'm3',
        data: {
          senderId: 'aaa',
          text: 'bad',
          sentAt,
          preview: { url: 'javascript:alert(1)', title: 'x' },
        },
      },
      {
        id: 'm2',
        data: {
          senderId: 'aaa',
          text: 'see https://example.com',
          sentAt,
          preview: { url: 'https://example.com/', title: 'Example', image: 'https://evil.test/p.png' },
        },
      },
      {
        id: 'm1',
        data: {
          senderId: 'bbb',
          text: 'yes',
          sentAt,
          replyTo: { id: 'm0', senderId: 'aaa', text: 'hello', cardRef: 'walk' },
          preview: { url: 'https://example.com/', title: 'Example', siteName: 'Ex', image: '/api/link-image?u=a&s=b' },
        },
      },
    ]);
    const messages = heardMessages(heard).reverse();
    expect(messages[0].replyTo).toEqual({ id: 'm0', senderId: 'aaa', text: 'hello', cardRef: 'walk' });
    expect(messages[0].preview).toMatchObject({ title: 'Example', siteName: 'Ex', image: '/api/link-image?u=a&s=b' });
    expect(messages[1].preview).toEqual({ url: 'https://example.com/', title: 'Example' });
    expect(messages[2].preview).toBeUndefined();
  });

  // A note left on a card lands in the thread as a message of its own kind; a kind this build doesn't know
  // is a plain message (the server may add others).
  it("hears a note as a note, and a kind it doesn't know as a plain message", async () => {
    const heard = vi.fn();
    listenThread('aaa_bbb', heard);
    await vi.waitFor(() => expect(listener.listenNewest).toHaveBeenCalled());
    const sentAt = fullSdkTimestamp('2026-09-01T08:00:00Z');
    listener.onDocs!([
      { id: 'later', data: { senderId: 'aaa', text: 'hm', sentAt, kind: 'sticker' } },
      { id: 'note-1', data: { senderId: 'aaa', text: 'Your walk stayed with me.', sentAt, cardRef: 'walk', kind: 'note' } },
    ]);
    const [later, note] = heardMessages(heard);
    expect(note).toMatchObject({ id: 'note-1', kind: 'note', cardRef: 'walk', text: 'Your walk stayed with me.' });
    expect(note.noteRef).toBeUndefined();
    expect(later.kind).toBeUndefined();
    expect('kind' in later).toBe(false);
  });

  // The header's unread badge and the messages list: one listener on the
  // viewer's own conversations (what the rules let them list), newest 50.
  it("hears the viewer's newest conversations, most recently active first", async () => {
    const heard = vi.fn();
    listenConversations('bbb', heard);
    await vi.waitFor(() => expect(listener.listenNewest).toHaveBeenCalled());
    const [path, field, max, , , filters] = listener.listenNewest.mock.calls[0];
    expect([path, field, max]).toEqual([['conversations'], 'updatedAt', 50]);
    expect(filters).toEqual([{ field: 'participants', op: 'array-contains', value: 'bbb' }]);

    listener.onDocs!([
      {
        id: 'aaa_bbb',
        data: {
          participants: ['aaa', 'bbb'],
          updatedAt: fullSdkTimestamp('2026-09-01T08:05:00Z'),
          lastMessage: { text: 'and you?', senderId: 'aaa', sentAt: fullSdkTimestamp('2026-09-01T08:05:00Z') },
          unread: { bbb: 2 },
        },
      },
    ]);
    const [conversations] = heard.mock.calls[0];
    expect(conversations[0]).toMatchObject({ id: 'aaa_bbb', unread: { bbb: 2 }, lastMessage: { text: 'and you?' } });
    expect(conversations[0].updatedAt.toISOString()).toBe('2026-09-01T08:05:00.000Z');
  });

  it('reads the page before a message by its send time to the nanosecond and its id, newest first', async () => {
    vi.mocked(getDocs).mockResolvedValueOnce({
      docs: [
        { id: 'm9', data: () => ({ senderId: 'aaa', text: 'older', sentAt: fullSdkTimestamp('2026-08-31T10:00:00Z', 5) }) },
        { id: 'm8', data: () => ({ senderId: 'bbb', text: 'oldest', sentAt: fullSdkTimestamp('2026-08-31T09:00:00Z') }) },
      ],
    } as never);
    const page = await getOlderMessages('aaa_bbb', { seconds: 1_788_000_000, nanoseconds: 42, id: 'm10' }, 100);

    const q = vi.mocked(getDocs).mock.calls[0][0] as unknown as { ref: unknown; parts: unknown[] };
    expect(q.ref).toEqual({ collection: 'conversations/aaa_bbb/messages' });
    expect(q.parts).toEqual([
      { orderBy: ['sentAt', 'desc'] },
      { orderBy: ['__name__', 'desc'] },
      { startAfter: [{ seconds: 1_788_000_000, nanoseconds: 42 }, 'm10'] },
      { limit: 100 },
    ]);
    expect(page.map((e) => [e.message.id, e.message.text, e.cursor.nanoseconds])).toEqual([
      ['m9', 'older', 5],
      ['m8', 'oldest', 0],
    ]);
  });

  it('throws a page read that failed (it is not the beginning of the conversation)', async () => {
    vi.mocked(getDocs).mockRejectedValueOnce(Object.assign(new Error('offline'), { code: 'unavailable' }));
    await expect(getOlderMessages('aaa_bbb', { seconds: 1, nanoseconds: 0, id: 'm1' }, 50)).rejects.toThrow('offline');
  });

  it('stops the listener, and never starts one when stopped before it loaded', async () => {
    const stop = listenThread('aaa_bbb', vi.fn());
    await vi.waitFor(() => expect(listener.listenNewest).toHaveBeenCalledTimes(1));
    stop();
    expect(listener.stop).toHaveBeenCalledTimes(1);

    listener.listenNewest.mockClear();
    listenThread('aaa_bbb', vi.fn())();
    await new Promise((r) => setTimeout(r, 10));
    expect(listener.listenNewest).not.toHaveBeenCalled();
  });
});

describe('a conversation read once', () => {
  const snap = (data: Record<string, unknown>) => ({ exists: () => true, id: 'aaa_bbb', data: () => data });

  // Whose turn it is in a thread between two people who aren't connected: the letter's writer waits, the other
  // answers it.
  it('carries the letter waiting in it, and reads one written oddly as none', async () => {
    vi.mocked(getDoc).mockResolvedValueOnce(
      snap({ participants: ['aaa', 'bbb'], unread: {}, request: { from: 'aaa', cardId: 'walk', count: 2, at: {} } }) as never,
    );
    expect((await getConversation('aaa_bbb'))?.request).toEqual({ from: 'aaa', cardId: 'walk', count: 2 });

    vi.mocked(getDoc).mockResolvedValueOnce(snap({ participants: ['aaa', 'bbb'], unread: {}, request: { from: '', count: 1 } }) as never);
    expect((await getConversation('aaa_bbb'))?.request).toBeUndefined();
    vi.mocked(getDoc).mockResolvedValueOnce(snap({ participants: ['aaa', 'bbb'], unread: {} }) as never);
    expect((await getConversation('aaa_bbb'))?.request).toBeUndefined();
    vi.mocked(getDoc).mockResolvedValueOnce(snap({ participants: ['aaa', 'bbb'], unread: {}, request: { from: 'bbb', count: 'x' } }) as never);
    expect((await getConversation('aaa_bbb'))?.request).toEqual({ from: 'bbb', cardId: undefined, count: 0 });
  });
});
