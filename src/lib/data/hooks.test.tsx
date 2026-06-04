// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ReactNode } from 'react';
import { SWRConfig } from 'swr';
import { renderHook, waitFor } from '@testing-library/react';
import type { Card, User } from '@/lib/db/types';

// --- module boundary mocks -------------------------------------------------
// The hooks compose calls to the firestore client read layer. We mock that
// whole module so the tests exercise the *composition* logic (aggregation,
// author resolution, viewer===self short-circuit) without touching Firebase.
vi.mock('@/lib/db/firestore/client/reads', () => ({
  getCardById: vi.fn(),
  getCardBySlugOrId: vi.fn(),
  getCardsByAuthor: vi.fn(),
  getCurrentUserProfile: vi.fn(),
  getLatestPublishedFeed: vi.fn(),
  getRelatedCards: vi.fn(),
  getUserById: vi.fn(),
  getUserByHandle: vi.fn(),
  getUsersByIds: vi.fn(),
  isConnected: vi.fn(),
}));
vi.mock('@/lib/db/firestore/client/invites', () => ({
  remainingDailyQuota: vi.fn(),
}));
vi.mock('@/lib/db/firestore/client/comments', () => ({
  listComments: vi.fn(),
}));
vi.mock('@/lib/db/firestore/client/resonances', () => ({
  listResonators: vi.fn(),
}));
vi.mock('@/lib/db/firestore/client/cardLinks', () => ({
  listLinksToAuthor: vi.fn(),
  listLinksToCard: vi.fn(),
}));

// useAuth is mocked so each test controls the signed-in viewer directly,
// instead of standing up the real AuthProvider + Firebase auth.
const mockUseAuth = vi.fn();
vi.mock('@/components/providers/AuthProvider', () => ({
  useAuth: () => mockUseAuth(),
}));

import {
  getCardBySlugOrId,
  getCardsByAuthor,
  getLatestPublishedFeed,
  getRelatedCards,
  getUserById,
  getUserByHandle,
  getUsersByIds,
  isConnected,
} from '@/lib/db/firestore/client/reads';
import { remainingDailyQuota } from '@/lib/db/firestore/client/invites';
import { listLinksToAuthor } from '@/lib/db/firestore/client/cardLinks';
import { useCard, useFeed, useMyCardBox, useProfileByHandle, useRelated } from './hooks';

// --- fixtures --------------------------------------------------------------
function card(id: string, authorId: string, extra: Partial<Card> = {}): Card {
  return {
    id,
    authorId,
    thoughtCore: 'core',
    story: 'story',
    tags: [],
    originalLocale: 'en',
    translations: {},
    visibility: 'public',
    publishedAt: new Date('2026-01-01'),
    readCount: 0,
    resonanceCount: 0,
    inviteCount: 0,
    ...extra,
  };
}
function user(id: string, handle = id): User {
  return {
    id,
    handle,
    region: 'TW',
    primaryLocale: 'en',
    autoTranslateTo: [],
    verified: true,
    phoneHash: 'h',
    avatarSeed: 's',
    initials: handle[0].toUpperCase(),
    accentColor: 'var(--accent)',
    joinedAt: new Date('2025-01-01'),
    handleChangedAt: new Date('2025-01-01'),
  };
}

// Fresh, isolated SWR cache per render so keys never leak between tests.
function wrapper({ children }: { children: ReactNode }) {
  return (
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      {children}
    </SWRConfig>
  );
}

beforeEach(() => {
  mockUseAuth.mockReturnValue({ user: { id: 'me' }, loading: false });
  // Card-link lookups default to empty so existing tests (card box, profile)
  // exercise their original branches without standing up link fixtures.
  vi.mocked(listLinksToAuthor).mockResolvedValue([]);
});
afterEach(() => {
  vi.clearAllMocks();
});

describe('useFeed', () => {
  it('returns the latest feed cards with their resolved authors', async () => {
    vi.mocked(getLatestPublishedFeed).mockResolvedValue([
      card('c1', 'a1'),
      card('c2', 'a2'),
    ]);
    vi.mocked(getUsersByIds).mockResolvedValue({ a1: user('a1'), a2: user('a2') });

    const { result } = renderHook(() => useFeed(), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());

    expect(getLatestPublishedFeed).toHaveBeenCalledWith(12);
    expect(result.current.data!.cards.map((c) => c.id)).toEqual(['c1', 'c2']);
    // authors were resolved from the cards' authorIds
    expect(getUsersByIds).toHaveBeenCalledWith(['a1', 'a2']);
    expect(result.current.data!.authors.a1.handle).toBe('a1');
  });
});

