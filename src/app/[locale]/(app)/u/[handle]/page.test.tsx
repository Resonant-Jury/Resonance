// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ReactNode } from 'react';
import { SWRConfig } from 'swr';
import { renderWithIntl, screen, userEvent } from '@/../test/render';
import type { Card, User } from '@/lib/db/types';

// The public profile page on its real data hooks; the client read layer, the
// v1 API (callApi), the viewer's blocks and auth are the module boundary.
const mockUseAuth = vi.fn();
const mockPush = vi.fn();
vi.mock('@/components/providers/AuthProvider', () => ({ useAuth: () => mockUseAuth() }));
vi.mock('next/navigation', () => ({ useParams: () => ({ handle: 'bob' }) }));
vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children, className }: { href: string; children: ReactNode; className?: string }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
  useRouter: () => ({ push: mockPush, replace: vi.fn() }),
}));
vi.mock('@/lib/db/firestore/client/reads', () => ({
  getUserByHandle: vi.fn(),
  getPublicCardsByAuthor: vi.fn(),
  getCardById: vi.fn(),
  getUsersByIds: vi.fn(),
  isConnected: vi.fn(),
}));
vi.mock('@/lib/db/firestore/client/blocks', () => ({
  getMyBlockedIds: vi.fn(),
  blockUser: vi.fn(),
  unblockUser: vi.fn(),
}));
vi.mock('@/lib/db/firestore/client/api', () => {
  class ApiError extends Error {
    constructor(
      readonly status: number,
      readonly code: string,
      message: string,
    ) {
      super(message);
    }
  }
  return { callApi: vi.fn(), ApiError };
});

import {
  getCardById,
  getPublicCardsByAuthor,
  getUserByHandle,
  getUsersByIds,
  isConnected,
} from '@/lib/db/firestore/client/reads';
import { getMyBlockedIds } from '@/lib/db/firestore/client/blocks';
import { ApiError, callApi } from '@/lib/db/firestore/client/api';
import type { FeedCardBody, ProfileBody } from '@/lib/api/v1/schemas';
import PublicProfilePage from './page';

function user(id: string, handle = id): User {
  return {
    id,
    handle,
    bio: `${handle} writes here`,
    region: 'TW',
    primaryLocale: 'en',
    autoTranslateTo: [],
    verified: false,
    phoneHash: '',
    avatarSeed: '3',
    initials: handle.slice(0, 2).toUpperCase(),
    accentColor: 'var(--accent)',
    joinedAt: new Date('2025-01-01'),
    handleChangedAt: new Date('2025-01-01'),
  };
}
function card(id: string, authorId: string, title: string): Card {
  return {
    id,
    authorId,
    slug: id,
    thoughtCore: title,
    story: 'story',
    tags: [],
    originalLocale: 'en',
    translations: {},
    visibility: 'public',
    publishedAt: new Date('2026-01-01'),
    readCount: 0,
    resonanceCount: 0,
    inviteCount: 0,
  };
}

function renderPage() {
  return renderWithIntl(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <PublicProfilePage />
    </SWRConfig>,
  );
}

beforeEach(() => {
  mockUseAuth.mockReturnValue({ user: null, loading: false });
  vi.mocked(getUserByHandle).mockResolvedValue(user('bob'));
  vi.mocked(getMyBlockedIds).mockResolvedValue(new Set());
  vi.mocked(isConnected).mockResolvedValue(false);
  vi.mocked(getPublicCardsByAuthor).mockResolvedValue([card('p1', 'bob', "Bob's first walk")]);
  vi.mocked(getCardById).mockImplementation(async (id) => card(id, 'carol', "Carol's reply"));
  vi.mocked(getUsersByIds).mockResolvedValue({ carol: user('carol') });
});
afterEach(() => vi.clearAllMocks());

