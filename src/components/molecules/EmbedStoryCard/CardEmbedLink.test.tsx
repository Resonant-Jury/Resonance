// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ComponentProps } from 'react';
import { SWRConfig } from 'swr';
import { renderWithIntl, screen, waitFor, within } from '@/../test/render';
import type { Card, User } from '@/lib/db/types';

// Cards embedded in a story (a paragraph holding only a /card/… link), read
// through the card page's own data path: the client read layer, the viewer's
// blocks and auth are the module boundary.
const mockUseAuth = vi.fn();
vi.mock('@/components/providers/AuthProvider', () => ({ useAuth: () => mockUseAuth() }));
vi.mock('@/i18n/navigation', () => ({
  Link: (props: ComponentProps<'a'>) => <a {...props} />,
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

// jsdom lays nothing out: give every element a block's size, so the block draws its measured shape.
function layOut(w: number, h: number) {
  const width = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth');
  const height = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight');
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, get: () => w });
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get: () => h });
  return () => {
    Object.defineProperty(HTMLElement.prototype, 'offsetWidth', width!);
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', height!);
  };
}

describe('embedded cards', () => {
  it('draws the card as one block that opens it, named by its title: byline, title, excerpt, source', async () => {
    vi.mocked(getCardBySlugOrId).mockResolvedValue(card('walk', { story: 'After the rain the street smelled of earth.' }));
    renderStory('[Walk](/card/walk)');

    const block = await screen.findByRole('link', { name: 'Live title of walk' });
    expect(block).toHaveAttribute('href', '/card/walk');
    expect(block).not.toHaveAttribute('aria-busy');
    expect(within(block).getByText('writer')).toBeInTheDocument();
    expect(within(block).getByText('After the rain the street smelled of earth.')).toBeInTheDocument();
    // The source line, as under a card shared in a thread.
    expect(within(block).getAllByText('Resonance').length).toBeGreaterThan(0);
    // The only link: the old chip (an <article> in its own link) is gone.
    expect(screen.getAllByRole('link')).toHaveLength(1);
    expect(block.querySelector('article')).toBeNull();
  });

  it('wears the story link card’s container: its fill with no pen line, the content cut by the same outline', async () => {
    const restore = layOut(480, 360);
    try {
      vi.mocked(getCardBySlugOrId).mockResolvedValue(card('walk', { media: { url: 'https://img.example/c.avif' } as Card['media'] }));
      renderStory('[Walk](/card/walk)');
      const block = await screen.findByRole('link', { name: 'Live title of walk' });
      expect(block).not.toHaveAttribute('data-shape-pending');
      const paths = [...block.querySelectorAll(':scope > svg path')];
      const fill = paths.find((p) => p.getAttribute('fill') === 'var(--bubble-theirs)')!;
      expect(fill).toBeDefined();
      expect([...block.querySelectorAll(':scope > svg')].some((svg) => svg.querySelector('[stroke]'))).toBe(false);
      // The cover runs edge to edge inside content clipped by the block's own outline.
      const img = block.querySelector('img')!;
      expect(img).toHaveAttribute('src', 'https://img.example/c.avif');
      const content = img.closest<HTMLElement>('[data-clipped]')!;
      expect(content.style.clipPath).toBe(`path('${fill.getAttribute('d')}')`);
    } finally {
      restore();
    }
  });

  it('reads a card embedded twice once, and shows both as blocks', async () => {
    vi.mocked(getCardBySlugOrId).mockResolvedValue(card('walk'));
    renderStory('[Walk](/card/walk)\n\nIn between.\n\n[Walk again](/card/walk)');

    await waitFor(() => expect(screen.getAllByRole('link', { name: 'Live title of walk' })).toHaveLength(2));
    expect(screen.getAllByText('writer')).toHaveLength(2);
    expect(getCardBySlugOrId).toHaveBeenCalledTimes(1);
    expect(getUserById).toHaveBeenCalledTimes(1);
  });

  it("names someone else's anonymous card Anonymous, without fetching the profile it hides", async () => {
    vi.mocked(getCardBySlugOrId).mockResolvedValue(card('letter', { anonymous: true, authorId: 'secret' }));
    renderStory('[A letter](/card/letter)');
    const block = await screen.findByRole('link', { name: 'Live title of letter' });
    expect(within(block).getByText('Anonymous')).toBeInTheDocument();
    expect(screen.queryByText('writer')).not.toBeInTheDocument();
    expect(getUserById).not.toHaveBeenCalled();
  });

  it('never names the author of an anonymous card, even when the page knows them', async () => {
    mockUseAuth.mockReturnValue({ user: { id: 'a1' }, loading: false });
    vi.mocked(getCardBySlugOrId).mockResolvedValue(card('mine', { anonymous: true }));
    renderStory('[Mine](/card/mine)');
    const block = await screen.findByRole('link', { name: 'Live title of mine' });
    expect(within(block).getByText('Anonymous')).toBeInTheDocument();
    expect(within(block).queryByText('writer')).not.toBeInTheDocument();
  });

  it("falls back to the plain link for a card by someone the viewer blocked", async () => {
    mockUseAuth.mockReturnValue({ user: { id: 'me' }, loading: false });
    vi.mocked(getMyBlockedIds).mockResolvedValue(new Set(['a1']));
    vi.mocked(getCardBySlugOrId).mockResolvedValue(card('walk'));
    renderStory('[Their walk](/card/walk)');

    await waitFor(() => expect(getMyBlockedIds).toHaveBeenCalled());
    const link = await screen.findByRole('link', { name: 'Their walk' });
    expect(link).toHaveAttribute('href', '/card/walk');
    expect(link).not.toHaveAttribute('data-shape-pending');
    expect(link.querySelector('svg')).toBeNull();
    expect(screen.queryByText('Live title of walk')).not.toBeInTheDocument();
  });

  it('falls back to the plain link for a card the viewer may not read', async () => {
    vi.mocked(getCardBySlugOrId).mockResolvedValue(null);
    renderStory('[Private one](/card/hidden)');
    const link = await screen.findByRole('link', { name: 'Private one' });
    expect(link).toHaveTextContent('Private one');
    expect(link).not.toHaveAttribute('aria-busy');
  });

  it('waits for auth to settle before reading (a connections-only card must not be cached as unreadable)', async () => {
    mockUseAuth.mockReturnValue({ user: null, loading: true });
    renderStory('[Walk](/card/walk)');
    await new Promise((r) => setTimeout(r, 0));
    expect(getCardBySlugOrId).not.toHaveBeenCalled();
    // Meanwhile the shared card's skeleton in the same block, named by the link's own words and already opening the card.
    const block = screen.getByRole('link', { name: 'Walk' });
    expect(block).toHaveAttribute('aria-busy', 'true');
    expect(block).toHaveAttribute('href', '/card/walk');
    expect(block).toHaveAttribute('data-shape-pending');
  });
});
