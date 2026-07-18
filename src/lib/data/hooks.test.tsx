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
  getPublicCardsByAuthor: vi.fn(),
  getCurrentUserProfile: vi.fn(),
  getLatestPublishedFeed: vi.fn(),
  getMyResonanceCard: vi.fn(),
  getRelatedCards: vi.fn(),
  getResonanceCards: vi.fn(),
  getUserById: vi.fn(),
  getUserByHandle: vi.fn(),
  getUsersByIds: vi.fn(),
  isConnected: vi.fn(),
}));
vi.mock('@/lib/db/firestore/client/cardLinks', () => ({
  listLinksToAuthor: vi.fn(),
  listLinksToCard: vi.fn(),
}));
vi.mock('@/lib/db/firestore/client/bookmarks', () => ({
  listMyBookmarkIds: vi.fn(),
}));
vi.mock('@/lib/db/firestore/client/thoughtMap', () => ({
  loadMyThoughtMap: vi.fn(),
}));

// useAuth is mocked so each test controls the signed-in viewer directly,
// instead of standing up the real AuthProvider + Firebase auth.
const mockUseAuth = vi.fn();
vi.mock('@/components/providers/AuthProvider', () => ({
  useAuth: () => mockUseAuth(),
}));

import {
  getCardById,
  getCardBySlugOrId,
  getCardsByAuthor,
  getPublicCardsByAuthor,
  getLatestPublishedFeed,
  getRelatedCards,
  getResonanceCards,
  getUserById,
  getUserByHandle,
  getUsersByIds,
  isConnected,
} from '@/lib/db/firestore/client/reads';
import { listLinksToAuthor } from '@/lib/db/firestore/client/cardLinks';
import { listMyBookmarkIds } from '@/lib/db/firestore/client/bookmarks';
import { loadMyThoughtMap } from '@/lib/db/firestore/client/thoughtMap';
import {
  useCard,
  useFeed,
  useMyCardBox,
  useMyThoughtMap,
  useProfileByHandle,
  useRelated,
  useResonators,
} from './hooks';

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
  // Card-link / bookmark lookups default to empty so existing tests (card box,
  // profile) exercise their original branches without standing up fixtures.
  vi.mocked(listLinksToAuthor).mockResolvedValue([]);
  vi.mocked(listMyBookmarkIds).mockResolvedValue([]);
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

  it('resolves bookmarks through the visibility-enforced read path (hidden cards drop out)', async () => {
    vi.mocked(getCardsByAuthor).mockResolvedValue([]);
    vi.mocked(listMyBookmarkIds).mockResolvedValue(['b1', 'gone-private']);
    vi.mocked(getCardById).mockImplementation(async (id) =>
      id === 'b1' ? card('b1', 'other') : null,
    );
    vi.mocked(getUsersByIds).mockResolvedValue({ other: user('other') });

    const { result } = renderHook(() => useMyCardBox(), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());

    expect(result.current.data!.bookmarks.map((c) => c.id)).toEqual(['b1']);
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

describe('useMyThoughtMap', () => {
  it('includes resonated originals as placeable cards and keeps their nodes alive', async () => {
    vi.mocked(getCardsByAuthor).mockImplementation(async (_uid, tab) => {
      const byTab: Record<string, Card[]> = {
        published: [card('own', 'me')],
        private: [],
        draft: [],
        // An original by someone else that the viewer resonated with.
        resonated: [card('theirs', 'other')],
      };
      return byTab[tab] ?? [];
    });
    const node = (cardId: string) => ({
      id: cardId,
      cardId,
      x: 0,
      y: 0,
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-01'),
    });
    vi.mocked(loadMyThoughtMap).mockResolvedValue({
      nodes: [
        node('own'),
        // Placed from the tray earlier — must survive the reload filter.
        node('theirs'),
        // A card deleted since being placed drops out.
        node('gone'),
      ],
      edges: [],
      groups: [],
    });

    const { result } = renderHook(() => useMyThoughtMap(), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());

    const map = result.current.data!;
    expect(Object.keys(map.cards).sort()).toEqual(['own', 'theirs']);
    expect(map.resonatedIds).toEqual(['theirs']);
    expect(map.nodes.map((n) => n.cardId).sort()).toEqual(['own', 'theirs']);
  });
});

describe('useProfileByHandle', () => {
  it('assembles a public profile (connection state, public cards) for another user', async () => {
    vi.mocked(getUserByHandle).mockResolvedValue(user('u2', 'other'));
    vi.mocked(isConnected).mockResolvedValue(true);
    vi.mocked(getPublicCardsByAuthor).mockResolvedValue([card('p1', 'u2')]);
    vi.mocked(getUsersByIds).mockResolvedValue({});

    const { result } = renderHook(() => useProfileByHandle('other'), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());

    const data = result.current.data!;
    expect(data.user!.id).toBe('u2');
    expect(data.isSelf).toBe(false);
    expect(data.isConnected).toBe(true);
    expect(data.published.map((c) => c.id)).toEqual(['p1']);
    expect(getPublicCardsByAuthor).toHaveBeenCalledWith('u2');
  });

  it('shows the viewer their own public profile and skips the connect round-trip', async () => {
    // The looked-up user IS the viewer.
    vi.mocked(getUserByHandle).mockResolvedValue(user('me', 'myself'));
    vi.mocked(getPublicCardsByAuthor).mockResolvedValue([card('p1', 'me')]);
    vi.mocked(getUsersByIds).mockResolvedValue({});

    const { result } = renderHook(() => useProfileByHandle('myself'), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());

    const data = result.current.data!;
    expect(data.user!.id).toBe('me');
    expect(data.isSelf).toBe(true);
    expect(data.published.map((c) => c.id)).toEqual(['p1']);
    // self view never needs connection state
    expect(isConnected).not.toHaveBeenCalled();
  });

  it('renders for anonymous visitors (no viewer) without connect reads', async () => {
    mockUseAuth.mockReturnValue({ user: null, loading: false });
    vi.mocked(getUserByHandle).mockResolvedValue(user('u2', 'other'));
    vi.mocked(getPublicCardsByAuthor).mockResolvedValue([card('p1', 'u2')]);
    vi.mocked(getUsersByIds).mockResolvedValue({});

    const { result } = renderHook(() => useProfileByHandle('other'), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());

    const data = result.current.data!;
    expect(data.user!.id).toBe('u2');
    expect(data.isSelf).toBe(false);
    expect(data.published.map((c) => c.id)).toEqual(['p1']);
    expect(isConnected).not.toHaveBeenCalled();
  });

  // The profile page renders "user not found" whenever it is not loading and has
  // no user. While auth restores the SWR key is null, so plain SWR would report
  // isLoading=false with no data — flashing not-found before the skeleton.
  it('reports loading (not not-found) while auth is still restoring', async () => {
    mockUseAuth.mockReturnValue({ user: null, loading: true });
    vi.mocked(getUserByHandle).mockResolvedValue(user('u2', 'other'));
    vi.mocked(getPublicCardsByAuthor).mockResolvedValue([card('p1', 'u2')]);
    vi.mocked(getUsersByIds).mockResolvedValue({});

    const { result, rerender } = renderHook(() => useProfileByHandle('other'), { wrapper });
    await new Promise((r) => setTimeout(r, 0));
    expect(getUserByHandle).not.toHaveBeenCalled();
    expect(result.current.data).toBeUndefined();
    expect(result.current.isLoading).toBe(true);

    mockUseAuth.mockReturnValue({ user: null, loading: false });
    rerender();

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.isLoading).toBe(false);
    expect(result.current.data!.user!.id).toBe('u2');
  });

  it('still reports not-loading + empty profile for a handle that does not exist', async () => {
    mockUseAuth.mockReturnValue({ user: null, loading: false });
    vi.mocked(getUserByHandle).mockResolvedValue(null);

    const { result } = renderHook(() => useProfileByHandle('ghost'), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.isLoading).toBe(false);
    expect(result.current.data!.user).toBeNull();
  });
});

describe('useResonators', () => {
  it('fetches resonators for the given card, including incoming cards and parent cards', async () => {
    vi.mocked(getResonanceCards).mockResolvedValue([
      card('c2', 'a2'),
      card('c3', 'a3'),
    ]);
    vi.mocked(getUsersByIds).mockResolvedValue({
      a2: user('a2'),
      a3: user('a3'),
    });

    vi.mocked(getCardById).mockImplementation(async (id) => {
      if (id === 'c0') return card('c0', 'a0');
      return null;
    });
    vi.mocked(getUserById).mockImplementation(async (id) => {
      if (id === 'a0') return user('a0');
      return null;
    });

    const { result } = renderHook(() => useResonators('c1', 'c0'), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());

    const list = result.current.data!;
    expect(list.map((u) => u.id)).toEqual(['a0', 'a2', 'a3']);
  });
});
