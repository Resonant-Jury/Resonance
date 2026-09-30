// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderWithIntl, screen, userEvent } from '@/../test/render';
import type { Card, User } from '@/lib/db/types';

// The page's data boundary is the SWR hooks. We mock them to drive the page
// through its states (loading / loaded-with-cards / empty, and the latest and
// recommended streams arriving in either order) and assert what the reader
// sees.
const mockUseFeed = vi.fn();
const mockUseRecommendedFeed = vi.fn();
vi.mock('@/lib/data/hooks', () => ({
  useFeed: () => mockUseFeed(),
  useRecommendedFeed: () => mockUseRecommendedFeed(),
}));
// The grid seeds the card page's cache on click (cardPrefill), which reads the viewer.
vi.mock('@/components/providers/AuthProvider', () => ({
  useAuth: () => ({ user: { id: 'me' }, loading: false }),
}));
vi.mock('@/lib/hints', () => ({
  useHint: () => ({ visible: true, dismiss: vi.fn() }),
}));
// next-intl's Link needs routing config we don't stand up here; a plain anchor
// is enough to assert the card links the page builds.
vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

import HomeFeedPage from './page';

function card(id: string, authorId: string, thoughtCore: string): Card {
  return {
    id,
    authorId,
    thoughtCore,
    story: 'a story body',
    tags: ['tag'],
    originalLocale: 'en',
    translations: {},
    visibility: 'public',
    publishedAt: new Date('2026-01-01'),
    readCount: 0,
    resonanceCount: 0,
    inviteCount: 0,
  };
}
function user(id: string): User {
  return {
    id,
    handle: `@${id}`,
    region: 'TW',
    primaryLocale: 'en',
    autoTranslateTo: [],
    verified: false,
    phoneHash: '',
    avatarSeed: '1',
    initials: 'AA',
    accentColor: 'var(--accent)',
    joinedAt: new Date('2025-01-01'),
    handleChangedAt: new Date('2025-01-01'),
  };
}

// The personalized feed is incidental to these tests; default it to "no
// recommendations" so the page renders only the latest feed. (clearAllMocks
// keeps implementations, so this default survives across tests.)
mockUseRecommendedFeed.mockReturnValue({ data: undefined });

afterEach(() => vi.clearAllMocks());