describe('public profile page, signed out', () => {
  it('shows the person and their cards, read through the rules — and no card links, which only the server reads', async () => {
    renderPage();
    expect(await screen.findByRole('heading', { name: 'bob' })).toBeInTheDocument();
    expect(screen.getAllByText("Bob's first walk").length).toBeGreaterThan(0);
    expect(screen.getByText('1 public card')).toBeInTheDocument();
    // A card link names both cards' authors, an anonymous one's too.
    expect(screen.queryAllByText("Carol's reply")).toHaveLength(0);
    expect(getCardById).not.toHaveBeenCalled();
    expect(callApi).not.toHaveBeenCalled();
  });

  it('says so for a pen name nobody has', async () => {
    vi.mocked(getUserByHandle).mockResolvedValue(null);
    renderPage();
    expect(await screen.findByText("This person can't be found")).toBeInTheDocument();
    expect(getPublicCardsByAuthor).not.toHaveBeenCalled();
    // The way home is a button, filled as every button is: the tonal pill.
    const home = screen.getByRole('button', { name: 'Back to home' });
    expect(home).toHaveAttribute('data-variant', 'tonal');
    await userEvent.click(home);
    expect(mockPush).toHaveBeenCalledWith('/home');
  });
});

/** A v1 card summary by `authorId`. */
function summary(id: string, authorId: string, title: string): FeedCardBody {
  return {
    id,
    slug: id,
    title,
    excerpt: 'story',
    tags: [],
    publishedAt: '2026-01-01T00:00:00.000Z',
    author: { id: authorId, handle: authorId, initials: 'XX', accentColor: 'x', avatarUrl: null, avatarSeed: '3', verified: false, region: 'TW' },
    anonymous: false,
    visibility: 'public',
    imageUrl: null,
    imageLabel: null,
    accentHue: null,
    readMinutes: 1,
    referenceCardId: null,
    reason: null,
  };
}

/** What GET /api/v1/users/bob?include=cards,links answers this viewer. */
function profile(extra: Partial<ProfileBody> = {}): ProfileBody {
  return {
    author: { id: 'bob', handle: 'bob', initials: 'BO', accentColor: 'x', avatarUrl: null, avatarSeed: '3', verified: false, region: 'TW' },
    bio: 'bob writes here',
    joinedAt: '2025-01-01T00:00:00.000Z',
    cardCount: 1,
    isSelf: false,
    isConnected: true,
    isBlocked: false,
    cards: { cards: [summary('p1', 'bob', "Bob's first walk")], nextCursor: null },
    links: { cards: [summary('x1', 'carol', "Carol's reply")] },
    ...extra,
  };
}

