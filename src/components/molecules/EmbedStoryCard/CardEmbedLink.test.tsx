// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ReactNode } from 'react';
import { SWRConfig } from 'swr';
import { renderWithIntl, screen, waitFor } from '@/../test/render';
import type { Card, User } from '@/lib/db/types';

// Cards embedded in a story (a paragraph holding only a /card/… link), read
// through the card page's own data path: the client read layer, the viewer's
// blocks and auth are the module boundary.
const mockUseAuth = vi.fn();
vi.mock('@/components/providers/AuthProvider', () => ({ useAuth: () => mockUseAuth() }));
vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children, className }: { href: string; children: ReactNode; className?: string }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));
vi.mock('@/lib/db/firestore/client/reads', () => ({
  getCardById: vi.fn(),
  getCardBySlugOrId: vi.fn(),
  resolveCardId: vi.fn(),
  getUserById: vi.fn(),
}));
vi.mock('@/lib/db/firestore/client/blocks', () => ({ getMyBlockedIds: vi.fn() }));

import { getCardBySlugOrId, getUserById } from '@/lib/db/firestore/client/reads';
import { getMyBlockedIds } from '@/lib/db/firestore/client/blocks';
import { StoryMarkdown } from '@/components/molecules/CardDetail/StoryMarkdown';

function card(id: string, extra: Partial<Card> = {}): Card {
  return {
    id,
    authorId: 'a1',
    slug: id,
    thoughtCore: `Live title of ${id}`,
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
const writer = { id: 'a1', handle: 'writer' } as User;

function renderStory(markdown: string) {
  return renderWithIntl(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <StoryMarkdown source={markdown} />
    </SWRConfig>,
  );
}

beforeEach(() => {
  mockUseAuth.mockReturnValue({ user: null, loading: false });
  vi.mocked(getMyBlockedIds).mockResolvedValue(new Set());
  vi.mocked(getUserById).mockResolvedValue(writer);
});
afterEach(() => vi.clearAllMocks());

describe('embedded cards', () => {
  it('reads a card embedded twice once, and shows both as mini cards', async () => {
    vi.mocked(getCardBySlugOrId).mockResolvedValue(card('walk'));
    const { container } = renderStory('[Walk](/card/walk)\n\nIn between.\n\n[Walk again](/card/walk)');

    await waitFor(() => expect(screen.getAllByText('Live title of walk')).toHaveLength(2));
    expect(container.querySelectorAll('article')).toHaveLength(2);
    expect(screen.getAllByText('writer')).toHaveLength(2);
    expect(getCardBySlugOrId).toHaveBeenCalledTimes(1);
    expect(getUserById).toHaveBeenCalledTimes(1);
  });

  it("names someone else's anonymous card Anonymous, without fetching the profile it hides", async () => {
    vi.mocked(getCardBySlugOrId).mockResolvedValue(card('letter', { anonymous: true, authorId: 'secret' }));
    renderStory('[A letter](/card/letter)');
    expect(await screen.findByText('Live title of letter')).toBeInTheDocument();
    expect(screen.getByText('Anonymous')).toBeInTheDocument();
    expect(getUserById).not.toHaveBeenCalled();
  });

  it("falls back to the plain link for a card by someone the viewer blocked", async () => {
    mockUseAuth.mockReturnValue({ user: { id: 'me' }, loading: false });
    vi.mocked(getMyBlockedIds).mockResolvedValue(new Set(['a1']));
    vi.mocked(getCardBySlugOrId).mockResolvedValue(card('walk'));
    const { container } = renderStory('[Their walk](/card/walk)');

    await waitFor(() => expect(getMyBlockedIds).toHaveBeenCalled());
    expect(await screen.findByRole('link', { name: 'Their walk' })).toHaveAttribute('href', '/card/walk');
    expect(container.querySelector('article')).toBeNull();
    expect(screen.queryByText('Live title of walk')).not.toBeInTheDocument();
  });

  it('falls back to the plain link for a card the viewer may not read', async () => {
    vi.mocked(getCardBySlugOrId).mockResolvedValue(null);
    renderStory('[Private one](/card/hidden)');
    expect(await screen.findByRole('link', { name: 'Private one' })).toBeInTheDocument();
  });

  it('waits for auth to settle before reading (a connections-only card must not be cached as unreadable)', async () => {
    mockUseAuth.mockReturnValue({ user: null, loading: true });
    renderStory('[Walk](/card/walk)');
    await new Promise((r) => setTimeout(r, 0));
    expect(getCardBySlugOrId).not.toHaveBeenCalled();
    // Holding the footprint with the link's own title meanwhile.
    expect(screen.getByText('Walk')).toBeInTheDocument();
  });
});