describe('HomeFeedPage', () => {
  it('renders the fetched feed cards as links into their detail pages', () => {
    mockUseFeed.mockReturnValue({
      data: {
        cards: [card('c1', 'a1', 'A first resonant thought'), card('c2', 'a1', 'A second one')],
        authors: { a1: user('a1') },
      },
      isLoading: false,
    });

    renderWithIntl(<HomeFeedPage />);

    // Card titles (thoughtCore) render, and each is wrapped in a /card/:id link.
    expect(screen.getAllByText('A first resonant thought').length).toBeGreaterThan(0);
    const links = screen.getAllByRole('link').filter((a) => a.getAttribute('href')?.startsWith('/card/'));
    expect(links.map((a) => a.getAttribute('href'))).toEqual(
      expect.arrayContaining(['/card/c1', '/card/c2'])
    );
  });

  it('shows the empty-state CTA when the feed loaded with no cards', () => {
    mockUseFeed.mockReturnValue({ data: { cards: [], authors: {} }, isLoading: false });
    renderWithIntl(<HomeFeedPage />);
    expect(screen.getByText('Write your first card')).toBeInTheDocument();
  });

  it('shows skeletons (not the empty state) while the feed is loading', () => {
    mockUseFeed.mockReturnValue({ data: undefined, isLoading: true });
    renderWithIntl(<HomeFeedPage />);
    expect(screen.queryByText('Write your first card')).not.toBeInTheDocument();
  });

  it('offers "load more" only while the feed has more pages', async () => {
    const loadMore = vi.fn();
    mockUseFeed.mockReturnValue({
      data: { cards: [card('c1', 'a1', 'A thought')], authors: { a1: user('a1') } },
      isLoading: false,
      hasMore: true,
      loadMore,
    });

    const { unmount } = renderWithIntl(<HomeFeedPage />);
    const btn = screen.getByRole('button', { name: 'Load more' });
    await userEvent.setup().click(btn);
    expect(loadMore).toHaveBeenCalled();
    unmount();

    // Exhausted feed: the button disappears; the write CTA remains.
    mockUseFeed.mockReturnValue({
      data: { cards: [card('c1', 'a1', 'A thought')], authors: { a1: user('a1') } },
      isLoading: false,
      hasMore: false,
      loadMore,
    });
    renderWithIntl(<HomeFeedPage />);
    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument();
    expect(screen.getByText('Write a card')).toBeInTheDocument();
  });

  it('renders recommended cards without surfacing their match reasons', () => {
    mockUseFeed.mockReturnValue({ data: { cards: [], authors: {} }, isLoading: false });
    mockUseRecommendedFeed.mockReturnValue({
      data: {
        cards: [card('r1', 'a2', 'A resonant match')],
        authors: { a2: user('a2') },
        reasons: { r1: 'you both wrote about letting go' },
      },
    });

    renderWithIntl(<HomeFeedPage />);

    // The pick itself shows…
    expect(screen.getAllByText('A resonant match').length).toBeGreaterThan(0);
    // …but neither the hint line nor the per-card reason caption does — the
    // reason is deliberately hidden to keep the surprise of opening the card.
    expect(
      screen.queryByText('The insights you write decide which stories find you.'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText('because of “you both wrote about letting go”'),
    ).not.toBeInTheDocument();
  });
});

// Today's picks come from a server call that can take a while; the latest
// public cards come straight from Firestore. Whichever reaches the reader
// first leads, and nothing already on screen is ever reshuffled or swapped
// back for the skeleton.
describe('HomeFeedPage — latest first, picks when they come', () => {
  const latest = {
    data: {
      cards: [card('l1', 'a1', 'Latest one'), card('l2', 'a1', 'Latest two')],
      authors: { a1: user('a1') },
    },
    isLoading: false,
    hasMore: false,
    loadMore: vi.fn(),
  };
  const picks = {
    data: {
      cards: [card('r1', 'a2', 'A pick for you')],
      authors: { a2: user('a2') },
      reasons: { r1: 'why' },
    },
    isLoading: false,
  };
  /** The card links on screen, in reading order. */
  const shown = () =>
    screen
      .getAllByRole('link')
      .map((a) => a.getAttribute('href'))
      .filter((h) => h?.startsWith('/card/'));

  it('shows the latest cards while the picks are still on their way', () => {
    mockUseFeed.mockReturnValue(latest);
    mockUseRecommendedFeed.mockReturnValue({ data: undefined, isLoading: true });
    renderWithIntl(<HomeFeedPage />);
    expect(screen.getAllByText('Latest one').length).toBeGreaterThan(0);
    expect(shown()).toEqual(['/card/l1', '/card/l2']);
  });

  it('keeps the latest cards in place when the picks arrive after them, and offers the picks instead', async () => {
    mockUseFeed.mockReturnValue(latest);
    mockUseRecommendedFeed.mockReturnValue({ data: undefined, isLoading: true });
    const { rerender } = renderWithIntl(<HomeFeedPage />);

    mockUseRecommendedFeed.mockReturnValue(picks);
    rerender(<HomeFeedPage />);

    // Nothing moved: the reader is still looking at the same cards…
    expect(shown()).toEqual(['/card/l1', '/card/l2']);
    expect(screen.queryByText('A pick for you')).not.toBeInTheDocument();
    // …and a small hint says today's picks are ready.
    const hint = screen.getByRole('button', { name: "Today's picks are ready" });

    await userEvent.setup().click(hint);
    // Asked for, the picks go on top and the latest cards stay below them.
    expect(shown()).toEqual(['/card/r1', '/card/l1', '/card/l2']);
    expect(screen.queryByRole('button', { name: "Today's picks are ready" })).not.toBeInTheDocument();
  });

  it('never falls back to the skeleton once cards are showing', () => {
    // A signed-in reader: the picks' request only starts once auth has
    // restored, after the public latest cards are already up.
    mockUseFeed.mockReturnValue(latest);
    mockUseRecommendedFeed.mockReturnValue({ data: undefined, isLoading: false });
    const { rerender } = renderWithIntl(<HomeFeedPage />);
    expect(shown()).toEqual(['/card/l1', '/card/l2']);

    mockUseRecommendedFeed.mockReturnValue({ data: undefined, isLoading: true });
    rerender(<HomeFeedPage />);
    expect(shown()).toEqual(['/card/l1', '/card/l2']);
  });

  it('leads with the picks when they are ready before the latest cards', async () => {
    mockUseFeed.mockReturnValue({ data: undefined, isLoading: true, hasMore: false, loadMore: vi.fn() });
    mockUseRecommendedFeed.mockReturnValue(picks);
    const { rerender } = renderWithIntl(<HomeFeedPage />);
    expect(shown()).toEqual(['/card/r1']);

    // Latest cards arriving later wait behind「載入更多」, as they always have.
    mockUseFeed.mockReturnValue(latest);
    rerender(<HomeFeedPage />);
    expect(shown()).toEqual(['/card/r1']);
    expect(screen.queryByRole('button', { name: "Today's picks are ready" })).not.toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Load more' }));
    expect(shown()).toEqual(['/card/r1', '/card/l1', '/card/l2']);
  });

  it('waits for the picks before calling an empty latest feed empty', () => {
    mockUseFeed.mockReturnValue({ data: { cards: [], authors: {} }, isLoading: false });
    mockUseRecommendedFeed.mockReturnValue({ data: undefined, isLoading: true });
    const { rerender } = renderWithIntl(<HomeFeedPage />);
    expect(screen.queryByText('Write your first card')).not.toBeInTheDocument();

    mockUseRecommendedFeed.mockReturnValue({ data: { cards: [], authors: {}, reasons: {} }, isLoading: false });
    rerender(<HomeFeedPage />);
    expect(screen.getByText('Write your first card')).toBeInTheDocument();
  });
});