describe('public profile page, signed in', () => {
  beforeEach(() => {
    mockUseAuth.mockReturnValue({ user: { id: 'me' }, loading: false });
  });

  it('reads the person, how the viewer stands with them, their cards and the cards linking to theirs in one request', async () => {
    vi.mocked(callApi).mockResolvedValue(profile());
    renderPage();
    expect(await screen.findByRole('heading', { name: 'bob' })).toBeInTheDocument();
    expect(screen.getByText('bob writes here')).toBeInTheDocument();
    expect(screen.getAllByText("Bob's first walk").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Carol's reply").length).toBeGreaterThan(0);
    expect(screen.getByText('1 public card')).toBeInTheDocument();
    // Connected: the conversation is one click away.
    expect(screen.getByRole('link', { name: /Message/ })).toHaveAttribute('href', '/messages/bob');

    expect(callApi).toHaveBeenCalledTimes(1);
    expect(callApi).toHaveBeenCalledWith('/api/v1/users/bob?include=cards,links&limit=30');
    for (const read of [getUserByHandle, getMyBlockedIds, isConnected, getPublicCardsByAuthor, getCardById, getUsersByIds]) {
      expect(read).not.toHaveBeenCalled();
    }
  });

  it('offers report and block beside the pen name, saying so, to a visitor', async () => {
    vi.mocked(callApi).mockResolvedValue(profile({ isConnected: false }));
    renderPage();
    const name = await screen.findByRole('heading', { name: 'bob' });
    const menu = screen.getByRole('button', { name: 'Report or block' });
    // In the name's own row (the name keeps its centre; the ⋯ hangs off its end).
    expect(name.parentElement).toContainElement(menu);
    expect(screen.queryByRole('link', { name: /Message/ })).toBeNull();
  });

  it('says unblock once the visitor has blocked them', async () => {
    vi.mocked(callApi).mockResolvedValue(profile({ isConnected: false, isBlocked: true }));
    renderPage();
    expect(await screen.findByRole('button', { name: 'Report or unblock' })).toBeInTheDocument();
  });

  it('shows the owner no report or block', async () => {
    vi.mocked(callApi).mockResolvedValue(profile({ isSelf: true, isConnected: false }));
    renderPage();
    await screen.findByRole('heading', { name: 'bob' });
    expect(screen.queryByRole('button', { name: /Report or/ })).toBeNull();
  });

  it('lists the first 40 cards of someone with more than a page: the rest in a second request', async () => {
    const many = Array.from({ length: 30 }, (_, i) => summary(`p${i}`, 'bob', `Card ${i}`));
    vi.mocked(callApi).mockImplementation(async (path: string) =>
      path.startsWith('/api/v1/users/bob/cards')
        ? { cards: Array.from({ length: 10 }, (_, i) => summary(`q${i}`, 'bob', `Later card ${i}`)), nextCursor: '2025-06-01T00:00:00.000Z' }
        : profile({ cards: { cards: many, nextCursor: '2025-07-01T00:00:00.000Z' } }),
    );
    renderPage();
    expect(await screen.findByText('40 public cards')).toBeInTheDocument();
    expect(callApi).toHaveBeenCalledTimes(2);
    expect(callApi).toHaveBeenLastCalledWith(`/api/v1/users/bob/cards?limit=10&cursor=${encodeURIComponent('2025-07-01T00:00:00.000Z')}`);
  });

  it('shows someone the viewer blocked as blocked: none of their cards, nor what links to them', async () => {
    vi.mocked(callApi).mockResolvedValue(profile({ isBlocked: true, isConnected: false, cardCount: 0, cards: { cards: [], nextCursor: null } }));
    renderPage();
    expect(await screen.findByText('You blocked bob')).toBeInTheDocument();
    expect(screen.queryAllByText("Bob's first walk")).toHaveLength(0);
    expect(screen.queryAllByText("Carol's reply")).toHaveLength(0);
    expect(screen.getByText('No public cards')).toBeInTheDocument();
  });

  it('says so for a pen name nobody has (404)', async () => {
    vi.mocked(callApi).mockRejectedValue(new ApiError(404, 'not_found', 'No such person.'));
    renderPage();
    expect(await screen.findByText("This person can't be found")).toBeInTheDocument();
    expect(callApi).toHaveBeenCalledTimes(1);
  });

  it('waits for auth in a browser someone signed in in, then asks the server — never the public reads', async () => {
    window.localStorage.setItem('resonance:session', JSON.stringify({ uid: 'me', expiresAt: Date.now() + 86_400_000 }));
    mockUseAuth.mockReturnValue({ user: null, loading: true });
    vi.mocked(callApi).mockResolvedValue(profile());
    const view = renderPage();
    expect(screen.getByRole('status', { name: 'Loading profile' })).toBeInTheDocument();
    expect(getUserByHandle).not.toHaveBeenCalled();

    mockUseAuth.mockReturnValue({ user: { id: 'me' }, loading: false });
    view.rerender(
      <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
        <PublicProfilePage />
      </SWRConfig>,
    );
    expect(await screen.findByRole('heading', { name: 'bob' })).toBeInTheDocument();
    expect(getUserByHandle).not.toHaveBeenCalled();
    window.localStorage.clear();
  });
});
