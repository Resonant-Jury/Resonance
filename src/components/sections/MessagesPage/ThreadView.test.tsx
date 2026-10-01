// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ReactNode } from 'react';
import { SWRConfig } from 'swr';
import { renderWithIntl, screen, waitFor } from '@/../test/render';
import type { FeedCardBody } from '@/lib/api/v1/schemas';
import type { Conversation, Message, User } from '@/lib/db/types';

// The cards shared in a thread, on the real data hooks: the realtime thread
// (useThread), the client read/write layer, the v1 API (callApi), auth and
// navigation are the module boundary.
const mockUseAuth = vi.fn();
vi.mock('@/components/providers/AuthProvider', () => ({ useAuth: () => mockUseAuth() }));
vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children, className }: { href: string; children: ReactNode; className?: string }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
const mockUseThread = vi.fn();
vi.mock('@/lib/data/hooks', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/data/hooks')>()),
  useThread: () => mockUseThread(),
}));
vi.mock('@/lib/db/firestore/client/api', () => ({ callApi: vi.fn(), ApiError: class extends Error {} }));
vi.mock('@/lib/db/firestore/client/reads', () => ({
  getUserByHandle: vi.fn(),
  isConnected: vi.fn(async () => true),
  getCardById: vi.fn(),
  getCardBySlugOrId: vi.fn(),
  getUserById: vi.fn(),
  resolveCardId: vi.fn(),
}));
vi.mock('@/lib/db/firestore/client/blocks', () => ({
  getMyBlockedIds: vi.fn(async () => new Set()),
  blockUser: vi.fn(),
  unblockUser: vi.fn(),
}));
vi.mock('@/lib/db/firestore/client/messages', () => ({
  MESSAGE_MAX_LENGTH: 2000,
  conversationId: (a: string, b: string) => [a, b].sort().join('_'),
  getConversation: vi.fn(),
  markConversationRead: vi.fn(async () => {}),
  sendMessage: vi.fn(),
  deleteConversation: vi.fn(),
}));
vi.mock('@/components/molecules/MarkdownEditor/InsertCardModal', () => ({ InsertCardModal: () => null }));

import { callApi } from '@/lib/db/firestore/client/api';
import { getCardById, getCardBySlugOrId, getUserByHandle, getUserById } from '@/lib/db/firestore/client/reads';
import { getConversation } from '@/lib/db/firestore/client/messages';
import { ThreadView } from './ThreadView';

const alice: User = {
  id: 'alice',
  handle: 'alice',
  region: 'TW',
  primaryLocale: 'en',
  autoTranslateTo: [],
  verified: false,
  phoneHash: '',
  avatarSeed: '7',
  initials: 'AL',
  accentColor: 'x',
  joinedAt: new Date('2025-01-01'),
  handleChangedAt: new Date('2025-01-01'),
};
const conversation: Conversation = {
  id: 'alice_me',
  participants: ['alice', 'me'],
  createdAt: new Date(),
  updatedAt: new Date(),
  lastMessage: { text: 'hi', senderId: 'alice', sentAt: new Date() },
  unread: { me: 0, alice: 0 },
};

function message(id: string, cardRef?: string): Message {
  return { id, senderId: 'alice', text: cardRef ? '' : 'hello', sentAt: new Date('2026-03-01T10:00:00Z'), ...(cardRef ? { cardRef } : {}) };
}

function summary(id: string, title: string, extra: Partial<FeedCardBody> = {}): FeedCardBody {
  return {
    id,
    slug: `${id}-slug`,
    title,
    excerpt: '',
    tags: [],
    publishedAt: '2026-02-01T00:00:00.000Z',
    author: { id: 'w', handle: 'writer', initials: 'W', accentColor: 'x', avatarUrl: null, avatarSeed: '3', verified: false, region: null },
    anonymous: false,
    visibility: 'public',
    imageUrl: null,
    imageLabel: null,
    accentHue: null,
    readMinutes: 1,
    referenceCardId: null,
    reason: null,
    ...extra,
  };
}

