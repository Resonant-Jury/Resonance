// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ReactNode } from 'react';
import { SWRConfig } from 'swr';
import { act, renderHook, waitFor } from '@testing-library/react';
import { SWR_DEFAULTS } from '@/components/providers/SWRProvider';
import type { Card, User } from '@/lib/db/types';
import type { CardSeed } from './cardSeed';

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
  listMyConnectionUids: vi.fn(),
  resolveCardId: vi.fn(),
}));
vi.mock('@/lib/db/firestore/client/messages', () => ({
  listConversations: vi.fn(),
  listenThread: vi.fn(),
}));
vi.mock('@/lib/db/firestore/client/api', () => ({
  callApi: vi.fn(),
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
vi.mock('@/lib/db/firestore/client/blocks', () => ({
  getMyBlockedIds: vi.fn(),
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
  listMyConnectionUids,
  resolveCardId,
} from '@/lib/db/firestore/client/reads';
import { listConversations } from '@/lib/db/firestore/client/messages';
import { callApi } from '@/lib/db/firestore/client/api';
import { listLinksToAuthor } from '@/lib/db/firestore/client/cardLinks';
import { listMyBookmarkIds } from '@/lib/db/firestore/client/bookmarks';
import { loadMyThoughtMap } from '@/lib/db/firestore/client/thoughtMap';
import { getMyBlockedIds } from '@/lib/db/firestore/client/blocks';
import {
  useCard,
  useConversations,
  useFeed,
  useMyBlockedIds,
  useMyCardBox,
  useMyThoughtMap,
  useProfileByHandle,
  useProfileCards,
  useProfileLinks,
  useRecommendedFeed,
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
  vi.mocked(getMyBlockedIds).mockResolvedValue(new Set());
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

// An anonymous card still carries its author's uid (rules can't redact a
// field), but the browser must never download the profile it is anonymous
// from — every surface shows the anonymous byline for it anyway.
describe('anonymous cards', () => {
  it("don't fetch their author's profile in a list", async () => {
    vi.mocked(getLatestPublishedFeed).mockResolvedValue([card('c1', 'a1'), card('anon', 'secret', { anonymous: true })]);
    vi.mocked(getUsersByIds).mockResolvedValue({ a1: user('a1') });
    const { result } = renderHook(() => useFeed(), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data!.cards.map((c) => c.id)).toEqual(['c1', 'anon']);
    expect(getUsersByIds).toHaveBeenCalledWith(['a1']);
  });

  it("don't fetch their author on the card page — unless the viewer wrote it", async () => {
    vi.mocked(getCardBySlugOrId).mockResolvedValue(card('anon', 'secret', { anonymous: true }));
    const { result } = renderHook(() => useCard('anon'), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(getUserById).not.toHaveBeenCalled();
    expect(result.current.data!.author).toMatchObject({ id: 'secret', handle: '' });

    vi.mocked(getCardBySlugOrId).mockResolvedValue(card('mine', 'me', { anonymous: true }));
    vi.mocked(getUserById).mockResolvedValue(user('me'));
    const own = renderHook(() => useCard('mine'), { wrapper });
    await waitFor(() => expect(own.result.current.data).toBeDefined());
    expect(getUserById).toHaveBeenCalledWith('me');
  });
});

// Blocking hides the blocked person's cards from every feed surface, but the
// feed must keep paginating on the raw Firestore page: a page that comes back
// short only because a blocked author was dropped is not the end of the feed.
describe('blocked authors', () => {
  it('drops their cards from the feed without ending pagination early', async () => {
    vi.mocked(getMyBlockedIds).mockResolvedValue(new Set(['bad']));
    const fullPage = Array.from({ length: 12 }, (_, i) =>
      card(`c${i}`, i % 3 === 0 ? 'bad' : 'a1', { publishedAt: new Date(2026, 0, 30 - i) }),
    );
    vi.mocked(getLatestPublishedFeed).mockResolvedValue(fullPage);
    vi.mocked(getUsersByIds).mockResolvedValue({ a1: user('a1') });

    const { result } = renderHook(() => useFeed(), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());

    expect(result.current.data!.cards.every((c) => c.authorId !== 'bad')).toBe(true);
    expect(result.current.data!.cards).toHaveLength(8);
    expect(getUsersByIds).toHaveBeenCalledWith(Array(8).fill('a1'));
    // 12 raw cards came back, so there may be more — even though 8 are shown.
    expect(result.current.hasMore).toBe(true);
  });

  it("shows a blocked person's profile as blocked (the page then shows none of their cards)", async () => {
    vi.mocked(getMyBlockedIds).mockResolvedValue(new Set(['u2']));
    vi.mocked(getUserByHandle).mockResolvedValue(user('u2', 'bob'));
    vi.mocked(isConnected).mockResolvedValue(false);

    const { result } = renderHook(() => useProfileByHandle('bob'), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());

    expect(result.current.data!.isBlocked).toBe(true);
    expect(result.current.data!.user!.id).toBe('u2');
  });

  it('drops blocked people from the cards linking to a profile', async () => {
    vi.mocked(getMyBlockedIds).mockResolvedValue(new Set(['bad']));
    vi.mocked(getUserByHandle).mockResolvedValue(user('u2', 'bob'));
    vi.mocked(listLinksToAuthor).mockResolvedValue([
      { id: 'l1', sourceCardId: 'x1', sourceAuthorId: 'bad', targetCardId: 'p1', targetAuthorId: 'u2', createdAt: new Date() },
      { id: 'l2', sourceCardId: 'x2', sourceAuthorId: 'a1', targetCardId: 'p1', targetAuthorId: 'u2', createdAt: new Date() },
    ]);
    vi.mocked(getCardById).mockImplementation(async (id) => card(id, id === 'x1' ? 'bad' : 'a1'));
    vi.mocked(getUsersByIds).mockResolvedValue({ a1: user('a1') });

    const { result } = renderHook(() => useProfileLinks('bob').data, { wrapper });
    await waitFor(() => expect(result.current).toBeDefined());
    expect(result.current!.cards.map((c) => c.id)).toEqual(['x2']);
  });

  it('drops blocked people from resonance and related lists', async () => {
    vi.mocked(getMyBlockedIds).mockResolvedValue(new Set(['bad']));
    vi.mocked(getRelatedCards).mockResolvedValue([card('c2', 'bad'), card('c3', 'a1')]);
    vi.mocked(getUsersByIds).mockResolvedValue({ a1: user('a1') });

    const { result } = renderHook(() => useRelated('c1'), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data!.cards.map((c) => c.id)).toEqual(['c3']);
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

// The card page's server render hands over the card's id and, for a public
// card, its content (CardSeed). The browser shows that at once and replaces it
// with its own read through the rules.
describe('useCard with the server render', () => {
  const seed: CardSeed = {
    id: 'doc1',
    view: {
      card: {
        id: 'doc1',
        authorId: 'a1',
        slug: 'a-slug',
        thoughtCore: 'From the server',
        story: 'Rendered into the HTML.',
        tags: ['t'],
        media: null,
        originalLocale: 'en',
        referenceCardId: null,
        publishedAt: '2026-01-01T00:00:00.000Z',
        resonanceCount: 0,
        accentHue: null,
        anonymous: false,
      },
      author: {
        id: 'a1',
        handle: 'writer',
        bio: null,
        region: 'TW',
        verified: false,
        avatarSeed: '1',
        avatarUrl: null,
        initials: 'W',
        accentColor: 'c',
      },
    },
  };

  it("starts from the server's card (fallbackData) — even before auth settles", () => {
    mockUseAuth.mockReturnValue({ user: null, loading: true });
    const { result } = renderHook(() => useCard('a-slug', seed), { wrapper });
    expect(result.current.isLoading).toBe(false);
    expect(result.current.fromServer).toBe(true);
    expect(result.current.data!.card.story).toBe('Rendered into the HTML.');
    expect(result.current.data!.author!.handle).toBe('writer');
    expect(getCardById).not.toHaveBeenCalled();
  });

  it('reads the card by the id the server found, skipping the slug lookup, and takes over', async () => {
    vi.mocked(getCardById).mockResolvedValue(card('doc1', 'a1', { story: 'Fresh from the rules' }));
    vi.mocked(getUserById).mockResolvedValue(user('a1', 'writer'));
    const { result } = renderHook(() => useCard('a-slug', seed), { wrapper });
    await waitFor(() => expect(result.current.fromServer).toBe(false));
    expect(result.current.data!.card.story).toBe('Fresh from the rules');
    expect(getCardById).toHaveBeenCalledWith('doc1');
    expect(getCardBySlugOrId).not.toHaveBeenCalled();
    expect(resolveCardId).not.toHaveBeenCalled();
  });

  it("lets another reader of the card's key (the write button beside the page) fetch by the server's id too", async () => {
    vi.mocked(getCardById).mockResolvedValue(card('doc1', 'a1'));
    vi.mocked(getUserById).mockResolvedValue(user('a1', 'writer'));
    // Rendered together; the button holds no fallbackData, so SWR starts its
    // fetch first (the page's waits a frame) and the page rides along on it.
    const { result } = renderHook(() => ({ page: useCard('b-slug', seed), button: useCard('b-slug') }), { wrapper });
    await waitFor(() => expect(result.current.button.data?.card.id).toBe('doc1'));
    await waitFor(() => expect(result.current.page.fromServer).toBe(false));
    expect(getCardById).toHaveBeenCalledTimes(1);
    expect(getCardById).toHaveBeenCalledWith('doc1');
    expect(getCardBySlugOrId).not.toHaveBeenCalled();
    expect(resolveCardId).not.toHaveBeenCalled();
  });

  it('turns into not-found when the card no longer reads (gone private or deleted)', async () => {
    vi.mocked(getCardById).mockResolvedValue(null);
    vi.mocked(resolveCardId).mockResolvedValue('doc1');
    const { result } = renderHook(() => useCard('a-slug', seed), { wrapper });
    await waitFor(() => expect(result.current.data).toBeNull());
    // The slug still names the same id: it isn't read a second time.
    expect(getCardById).toHaveBeenCalledTimes(1);
  });

  it("keeps an anonymous card's author unknown and unread, as without the server", async () => {
    const anon: CardSeed = {
      id: 'doc1',
      view: { card: { ...seed.view!.card, authorId: '', anonymous: true }, author: null },
    };
    mockUseAuth.mockReturnValue({ user: null, loading: true });
    const { result } = renderHook(() => useCard('a-slug', anon), { wrapper });
    expect(result.current.data!.author).toMatchObject({ id: '', handle: '', initials: '·' });
    expect(getUserById).not.toHaveBeenCalled();
  });

  it('with only an id (a card the server may not show), reads it by that id with nothing shown first', async () => {
    vi.mocked(getCardById).mockResolvedValue(card('doc1', 'me', { visibility: 'private' }));
    vi.mocked(getUserById).mockResolvedValue(user('me'));
    const { result } = renderHook(() => useCard('a-slug', { id: 'doc1', view: null }), { wrapper });
    expect(result.current.data).toBeUndefined();
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data!.card.visibility).toBe('private');
    expect(getCardBySlugOrId).not.toHaveBeenCalled();
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

  it('keeps a placed card older than the newest 40 own cards the reads bring', async () => {
    vi.mocked(getCardsByAuthor).mockImplementation(async (_uid, tab) => (tab === 'published' ? [card('recent', 'me')] : []));
    vi.mocked(getCardById).mockImplementation(async (id) => (id === 'old' ? card('old', 'me') : null));
    const node = (cardId: string) => ({ id: cardId, cardId, x: 0, y: 0, createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-01') });
    vi.mocked(loadMyThoughtMap).mockResolvedValue({ nodes: [node('recent'), node('old'), node('gone')], edges: [], groups: [] });

    const { result } = renderHook(() => useMyThoughtMap(), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());

    const map = result.current.data!;
    expect(map.nodes.map((n) => n.cardId).sort()).toEqual(['old', 'recent']);
    expect(map.cards.old?.id).toBe('old');
    expect(getCardById).toHaveBeenCalledWith('old');
    expect(getCardById).toHaveBeenCalledWith('gone');
  });
});

// The profile page reads three things once the handle names someone — the
// viewer's standing with them, their cards, the cards linking to theirs — side
// by side, not one after another.
describe('profile hooks', () => {
  /** The three hooks as the profile page composes them, reading `.data` during render. */
  function useProfilePage(handle: string) {
    const head = useProfileByHandle(handle);
    const cards = useProfileCards(handle);
    const links = useProfileLinks(handle);
    return { head: head.data, isLoading: head.isLoading, cards: cards.data, links: links.data };
  }

  it('assembles a public profile (connection state, public cards) for another user', async () => {
    vi.mocked(getUserByHandle).mockResolvedValue(user('u2', 'other'));
    vi.mocked(isConnected).mockResolvedValue(true);
    vi.mocked(getPublicCardsByAuthor).mockResolvedValue([card('p1', 'u2')]);
    vi.mocked(getUsersByIds).mockResolvedValue({});

    const { result } = renderHook(() => useProfilePage('other'), { wrapper });
    await waitFor(() => expect(result.current.head && result.current.cards && result.current.links).toBeTruthy());

    const { head, cards } = result.current;
    expect(head!.user!.id).toBe('u2');
    expect(head!.isSelf).toBe(false);
    expect(head!.isConnected).toBe(true);
    expect(cards!.map((c) => c.id)).toEqual(['p1']);
    expect(getPublicCardsByAuthor).toHaveBeenCalledWith('u2');
    // The three hooks share one lookup of the handle.
    expect(getUserByHandle).toHaveBeenCalledTimes(1);
  });

  it("reads the viewer's blocks, the connection, the cards and the links together, not in a chain", async () => {
    vi.mocked(getUserByHandle).mockResolvedValue(user('u2', 'other'));
    // None of these answer until the test says so.
    const never = () => new Promise<never>(() => {});
    vi.mocked(getMyBlockedIds).mockImplementation(never);
    vi.mocked(isConnected).mockImplementation(never);
    vi.mocked(getPublicCardsByAuthor).mockImplementation(never);
    vi.mocked(listLinksToAuthor).mockImplementation(never);

    const { result } = renderHook(() => useProfilePage('other'), { wrapper });
    await waitFor(() => expect(listLinksToAuthor).toHaveBeenCalledWith('u2'));
    expect(getMyBlockedIds).toHaveBeenCalled();
    expect(isConnected).toHaveBeenCalledWith('me', 'u2');
    expect(getPublicCardsByAuthor).toHaveBeenCalledWith('u2');
    expect(result.current.isLoading).toBe(true);
  });

  it('shows the viewer their own public profile and skips the connect round-trip', async () => {
    // The looked-up user IS the viewer.
    vi.mocked(getUserByHandle).mockResolvedValue(user('me', 'myself'));
    vi.mocked(getPublicCardsByAuthor).mockResolvedValue([card('p1', 'me')]);
    vi.mocked(getUsersByIds).mockResolvedValue({});

    const { result } = renderHook(() => useProfilePage('myself'), { wrapper });
    await waitFor(() => expect(result.current.head && result.current.cards).toBeTruthy());

    expect(result.current.head!.user!.id).toBe('me');
    expect(result.current.head!.isSelf).toBe(true);
    expect(result.current.cards!.map((c) => c.id)).toEqual(['p1']);
    // self view never needs connection state
    expect(isConnected).not.toHaveBeenCalled();
  });

  it('renders for anonymous visitors (no viewer) without connect reads', async () => {
    mockUseAuth.mockReturnValue({ user: null, loading: false });
    vi.mocked(getUserByHandle).mockResolvedValue(user('u2', 'other'));
    vi.mocked(getPublicCardsByAuthor).mockResolvedValue([card('p1', 'u2')]);
    vi.mocked(getUsersByIds).mockResolvedValue({});

    const { result } = renderHook(() => useProfilePage('other'), { wrapper });
    await waitFor(() => expect(result.current.head && result.current.cards).toBeTruthy());

    expect(result.current.head!.user!.id).toBe('u2');
    expect(result.current.head!.isSelf).toBe(false);
    expect(result.current.cards!.map((c) => c.id)).toEqual(['p1']);
    expect(isConnected).not.toHaveBeenCalled();
  });

  // The profile page renders "user not found" whenever it is not loading and has
  // no user. While auth restores the viewer's half can't start, so the head must
  // report loading — not not-found. The public half (the person, their cards)
  // doesn't wait: profiles and public cards read the same for everyone.
  it('reports loading (not not-found) while auth is still restoring, and starts the public reads meanwhile', async () => {
    mockUseAuth.mockReturnValue({ user: null, loading: true });
    vi.mocked(getUserByHandle).mockResolvedValue(user('u2', 'other'));
    vi.mocked(getPublicCardsByAuthor).mockResolvedValue([card('p1', 'u2')]);
    vi.mocked(getUsersByIds).mockResolvedValue({});

    const { result, rerender } = renderHook(() => useProfilePage('other'), { wrapper });
    await waitFor(() => expect(result.current.cards).toBeDefined());
    expect(result.current.head).toBeUndefined();
    expect(result.current.isLoading).toBe(true);
    // Links are read as the viewer (connections-only cards, their blocks): they wait.
    expect(listLinksToAuthor).not.toHaveBeenCalled();

    mockUseAuth.mockReturnValue({ user: null, loading: false });
    rerender();

    await waitFor(() => expect(result.current.head).toBeDefined());
    expect(result.current.isLoading).toBe(false);
    expect(result.current.head!.user!.id).toBe('u2');
  });

  it('still reports not-loading + empty profile for a handle that does not exist', async () => {
    mockUseAuth.mockReturnValue({ user: null, loading: false });
    vi.mocked(getUserByHandle).mockResolvedValue(null);

    const { result } = renderHook(() => useProfileByHandle('ghost'), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.isLoading).toBe(false);
    expect(result.current.data!.user).toBeNull();
    expect(getPublicCardsByAuthor).not.toHaveBeenCalled();
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

// The app-wide SWR defaults (SWRProvider): coming back to the tab doesn't
// re-run every fetcher on the page — only what must stay live does.
describe('revalidation on tab focus', () => {
  function appWrapper({ children }: { children: ReactNode }) {
    return (
      // SWR ignores focus for 5 s after mount by default; tests don't wait that long.
      <SWRConfig value={{ ...SWR_DEFAULTS, provider: () => new Map(), dedupingInterval: 0, focusThrottleInterval: 0 }}>
        {children}
      </SWRConfig>
    );
  }
  const focusTab = async () => {
    await new Promise((r) => setTimeout(r, 5));
    act(() => void window.dispatchEvent(new Event('focus')));
  };

  it('leaves the feed alone', async () => {
    vi.mocked(getLatestPublishedFeed).mockResolvedValue([card('c1', 'a1')]);
    vi.mocked(getUsersByIds).mockResolvedValue({ a1: user('a1') });
    const { result } = renderHook(() => useFeed(), { wrapper: appWrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());

    await focusTab();
    await new Promise((r) => setTimeout(r, 20));
    expect(getLatestPublishedFeed).toHaveBeenCalledTimes(1);
  });

  it('still refreshes conversations and the block list', async () => {
    vi.mocked(listConversations).mockResolvedValue([]);
    vi.mocked(listMyConnectionUids).mockResolvedValue([]);
    vi.mocked(getUsersByIds).mockResolvedValue({});
    // (Read `data` while rendering: SWR re-renders only for what a render used.)
    const convos = renderHook(() => useConversations().data, { wrapper: appWrapper });
    const blocks = renderHook(() => useMyBlockedIds().data, { wrapper: appWrapper });
    await waitFor(() => expect(convos.result.current).toBeDefined());
    await waitFor(() => expect(blocks.result.current).toBeDefined());
    vi.mocked(listConversations).mockClear();
    vi.mocked(getMyBlockedIds).mockClear();

    await focusTab();
    await waitFor(() => expect(listConversations).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(getMyBlockedIds).toHaveBeenCalled());
  });
});

describe('useFeed paging', () => {
  it('fetches only the next page on "load more", not page one again', async () => {
    const page = (from: number) =>
      Array.from({ length: 12 }, (_, i) => card(`c${from + i}`, 'a1', { publishedAt: new Date(2026, 0, 30, 0, from + i) }));
    vi.mocked(getLatestPublishedFeed).mockImplementation(async (_n, cursor) => (cursor ? page(12) : page(0)));
    vi.mocked(getUsersByIds).mockResolvedValue({ a1: user('a1') });

    const { result } = renderHook(() => useFeed(), { wrapper });
    await waitFor(() => expect(result.current.data?.cards).toHaveLength(12));
    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.data?.cards).toHaveLength(24));

    expect(vi.mocked(getLatestPublishedFeed).mock.calls.map(([, cursor]) => (cursor ? 'next' : 'first'))).toEqual([
      'first',
      'next',
    ]);
  });
});

describe('useRecommendedFeed', () => {
  it("asks with the viewer's ID token (callApi), so it never waits on the session cookie", async () => {
    vi.mocked(callApi).mockResolvedValue({ items: [{ cardId: 'r1', reason: 'why' }] });
    vi.mocked(getCardById).mockResolvedValue(card('r1', 'a2'));
    vi.mocked(getUsersByIds).mockResolvedValue({ a2: user('a2') });

    const { result } = renderHook(() => useRecommendedFeed(), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(callApi).toHaveBeenCalledWith('/api/recommend/feed');
    expect(result.current.data!.cards.map((c) => c.id)).toEqual(['r1']);
    expect(result.current.data!.reasons).toEqual({ r1: 'why' });
  });

  it('counts as loading while auth is still restoring, so "none yet" never reads as "none"', async () => {
    mockUseAuth.mockReturnValue({ user: null, loading: true });
    const { result } = renderHook(() => useRecommendedFeed(), { wrapper });
    expect(result.current.isLoading).toBe(true);
    expect(callApi).not.toHaveBeenCalled();
  });

  it('comes back empty (not failed) when the server call fails', async () => {
    vi.mocked(callApi).mockRejectedValue(new Error('500'));
    const { result } = renderHook(() => useRecommendedFeed(), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data!.cards).toEqual([]);
  });
});
