// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderWithIntl, screen } from '@/../test/render';
import type { Card, User } from '@/lib/db/types';

// Page data boundary: useCard / useRelated. Drive them to cover the page's
// branching (loading → skeleton, not-found → message, loaded → article).
const mockUseCard = vi.fn();
const mockUseRelated = vi.fn();
vi.mock('@/lib/data/hooks', () => ({
  useCard: () => mockUseCard(),
  useRelated: () => mockUseRelated(),
}));
vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'c1' }),
}));
vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));
// The detail body composes leaf components that perform their own Firestore
// reads (resonance state, author metrics). They aren't the subject here, so we
// stub them to keep the test focused on the page's data wiring.
vi.mock('@/components/molecules/CardDetail/CardViewerActions', () => ({
  CardViewerActions: () => <div data-testid="viewer-actions" />,
}));
vi.mock('@/components/molecules/CardDetail/CardAuthorMetrics', () => ({
  CardAuthorMetrics: () => <div data-testid="author-metrics" />,
}));

import CardDetailPage from './page';

function card(id: string): Card {
  return {
    id,
    authorId: 'a1',
    thoughtCore: 'The core thought of this card',
    story: 'The longer story body of this card.',
    tags: ['grief', 'growth'],
    originalLocale: 'en',
    translations: {},
    visibility: 'public',
    publishedAt: new Date('2026-01-01'),
    readCount: 1,
    resonanceCount: 2,
    inviteCount: 0,
  };
}
function author(): User {
  return {
    id: 'a1',
    handle: '@author',
    region: 'Taipei',
    primaryLocale: 'en',
    autoTranslateTo: [],
    verified: true,
    phoneHash: '',
    avatarSeed: '7',
    initials: 'AU',
    accentColor: 'var(--accent)',
    joinedAt: new Date('2025-01-01'),
    handleChangedAt: new Date('2025-01-01'),
  };
}

beforeEach(() => {
  mockUseRelated.mockReturnValue({ data: { cards: [], authors: {} } });
});
afterEach(() => vi.clearAllMocks());

describe('CardDetailPage', () => {
  it('renders the fetched card body, author, and tags once loaded', () => {
    mockUseCard.mockReturnValue({ data: { card: card('c1'), author: author() }, isLoading: false });
    renderWithIntl(<CardDetailPage />);

    expect(screen.getByText('The core thought of this card')).toBeInTheDocument();
    expect(screen.getByText('The longer story body of this card.')).toBeInTheDocument();
    expect(screen.getByText('@author')).toBeInTheDocument();
    expect(screen.getByText('grief')).toBeInTheDocument();
  });

  it('shows the not-found message when the card is missing or not visible', () => {
    mockUseCard.mockReturnValue({ data: null, isLoading: false });
    renderWithIntl(<CardDetailPage />);
    expect(screen.getByText("This card can't be found")).toBeInTheDocument();
    expect(screen.queryByText('The core thought of this card')).not.toBeInTheDocument();
  });

  it('shows a skeleton (neither article nor not-found) while loading', () => {
    mockUseCard.mockReturnValue({ data: undefined, isLoading: true });
    renderWithIntl(<CardDetailPage />);
    expect(screen.queryByText("This card can't be found")).not.toBeInTheDocument();
    expect(screen.queryByText('The core thought of this card')).not.toBeInTheDocument();
  });
});