function thread() {
  return (
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <ThreadView handle="alice" />
    </SWRConfig>
  );
}

beforeEach(() => {
  mockUseAuth.mockReturnValue({ user: { id: 'me' }, loading: false });
  vi.mocked(getUserByHandle).mockResolvedValue(alice);
  vi.mocked(getConversation).mockResolvedValue(conversation);
});
afterEach(() => vi.clearAllMocks());

describe('cards shared in a thread', () => {
  it('come in one request for the whole thread, each card once, instead of one read each', async () => {
    mockUseThread.mockReturnValue({
      messages: [message('m1', 'c1'), message('m2', 'c2'), message('m3'), message('m4', 'c1'), message('m5', 'gone')],
      ready: true,
      error: null,
    });
    vi.mocked(callApi).mockResolvedValue({ cards: [summary('c1', 'A walk at dawn'), summary('c2', 'An unsigned letter', { anonymous: true, author: null })] });

    renderWithIntl(thread());

    expect(await screen.findAllByText('A walk at dawn')).toHaveLength(2);
    expect(screen.getByText('An unsigned letter')).toBeInTheDocument();
    // An anonymous card's byline stays unsaid; a card the viewer can't read isn't drawn.
    expect(screen.getAllByText('writer')).toHaveLength(2);
    expect(screen.getAllByRole('link', { name: /A walk at dawn/ })[0]).toHaveAttribute('href', '/card/c1-slug');

    expect(callApi).toHaveBeenCalledTimes(1);
    expect(callApi).toHaveBeenCalledWith('/api/v1/cards?keys=c1,c2,gone');
    expect(getCardById).not.toHaveBeenCalled();
    expect(getCardBySlugOrId).not.toHaveBeenCalled();
  });

  it('lets each shared card read its own when the request fails — even after an earlier list came through', async () => {
    mockUseThread.mockReturnValue({ messages: [message('m1', 'c1')], ready: true, error: null });
    vi.mocked(callApi).mockResolvedValueOnce({ cards: [summary('c1', 'A walk at dawn')] });
    const view = renderWithIntl(thread());
    expect(await screen.findByText('A walk at dawn')).toBeInTheDocument();

    // Another card is shared, and the request for the new list fails.
    vi.mocked(callApi).mockRejectedValue(new Error('offline'));
    vi.mocked(getCardBySlugOrId).mockImplementation(async (key: string) => ({
      id: key,
      authorId: 'alice',
      slug: `${key}-slug`,
      thoughtCore: `Card ${key}, read by itself`,
      story: 'story',
      tags: [],
      originalLocale: 'en',
      translations: {},
      visibility: 'public',
      publishedAt: new Date('2026-02-01'),
      readCount: 0,
      resonanceCount: 0,
      inviteCount: 0,
    }));
    vi.mocked(getUserById).mockResolvedValue(alice);
    mockUseThread.mockReturnValue({ messages: [message('m1', 'c1'), message('m2', 'c2')], ready: true, error: null });
    view.rerender(thread());

    expect(await screen.findByText('Card c2, read by itself')).toBeInTheDocument();
    expect(getCardBySlugOrId).toHaveBeenCalledWith('c2');
  });

  it('keeps the cards it has on screen while a newly shared one loads', async () => {
    mockUseThread.mockReturnValue({ messages: [message('m1', 'c1')], ready: true, error: null });
    vi.mocked(callApi).mockResolvedValueOnce({ cards: [summary('c1', 'A walk at dawn')] });
    const view = renderWithIntl(thread());
    expect(await screen.findByText('A walk at dawn')).toBeInTheDocument();

    // A new message shares another card; its preview is still on the way.
    vi.mocked(callApi).mockReturnValueOnce(new Promise(() => {}));
    mockUseThread.mockReturnValue({ messages: [message('m1', 'c1'), message('m2', 'c2')], ready: true, error: null });
    view.rerender(thread());
    await waitFor(() => expect(callApi).toHaveBeenCalledWith('/api/v1/cards?keys=c1,c2'));
    expect(screen.getByText('A walk at dawn')).toBeInTheDocument();
  });
});
