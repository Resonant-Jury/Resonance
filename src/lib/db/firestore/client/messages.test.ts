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
vi.mock('firebase/firestore/lite', () => ({
  collection: vi.fn(),
  doc: vi.fn((_db: unknown, ...path: string[]) => ({ id: 'new-doc', path: path.join('/') })),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  increment: vi.fn((n: number) => ({ __increment: n })),
  limit: vi.fn(),
  onSnapshot: vi.fn(),
  orderBy: vi.fn(),
  query: vi.fn(),
  serverTimestamp: vi.fn(() => ({ __serverTimestamp: true })),
  setDoc: vi.fn(),
  Timestamp: class {},
  updateDoc: vi.fn(),
  where: vi.fn(),
  writeBatch: vi.fn(() => batch),
}));

// The open thread's listener (the full SDK, loaded on demand).
type Listened = { id: string; data: Record<string, unknown> };
const listener = vi.hoisted(() => ({
  onDocs: null as ((docs: Listened[]) => void) | null,
  stop: vi.fn(),
  listenNewest: vi.fn(),
}));
vi.mock('./realtime', () => ({ listenNewest: listener.listenNewest }));

import {
  conversationId,
  listenConversations,
  listenThread,
  otherParticipant,
  sendMessage,
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
    expect(sent()).toEqual({ to: 'aaa', text: 'hello there', cardRef: null, noteRef: null });
    expect(batch.commit).not.toHaveBeenCalled();
  });

  it('rejects empty and over-length messages without sending', async () => {
    await expect(sendMessage('aaa', '   ')).rejects.toThrow();
    await expect(sendMessage('aaa', 'x'.repeat(2001))).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('attaches a shared card and a note reply', async () => {
    await sendMessage('aaa', '', { cardRef: 'card-1', noteRef: { cardId: 'card-9', noteId: 'note-9' } });
    expect(sent()).toEqual({ to: 'aaa', text: '', cardRef: 'card-1', noteRef: { cardId: 'card-9', noteId: 'note-9' } });
  });

  it('allows an empty body only when a card is attached', async () => {
    await expect(sendMessage('aaa', '   ')).rejects.toThrow();
    await expect(sendMessage('aaa', '   ', { cardRef: 'card-1' })).resolves.toBeTruthy();
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
  const fullSdkTimestamp = (iso: string) => ({ seconds: Date.parse(iso) / 1000, nanoseconds: 0, toDate: () => new Date(iso) });

  beforeEach(() => {
    listener.listenNewest.mockImplementation(
      (_path: string[], _field: string, _max: number, onDocs: (docs: Listened[]) => void) => {
        listener.onDocs = onDocs;
        return listener.stop;
      },
    );
  });

  it("hears a thread's newest messages, oldest first, at the times they were sent", async () => {
    const heard = vi.fn();
    listenThread('aaa_bbb', heard);
    await vi.waitFor(() => expect(listener.listenNewest).toHaveBeenCalled());
    expect(listener.listenNewest.mock.calls[0].slice(0, 3)).toEqual([['conversations', 'aaa_bbb', 'messages'], 'sentAt', 50]);

    listener.onDocs!([
      { id: 'm2', data: { senderId: 'aaa', text: 'and you?', sentAt: fullSdkTimestamp('2026-09-01T08:05:00Z') } },
      { id: 'm1', data: { senderId: 'bbb', text: 'hello', sentAt: fullSdkTimestamp('2026-09-01T08:00:00Z'), cardRef: 'walk' } },
    ]);
    const [messages] = heard.mock.calls[0];
    expect(messages.map((m: { id: string }) => m.id)).toEqual(['m1', 'm2']);
    expect(messages[0]).toMatchObject({ senderId: 'bbb', text: 'hello', cardRef: 'walk' });
    expect(messages[0].sentAt.toISOString()).toBe('2026-09-01T08:00:00.000Z');
    expect(messages[1].sentAt.toISOString()).toBe('2026-09-01T08:05:00.000Z');
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
    const [messages] = heard.mock.calls[0];
    expect(messages[0].replyTo).toEqual({ id: 'm0', senderId: 'aaa', text: 'hello', cardRef: 'walk' });
    expect(messages[0].preview).toMatchObject({ title: 'Example', siteName: 'Ex', image: '/api/link-image?u=a&s=b' });
    expect(messages[1].preview).toEqual({ url: 'https://example.com/', title: 'Example' });
    expect(messages[2].preview).toBeUndefined();
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
