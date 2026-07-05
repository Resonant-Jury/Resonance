import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- Firebase boundary mocks ------------------------------------------------
// The messages module is exercised against a mocked SDK: tests cover the pair
// id conventions, the lazy/idempotent conversation open, and the send batch
// (message doc + denormalized preview + the *other* side's unread counter).
vi.mock('./init', () => ({ getClientDb: vi.fn(() => ({})) }));

const mockAuth = { currentUser: { uid: 'bbb' } as { uid: string } | null };
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

import { getDoc, setDoc } from 'firebase/firestore';
import {
  conversationId,
  otherParticipant,
  openConversation,
  sendMessage,
} from './messages';

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.currentUser = { uid: 'bbb' };
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

describe('openConversation', () => {
  it('creates the doc with sorted participants and zeroed unread counters', async () => {
    vi.mocked(getDoc).mockResolvedValue({ exists: () => false } as never);
    await expect(openConversation('aaa')).resolves.toBe('aaa_bbb');
    expect(setDoc).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        participants: ['aaa', 'bbb'],
        lastMessage: null,
        unread: { aaa: 0, bbb: 0 },
      }),
    );
  });

  it('is idempotent — an existing conversation is not rewritten', async () => {
    vi.mocked(getDoc).mockResolvedValue({ exists: () => true } as never);
    await expect(openConversation('aaa')).resolves.toBe('aaa_bbb');
    expect(setDoc).not.toHaveBeenCalled();
  });

  it('refuses to open a conversation with yourself', async () => {
    await expect(openConversation('bbb')).rejects.toThrow();
  });
});

describe('sendMessage', () => {
  it('writes the message and bumps only the recipient unread counter', async () => {
    await sendMessage('aaa_bbb', '  hello there  ');
    expect(batch.set).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ senderId: 'bbb', text: 'hello there' }),
    );
    expect(batch.update).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        'unread.aaa': { __increment: 1 },
        lastMessage: expect.objectContaining({ text: 'hello there', senderId: 'bbb' }),
      }),
    );
    expect(batch.commit).toHaveBeenCalled();
  });

  it('rejects empty and over-length messages without writing', async () => {
    await expect(sendMessage('aaa_bbb', '   ')).rejects.toThrow();
    await expect(sendMessage('aaa_bbb', 'x'.repeat(2001))).rejects.toThrow();
    expect(batch.commit).not.toHaveBeenCalled();
  });

  it('truncates the denormalized list preview to 120 chars', async () => {
    const long = 'y'.repeat(500);
    await sendMessage('aaa_bbb', long);
    const update = vi.mocked(batch.update).mock.calls[0][1] as {
      lastMessage: { text: string };
    };
    expect(update.lastMessage.text).toHaveLength(120);
    // The message itself keeps the full text.
    expect(batch.set).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ text: long }),
    );
  });
});
