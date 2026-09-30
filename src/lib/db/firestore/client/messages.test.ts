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
vi.mock('firebase/firestore', () => ({
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

import {
  conversationId,
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
