// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderWithIntl, screen } from '@/../test/render';
import type { Card, User } from '@/lib/db/types';

// The page's data boundary is the SWR hook. We mock it to drive the page
// through its three states (loading / loaded-with-cards / empty) and assert
// that entering the page renders the fetched feed.
const mockUseFeed = vi.fn();
vi.mock('@/lib/data/hooks', () => ({
  useFeed: () => mockUseFeed(),
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
});