// Public cards & profiles are anonymous-readable (Firestore rules allow it),
// so the feed and related hooks must fetch *immediately* — even before the
// client SDK finishes restoring auth — so logged-out visitors see content.
describe('public reads do not wait on a signed-in viewer', () => {
  it('useFeed fetches immediately even while auth is still resolving', async () => {
    mockUseAuth.mockReturnValue({ user: null, loading: true });
    vi.mocked(getLatestPublishedFeed).mockResolvedValue([card('c1', 'a1')]);
    vi.mocked(getUsersByIds).mockResolvedValue({ a1: user('a1') });

    const { result } = renderHook(() => useFeed(), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(getLatestPublishedFeed).toHaveBeenCalledWith(12);
    expect(result.current.data!.cards[0].id).toBe('c1');
  });

  it('useRelated fetches with just a card id, no viewer required', async () => {
    mockUseAuth.mockReturnValue({ user: null, loading: false });
    vi.mocked(getRelatedCards).mockResolvedValue([card('c2', 'a1')]);
    vi.mocked(getUsersByIds).mockResolvedValue({ a1: user('a1') });

    const { result } = renderHook(() => useRelated('c1'), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(getRelatedCards).toHaveBeenCalledWith('c1', 3);
  });
});

// A card may be private/connections, visible only to its owner / connected
// viewers. useCard must wait for auth to *settle* (not merely for a viewer) so
// it doesn't read as anonymous mid-restore and 404 the owner's own card.
describe('useCard auth-settle gating', () => {
  it('does not fetch while auth is still restoring', async () => {
    mockUseAuth.mockReturnValue({ user: null, loading: true });
    const { result } = renderHook(() => useCard('c1'), { wrapper });
    await new Promise((r) => setTimeout(r, 0));
    expect(getCardBySlugOrId).not.toHaveBeenCalled();
    expect(result.current.data).toBeUndefined();
  });

  it('fetches the card + author once auth has settled', async () => {
    mockUseAuth.mockReturnValue({ user: null, loading: true });
    vi.mocked(getCardBySlugOrId).mockResolvedValue(card('c1', 'a1'));
    vi.mocked(getUserById).mockResolvedValue(user('a1'));

    const { result, rerender } = renderHook(() => useCard('c1'), { wrapper });
    expect(getCardBySlugOrId).not.toHaveBeenCalled();

    mockUseAuth.mockReturnValue({ user: { id: 'me' }, loading: false });
    rerender();

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data!.card!.id).toBe('c1');
    expect(result.current.data!.author!.id).toBe('a1');
  });

  it('settles for a logged-out viewer too (anonymous can read public cards)', async () => {
    mockUseAuth.mockReturnValue({ user: null, loading: false });
    vi.mocked(getCardBySlugOrId).mockResolvedValue(card('c1', 'a1'));
    vi.mocked(getUserById).mockResolvedValue(user('a1'));

    const { result } = renderHook(() => useCard('c1'), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data!.card!.id).toBe('c1');
  });

  it('yields null (not-found) when the card is missing or not visible', async () => {
    mockUseAuth.mockReturnValue({ user: null, loading: false });
    vi.mocked(getCardBySlugOrId).mockResolvedValue(null);
    const { result } = renderHook(() => useCard('missing'), { wrapper });
    await waitFor(() => expect(result.current.data).not.toBeUndefined());
    expect(result.current.data).toBeNull();
    expect(getUserById).not.toHaveBeenCalled();
  });
});

describe('useMyCardBox', () => {
  it('fetches all four box tabs in parallel and aggregates them with authors', async () => {
    // Return a distinct card per tab so we can prove the mapping is correct.
    vi.mocked(getCardsByAuthor).mockImplementation(async (_uid, tab) => {
      const byTab: Record<string, Card> = {
        published: card('pub', 'me'),
        private: card('priv', 'me', { visibility: 'private' }),
        draft: card('draft', 'me', { publishedAt: null }),
        resonated: card('res', 'other'),
      };
      return [byTab[tab]];
    });
    vi.mocked(getUsersByIds).mockResolvedValue({ me: user('me'), other: user('other') });

    const { result } = renderHook(() => useMyCardBox(), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());

    const tabsCalled = vi.mocked(getCardsByAuthor).mock.calls.map((c) => c[1]).sort();
    expect(tabsCalled).toEqual(['draft', 'private', 'published', 'resonated']);

    const box = result.current.data!;
    expect(box.published[0].id).toBe('pub');
    expect(box.private[0].id).toBe('priv');
    expect(box.draft[0].id).toBe('draft');
    expect(box.resonated[0].id).toBe('res');
    // authors resolved across every tab's cards (me + the resonated author)
    expect(Object.keys(box.authors).sort()).toEqual(['me', 'other']);
  });

  it('stays idle (no fetch) when no viewer is signed in', async () => {
    mockUseAuth.mockReturnValue({ user: null, loading: false });
    const { result } = renderHook(() => useMyCardBox(), { wrapper });
    // null SWR key → never fetches
    await new Promise((r) => setTimeout(r, 0));
    expect(result.current.data).toBeUndefined();
    expect(getCardsByAuthor).not.toHaveBeenCalled();
  });
});

describe('useProfileByHandle', () => {
  it('assembles a public profile (connection state, cards, quota) for another user', async () => {
    vi.mocked(getUserByHandle).mockResolvedValue(user('u2', 'other'));
    vi.mocked(isConnected).mockResolvedValue(true);
    vi.mocked(getCardsByAuthor).mockResolvedValue([card('p1', 'u2')]);
    vi.mocked(remainingDailyQuota).mockResolvedValue(2);

    const { result } = renderHook(() => useProfileByHandle('other'), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());

    const data = result.current.data!;
    expect(data.user!.id).toBe('u2');
    expect(data.isConnected).toBe(true);
    expect(data.published.map((c) => c.id)).toEqual(['p1']);
    expect(data.dailyRemaining).toBe(2);
    expect(getCardsByAuthor).toHaveBeenCalledWith('u2', 'published');
  });

  it('returns an empty profile and skips extra fetches when viewing your own handle', async () => {
    // The looked-up user IS the viewer.
    vi.mocked(getUserByHandle).mockResolvedValue(user('me', 'myself'));

    const { result } = renderHook(() => useProfileByHandle('myself'), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());

    expect(result.current.data).toEqual({
      user: null,
      isConnected: false,
      published: [],
      linked: [],
      linkedAuthors: {},
      dailyRemaining: 0,
    });
    // short-circuit must avoid the connection / cards / quota round-trips
    expect(isConnected).not.toHaveBeenCalled();
    expect(getCardsByAuthor).not.toHaveBeenCalled();
    expect(remainingDailyQuota).not.toHaveBeenCalled();
  });
});
