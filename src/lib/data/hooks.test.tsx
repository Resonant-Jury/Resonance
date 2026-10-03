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
  getPublicCardView: vi.fn(),
  getPublicFeedPage: vi.fn(),
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
  listenConversations: vi.fn(),
  listenThread: vi.fn(),
}));
vi.mock('@/lib/db/firestore/client/notifications', () => ({
  listenNotifications: vi.fn(),
}));
vi.mock('@/lib/db/firestore/client/api', () => ({
  callApi: vi.fn(),
  ApiError: class ApiError extends Error {
    constructor(
      readonly status: number,
      readonly code: string,
      message: string,
    ) {
      super(message);
    }
  },
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
  getPublicCardView,
  getPublicFeedPage,
  getRelatedCards,
  getResonanceCards,
  getUserById,
  getUserByHandle,
  getUsersByIds,
  isConnected,
  listMyConnectionUids,
  resolveCardId,
} from '@/lib/db/firestore/client/reads';
import { listenConversations } from '@/lib/db/firestore/client/messages';
import { listenNotifications } from '@/lib/db/firestore/client/notifications';
import { resetLive } from './live';
import { ApiError, callApi } from '@/lib/db/firestore/client/api';
import { loadMyThoughtMap } from '@/lib/db/firestore/client/thoughtMap';
import type { CardDetailBody, FeedCardBody, FeedPageBody } from '@/lib/api/v1/schemas';
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
  useCardSummaries,
  useNotifications,
  useRecommendedFeed,
  useRelated,
  useResonators,
  useUnreadMessages,
  type CardBoxShelf,
} from './hooks';
import type { Conversation, Notification } from '@/lib/db/types';

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

/** A v1 card summary, as the server answers lists (an anonymous one has no author). */
function summary(id: string, authorId: string | null, extra: Partial<FeedCardBody> = {}): FeedCardBody {
  return {
    id,
    slug: null,
    title: `Card ${id}`,
    excerpt: `${id}, briefly`,
    tags: [],
    publishedAt: '2026-01-01T00:00:00.000Z',
    author: authorId
      ? { id: authorId, handle: `h-${authorId}`, initials: 'X', accentColor: 'c', avatarUrl: null, avatarSeed: '1', verified: false, region: null }
      : null,
    anonymous: authorId === null,
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

/** Answer callApi by path (the first route whose prefix matches); anything else is a 404. */
function api(routes: Record<string, unknown>) {
  vi.mocked(callApi).mockImplementation((async (path: string) => {
    const hit = Object.keys(routes).find((prefix) => path.startsWith(prefix));
    if (hit === undefined) throw new ApiError(404, 'not_found', 'No such thing.');
    const answer = routes[hit];
    return typeof answer === 'function' ? (answer as (p: string) => unknown)(path) : answer;
  }) as never);
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
  vi.mocked(getMyBlockedIds).mockResolvedValue(new Set());
  api({});
});
afterEach(() => {
  vi.clearAllMocks();
  resetLive();
});

// The latest feed comes from the server: an anonymous card's document names
// its author, so the rules keep it out of the browser's own queries, and the
// server hands it out without its byline.
describe('useFeed', () => {
  it('signed in: one request to /api/v1/feed, bylines included, an anonymous card without one', async () => {
    api({ '/api/v1/feed': { cards: [summary('c1', 'a1'), summary('anon', null)], nextCursor: null } satisfies FeedPageBody });

    const { result } = renderHook(() => useFeed(), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());

    expect(callApi).toHaveBeenCalledWith('/api/v1/feed?limit=12');
    expect(result.current.data!.cards.map((c) => c.id)).toEqual(['c1', 'anon']);
    expect(result.current.data!.authors.a1.handle).toBe('h-a1');
    expect(result.current.data!.cards[1]).toMatchObject({ anonymous: true, authorId: '' });
    // Nothing read through the rules, no profile fetched.
    expect(getUsersByIds).not.toHaveBeenCalled();
    expect(getPublicFeedPage).not.toHaveBeenCalled();
    expect(result.current.hasMore).toBe(false);
  });

  it('signed out: the public page from the server (anonymous cards in it too), at once', async () => {
    mockUseAuth.mockReturnValue({ user: null, loading: true });
    vi.mocked(getPublicFeedPage).mockResolvedValue({ cards: [summary('c1', 'a1'), summary('anon', null)], nextCursor: '2026-01-01T00:00:00.000Z' });

    const { result } = renderHook(() => useFeed(), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(getPublicFeedPage).toHaveBeenCalledWith(12, undefined);
    expect(result.current.data!.cards.map((c) => c.id)).toEqual(['c1', 'anon']);
    expect(result.current.hasMore).toBe(true);
    expect(callApi).not.toHaveBeenCalled();
  });
});

// An anonymous card still carries its author's uid (rules can't redact a
// field), but the browser must never download the profile it is anonymous
// from — every surface shows the anonymous byline for it anyway.
describe('anonymous cards', () => {
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

// Blocking hides the blocked person's cards from every feed surface. The
// server drops them from the feed (anonymous ones included) and cuts pages on
// its raw query: a page short only because a blocked author was dropped is
// not the end of the feed.
describe('blocked authors', () => {
  it("keep paging past a page the server shortened by a blocked author's cards", async () => {
    api({ '/api/v1/feed': { cards: [summary('c1', 'a1')], nextCursor: '2026-01-01T00:00:00.000Z' } satisfies FeedPageBody });
    const { result } = renderHook(() => useFeed(), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data!.cards).toHaveLength(1);
    expect(result.current.hasMore).toBe(true);
  });

  // The block list waits for Auth to restore the viewer (client/blocks.ts), so
  // reading it only after the cards came back would add that wait to every load.
  it('reads the block list beside the cards, not after them', async () => {
    let answer: (cards: Card[]) => void = () => {};
    vi.mocked(getRelatedCards).mockReturnValue(new Promise((resolve) => (answer = resolve)));
    vi.mocked(getMyBlockedIds).mockResolvedValue(new Set(['bad']));
    vi.mocked(getUsersByIds).mockResolvedValue({ a1: user('a1') });

    const { result } = renderHook(() => useRelated('c0'), { wrapper });
    await waitFor(() => expect(getMyBlockedIds).toHaveBeenCalled());
    expect(result.current.data).toBeUndefined();

    answer([card('c1', 'bad'), card('c2', 'a1')]);
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data!.cards.map((c) => c.id)).toEqual(['c2']);
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

  it("show a signed-out reader no card links (they name an anonymous card's author too: the server reads them)", async () => {
    mockUseAuth.mockReturnValue({ user: null, loading: false });
    vi.mocked(getUserByHandle).mockResolvedValue(user('u2', 'bob'));
    const { result } = renderHook(() => useProfileLinks('bob').data, { wrapper });
    expect(result.current).toEqual({ cards: [], authors: {} });
    expect(getCardById).not.toHaveBeenCalled();
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
    vi.mocked(getPublicCardView).mockResolvedValue({ id: null, view: null });
    const { result } = renderHook(() => useCard('missing'), { wrapper });
    await waitFor(() => expect(result.current.data).not.toBeUndefined());
    expect(result.current.data).toBeNull();
    expect(getUserById).not.toHaveBeenCalled();
  });
});

// Someone else's anonymous card: the rules refuse the browser's read (its
// document names its author), so the page asks the server, which answers it
// without its author — and applies the reader's blocks to it.
describe('useCard on a card the rules keep from the browser', () => {
  const anonDetail = (extra: Partial<CardDetailBody> = {}): CardDetailBody => ({
    card: summary('anon', null, { slug: 'a-quiet-night' }),
    story: 'The whole story, from the server.',
    visibility: 'public',
    anonymous: true,
    resonanceCount: 3,
    coreInsight: null,
    isOwner: false,
    referenceCard: null,
    ...extra,
  });

  it('signed in: asks GET /api/v1/cards/{key} and shows the card with the anonymous byline, its author never named', async () => {
    vi.mocked(getCardBySlugOrId).mockResolvedValue(null);
    api({ '/api/v1/cards/a-quiet-night': anonDetail() });
    const { result } = renderHook(() => useCard('a-quiet-night'), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());
    const view = result.current.data!;
    expect(view.card).toMatchObject({ id: 'anon', authorId: '', anonymous: true, story: 'The whole story, from the server.', resonanceCount: 3 });
    // A whole card, not a list summary (which would never seed a card page).
    expect(view.card.summary).toBeUndefined();
    expect(view.author).toMatchObject({ handle: '', initials: '·' });
    expect(getUserById).not.toHaveBeenCalled();
  });

  it("is not found when the server says so (gone, private — or by someone the reader blocked)", async () => {
    vi.mocked(getCardBySlugOrId).mockResolvedValue(null);
    api({});
    const { result } = renderHook(() => useCard('a-quiet-night'), { wrapper });
    await waitFor(() => expect(result.current.data).not.toBeUndefined());
    expect(result.current.data).toBeNull();
  });

  it("names the viewer as the author of their own card when the server says they wrote it", async () => {
    vi.mocked(getCardBySlugOrId).mockResolvedValue(null);
    vi.mocked(getUserById).mockResolvedValue(user('me'));
    api({ '/api/v1/cards/mine': anonDetail({ isOwner: true }) });
    const { result } = renderHook(() => useCard('mine'), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data!.card.authorId).toBe('me');
    expect(result.current.data!.author!.id).toBe('me');
  });

  it("signed out: asks for the card page's public seed, which has the card without its author", async () => {
    mockUseAuth.mockReturnValue({ user: null, loading: false });
    vi.mocked(getCardBySlugOrId).mockResolvedValue(null);
    vi.mocked(getPublicCardView).mockResolvedValue({
      id: 'anon',
      view: {
        card: {
          id: 'anon', authorId: '', slug: 'a-quiet-night', thoughtCore: 'Unsigned', story: 'Public, unsigned.', tags: [],
          media: null, originalLocale: 'en', referenceCardId: null, publishedAt: '2026-01-01T00:00:00.000Z',
          resonanceCount: 0, accentHue: null, anonymous: true,
        },
        author: null,
      },
    });
    const { result } = renderHook(() => useCard('a-quiet-night'), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(getPublicCardView).toHaveBeenCalledWith('a-quiet-night');
    expect(result.current.data!.card).toMatchObject({ authorId: '', anonymous: true, story: 'Public, unsigned.' });
    expect(callApi).not.toHaveBeenCalled();
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
  // The box read all six shelves (three of them the same query of the
  // viewer's cards, each whole) before showing any; it reads the one on screen.
  it('reads only the shelf on screen, with its authors', async () => {
    vi.mocked(getCardsByAuthor).mockImplementation(async (_uid, tab) =>
      tab === 'draft' ? [card('draft', 'me', { publishedAt: null })] : [card(`${tab}-card`, 'me')],
    );
    vi.mocked(getUsersByIds).mockResolvedValue({ me: user('me') });

    const { result, rerender } = renderHook(({ shelf }) => useMyCardBox(shelf).data, {
      wrapper,
      initialProps: { shelf: 'draft' as CardBoxShelf | null },
    });
    await waitFor(() => expect(result.current).toBeDefined());

    expect(result.current!.cards.map((c) => c.id)).toEqual(['draft']);
    expect(result.current!.authors).toHaveProperty('me');
    expect(vi.mocked(getCardsByAuthor).mock.calls.map((c) => c[1])).toEqual(['draft']);
    expect(callApi).not.toHaveBeenCalled();

    // Opening another shelf reads that one.
    rerender({ shelf: 'private' });
    await waitFor(() => expect(result.current?.cards.map((c) => c.id)).toEqual(['private-card']));
    expect(vi.mocked(getCardsByAuthor).mock.calls.map((c) => c[1])).toEqual(['draft', 'private']);
  });

  it("reads others' cards from the server, an anonymous original without its author", async () => {
    api({
      '/api/v1/me/cards?tab=resonated': { cards: [summary('res', 'other'), summary('anon-orig', null)] },
      '/api/v1/me/cards?tab=bookmarks': { cards: [summary('b1', 'other')] },
    });

    const { result, rerender } = renderHook(({ shelf }) => useMyCardBox(shelf).data, {
      wrapper,
      initialProps: { shelf: 'resonated' as CardBoxShelf | null },
    });
    await waitFor(() => expect(result.current).toBeDefined());
    expect(result.current!.cards.map((c) => c.id)).toEqual(['res', 'anon-orig']);
    expect(result.current!.cards[1]).toMatchObject({ authorId: '', anonymous: true });
    expect(Object.keys(result.current!.authors)).toEqual(['other']);

    // A bookmarked card that went private is simply not in the server's answer.
    rerender({ shelf: 'bookmarks' });
    await waitFor(() => expect(result.current?.cards.map((c) => c.id)).toEqual(['b1']));
    // Nobody else's card is read through the rules.
    expect(getCardsByAuthor).not.toHaveBeenCalled();
    expect(getCardById).not.toHaveBeenCalled();
  });

  it('stays idle (no fetch) until a shelf is chosen, and when no viewer is signed in', async () => {
    const before = renderHook(() => useMyCardBox(null), { wrapper });
    mockUseAuth.mockReturnValue({ user: null, loading: false });
    const { result } = renderHook(() => useMyCardBox('published'), { wrapper });
    // null SWR key → never fetches
    await new Promise((r) => setTimeout(r, 0));
    expect(before.result.current.data).toBeUndefined();
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
        // The viewer's resonances: one with an original by someone else, one
        // with someone's anonymous card (which the rules won't read here).
        draft: [
          card('my-answer', 'me', { publishedAt: null, referenceCardId: 'theirs' }),
          card('my-other-answer', 'me', { publishedAt: null, referenceCardId: 'anon-orig' }),
        ],
      };
      return byTab[tab] ?? [];
    });
    vi.mocked(getCardById).mockImplementation(async (id) => (id === 'theirs' ? card('theirs', 'other') : null));
    api({ '/api/v1/cards?keys=': (path: string) => ({ cards: path.includes('anon-orig') ? [summary('anon-orig', null)] : [] }) });
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
    expect(Object.keys(map.cards).sort()).toEqual(['anon-orig', 'my-answer', 'my-other-answer', 'own', 'theirs']);
    expect(map.resonatedIds).toEqual(['theirs', 'anon-orig']);
    expect(map.nodes.map((n) => n.cardId).sort()).toEqual(['own', 'theirs']);
    // The originals come from the viewer's cards it just read — no second
    // scan of those cards (the card box's resonated shelf).
    expect(vi.mocked(getCardsByAuthor).mock.calls.map((c) => c[1]).sort()).toEqual(['draft', 'private', 'published']);
  });

  it('keeps a placed card older than the newest 40 own cards the reads bring', async () => {
    vi.mocked(getCardsByAuthor).mockImplementation(async (_uid, tab) => (tab === 'published' ? [card('recent', 'me')] : []));
    vi.mocked(getCardById).mockImplementation(async (id) => (id === 'old' ? card('old', 'me') : null));
    api({ '/api/v1/me/cards?tab=resonated': { cards: [] }, '/api/v1/cards?keys=': { cards: [] } });
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

  it("asks the server for a placed card the rules won't read here (someone else's anonymous card)", async () => {
    vi.mocked(getCardsByAuthor).mockResolvedValue([]);
    vi.mocked(getCardById).mockResolvedValue(null);
    api({
      '/api/v1/me/cards?tab=resonated': { cards: [] },
      '/api/v1/cards?keys=unsigned': { cards: [summary('unsigned', null)] },
    });
    const node = (cardId: string) => ({ id: cardId, cardId, x: 0, y: 0, createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-01') });
    vi.mocked(loadMyThoughtMap).mockResolvedValue({ nodes: [node('unsigned')], edges: [], groups: [] });

    const { result } = renderHook(() => useMyThoughtMap(), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data!.nodes.map((n) => n.cardId)).toEqual(['unsigned']);
    expect(result.current.data!.cards.unsigned).toMatchObject({ authorId: '', anonymous: true });
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

  it("reads the viewer's blocks, the connection and the cards together, not in a chain", async () => {
    vi.mocked(getUserByHandle).mockResolvedValue(user('u2', 'other'));
    // None of these answer until the test says so.
    const never = () => new Promise<never>(() => {});
    vi.mocked(getMyBlockedIds).mockImplementation(never);
    vi.mocked(isConnected).mockImplementation(never);
    vi.mocked(getPublicCardsByAuthor).mockImplementation(never);

    const { result } = renderHook(() => useProfilePage('other'), { wrapper });
    await waitFor(() => expect(getPublicCardsByAuthor).toHaveBeenCalledWith('u2'));
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
    api({ '/api/v1/feed': { cards: [summary('c1', 'a1')], nextCursor: null } });
    const { result } = renderHook(() => useFeed(), { wrapper: appWrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());

    await focusTab();
    await new Promise((r) => setTimeout(r, 20));
    expect(callApi).toHaveBeenCalledTimes(1);
  });

  it("still refreshes the viewer's connections and block list (the conversations themselves are live)", async () => {
    vi.mocked(listenConversations).mockImplementation((_uid, emit) => {
      emit([]);
      return () => {};
    });
    vi.mocked(listMyConnectionUids).mockResolvedValue([]);
    vi.mocked(getUsersByIds).mockResolvedValue({});
    const convos = renderHook(() => useConversations().data, { wrapper: appWrapper });
    const blocks = renderHook(() => useMyBlockedIds().data, { wrapper: appWrapper });
    await waitFor(() => expect(convos.result.current).toBeDefined());
    await waitFor(() => expect(blocks.result.current).toBeDefined());
    vi.mocked(listMyConnectionUids).mockClear();
    vi.mocked(getMyBlockedIds).mockClear();

    await focusTab();
    await waitFor(() => expect(listMyConnectionUids).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(getMyBlockedIds).toHaveBeenCalled());
    expect(listenConversations).toHaveBeenCalledTimes(1);
  });
});

// The header used to read every conversation, every connection and every
// person in them each 30 s, on every signed-in page, for one number.
describe('the header badges', () => {
  function conversation(id: string, other: string, unread: number): Conversation {
    return {
      id,
      participants: ['me', other],
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-02'),
      lastMessage: null,
      unread: { me: unread, [other]: 0 },
    };
  }
  /** The conversations listener: what it hears is pushed by the test. */
  function listenToConversations() {
    const heard: { emit: (c: Conversation[]) => void } = { emit: () => {} };
    vi.mocked(listenConversations).mockImplementation((_uid, emit) => {
      heard.emit = emit;
      return vi.fn();
    });
    return heard;
  }

  it('counts unread messages from one live list, reading no profiles or connections', async () => {
    const heard = listenToConversations();
    vi.mocked(getMyBlockedIds).mockResolvedValue(new Set(['blocked']));
    const { result } = renderHook(() => useUnreadMessages(), { wrapper });

    await waitFor(() => expect(listenConversations).toHaveBeenCalledWith('me', expect.any(Function), expect.any(Function)));
    act(() => heard.emit([conversation('a_me', 'a', 2), conversation('blocked_me', 'blocked', 5)]));
    await waitFor(() => expect(result.current).toBe(2));

    // A new message arrives: the count follows, without a read of its own.
    act(() => heard.emit([conversation('a_me', 'a', 3), conversation('b_me', 'b', 1), conversation('blocked_me', 'blocked', 5)]));
    expect(result.current).toBe(4);
    expect(listMyConnectionUids).not.toHaveBeenCalled();
    expect(getUsersByIds).not.toHaveBeenCalled();
  });

  it('shares the one listener with the messages list, which adds the people and connections', async () => {
    const heard = listenToConversations();
    vi.mocked(listMyConnectionUids).mockResolvedValue(['a', 'c']);
    vi.mocked(getUsersByIds).mockResolvedValue({ a: user('a'), c: user('c') });
    const { result } = renderHook(() => ({ badge: useUnreadMessages(), list: useConversations().data }), { wrapper });

    await waitFor(() => expect(listenConversations).toHaveBeenCalled());
    act(() => heard.emit([conversation('a_me', 'a', 1)]));
    await waitFor(() => expect(result.current.list).toBeDefined());

    expect(listenConversations).toHaveBeenCalledTimes(1);
    expect(result.current.badge).toBe(1);
    expect(result.current.list!.unreadTotal).toBe(1);
    expect(result.current.list!.conversations.map((c) => c.id)).toEqual(['a_me']);
    expect(result.current.list!.connectedWithoutConversation.map((u) => u.id)).toEqual(['c']);
  });

  it('keeps the bell live: a new notification, or one read elsewhere, shows without a reload', async () => {
    const heard: { emit: (n: Notification[]) => void } = { emit: () => {} };
    vi.mocked(listenNotifications).mockImplementation((_uid, emit) => {
      heard.emit = emit;
      return vi.fn();
    });
    const note = (id: string, readAt: Date | null): Notification => ({
      id,
      userId: 'me',
      type: 'note',
      payload: {},
      readAt,
      createdAt: new Date('2026-01-01'),
    });
    const { result } = renderHook(() => useNotifications(20).data, { wrapper });

    await waitFor(() => expect(listenNotifications).toHaveBeenCalledWith('me', expect.any(Function), expect.any(Function), 20));
    act(() => heard.emit([note('n1', null)]));
    expect(result.current!.map((n) => n.id)).toEqual(['n1']);
    act(() => heard.emit([note('n2', null), note('n1', new Date())]));
    expect(result.current!.filter((n) => n.readAt === null).map((n) => n.id)).toEqual(['n2']);
  });

  it('listens to nothing for a signed-out reader', async () => {
    mockUseAuth.mockReturnValue({ user: null, loading: false });
    const { result } = renderHook(() => useUnreadMessages(), { wrapper });
    await new Promise((r) => setTimeout(r, 10));
    expect(result.current).toBe(0);
    expect(listenConversations).not.toHaveBeenCalled();
  });
});

describe('useFeed paging', () => {
  it("fetches only the next page on \"load more\", from the server's cursor — not page one again", async () => {
    const page = (from: number) => Array.from({ length: 12 }, (_, i) => summary(`c${from + i}`, 'a1'));
    api({
      '/api/v1/feed': (path: string) =>
        path.includes('cursor=') ? { cards: page(12), nextCursor: null } : { cards: page(0), nextCursor: '2026-01-30T00:00:00.000Z' },
    });

    const { result } = renderHook(() => useFeed(), { wrapper });
    await waitFor(() => expect(result.current.data?.cards).toHaveLength(12));
    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.data?.cards).toHaveLength(24));

    expect(vi.mocked(callApi).mock.calls.map(([path]) => path)).toEqual([
      '/api/v1/feed?limit=12',
      '/api/v1/feed?limit=12&cursor=2026-01-30T00%3A00%3A00.000Z',
    ]);
    expect(result.current.hasMore).toBe(false);
  });
});

describe('useRecommendedFeed', () => {
  it("asks with the viewer's ID token (callApi), then for the picks themselves in one request", async () => {
    api({
      '/api/recommend/feed': { items: [{ cardId: 'r1', reason: 'why' }, { cardId: 'r2', reason: 'unsigned' }] },
      '/api/v1/cards?keys=r1,r2': { cards: [summary('r1', 'a2'), summary('r2', null)] },
    });

    const { result } = renderHook(() => useRecommendedFeed(), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(callApi).toHaveBeenCalledWith('/api/recommend/feed');
    // An anonymous pick comes too, without its author; nothing is read through the rules.
    expect(result.current.data!.cards.map((c) => c.id)).toEqual(['r1', 'r2']);
    expect(result.current.data!.cards[1]).toMatchObject({ authorId: '', anonymous: true });
    expect(result.current.data!.reasons).toEqual({ r1: 'why', r2: 'unsigned' });
    expect(getCardById).not.toHaveBeenCalled();
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

describe('useCardSummaries', () => {
  const summary = (id: string) => ({
    id,
    slug: null,
    title: `Card ${id}`,
    excerpt: '',
    tags: [],
    publishedAt: null,
    author: null,
    anonymous: true,
    visibility: 'public',
    imageUrl: null,
    imageLabel: null,
    accentHue: null,
    readMinutes: 1,
    referenceCardId: null,
    reason: null,
  });

  it('asks for at most 30 cards a request, side by side, and puts the answers together', async () => {
    const ids = Array.from({ length: 35 }, (_, i) => `c${String(i).padStart(2, '0')}`);
    vi.mocked(callApi).mockImplementation(async (path: string) => ({
      cards: new URL(path, 'http://x').searchParams.get('keys')!.split(',').map(summary),
    }));

    const { result } = renderHook(() => useCardSummaries([...ids, 'c00']), { wrapper });
    await waitFor(() => expect(result.current?.status).toBe('ready'));
    expect(callApi).toHaveBeenCalledTimes(2);
    expect(callApi).toHaveBeenCalledWith(`/api/v1/cards?keys=${ids.slice(0, 30).join(',')}`);
    expect(callApi).toHaveBeenCalledWith(`/api/v1/cards?keys=${ids.slice(30).join(',')}`);
    const ready = result.current as { status: 'ready'; cards: { cards: Card[] } };
    expect(ready.cards.cards.map((c) => c.id)).toEqual(ids);
    // Summaries, for lists: no author on an anonymous card, never a story.
    expect(ready.cards.cards[0]).toMatchObject({ authorId: '', anonymous: true, summary: { readMinutes: 1 } });
  });

  it('asks only for the cards not asked for yet as the list grows, and names what its answer covers', async () => {
    let fail = false;
    vi.mocked(callApi).mockImplementation(async (path: string) => {
      if (fail) throw new Error('offline');
      return { cards: new URL(path, 'http://x').searchParams.get('keys')!.split(',').filter((k) => k !== 'gone').map(summary) };
    });
    const { result, rerender } = renderHook(({ keys }) => useCardSummaries(keys), {
      wrapper,
      initialProps: { keys: ['c2', 'c1', 'gone'] },
    });
    await waitFor(() => expect(result.current?.status).toBe('ready'));
    expect(callApi).toHaveBeenCalledWith('/api/v1/cards?keys=c1,c2,gone');
    type Ready = { status: 'ready'; cards: { cards: Card[] }; asked: ReadonlySet<string>; failed: ReadonlySet<string> };
    let ready = result.current as Ready;
    // A card the viewer can't read was asked for, and isn't there: missing, not on its way.
    expect([...ready.asked].sort()).toEqual(['c1', 'c2', 'gone']);
    expect(ready.cards.cards.map((c) => c.id)).toEqual(['c1', 'c2']);

    // An older page brings another card in: only it goes out, and the others stay meanwhile.
    vi.mocked(callApi).mockClear();
    rerender({ keys: ['c3', 'c2', 'c1', 'gone'] });
    expect((result.current as Ready).cards.cards.map((c) => c.id)).toEqual(['c1', 'c2']);
    expect((result.current as Ready).asked.has('c3')).toBe(false);
    await waitFor(() => expect((result.current as Ready).asked.has('c3')).toBe(true));
    expect(callApi).toHaveBeenCalledTimes(1);
    expect(callApi).toHaveBeenCalledWith('/api/v1/cards?keys=c3');

    // A request that fails names its cards as failed (their embeds read them by themselves), once.
    fail = true;
    vi.mocked(callApi).mockClear();
    rerender({ keys: ['c4', 'c3', 'c2', 'c1', 'gone'] });
    await waitFor(() => expect((result.current as Ready).failed.has('c4')).toBe(true));
    rerender({ keys: ['c4', 'c3', 'c2', 'c1', 'gone'] });
    expect(callApi).toHaveBeenCalledTimes(1);
    ready = result.current as Ready;
    expect(ready.cards.cards.map((c) => c.id)).toEqual(['c1', 'c2', 'c3']);
  });

  it('asks for nothing with nothing shared, or no one signed in', async () => {
    expect(renderHook(() => useCardSummaries([]), { wrapper }).result.current).toBeNull();
    mockUseAuth.mockReturnValue({ user: null, loading: false });
    expect(renderHook(() => useCardSummaries(['c1']), { wrapper }).result.current).toBeNull();
    expect(callApi).not.toHaveBeenCalled();
  });
});
