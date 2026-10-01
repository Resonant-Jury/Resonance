// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReactNode } from 'react';
import { SWRConfig, type Cache } from 'swr';
import { renderHook } from '@testing-library/react';
import { renderWithIntl, screen, userEvent, waitFor } from '@/../test/render';
import type { Card, User } from '@/lib/db/types';

// A card clicked in a list opens its page on what the list already showed:
// the grid seeds the card page's SWR entry under the very key `useCard`
// computes, and the page still re-reads the card behind it.

vi.mock('@/lib/db/firestore/client/reads', () => ({
  getCardById: vi.fn(),
  getCardBySlugOrId: vi.fn(),
  getUserById: vi.fn(),
  getUsersByIds: vi.fn(),
}));
vi.mock('@/lib/db/firestore/client/blocks', () => ({ getMyBlockedIds: vi.fn() }));
const mockUseAuth = vi.fn();
vi.mock('@/components/providers/AuthProvider', () => ({ useAuth: () => mockUseAuth() }));
vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children, onClick }: { href: string; children: ReactNode; onClick?: () => void }) => (
    <a
      href={href}
      onClick={(e) => {
        e.preventDefault(); // jsdom can't navigate
        onClick?.();
      }}
    >
      {children}
    </a>
  ),
}));

import { getCardBySlugOrId } from '@/lib/db/firestore/client/reads';
import { CardLinkGrid } from '@/components/molecules/CardLinkGrid/CardLinkGrid';
import { useCard } from './hooks';

function card(id: string, authorId: string, extra: Partial<Card> = {}): Card {
  return {
    id,
    authorId,
    thoughtCore: `Thought ${id}`,
    story: 'The whole story',
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
function user(id: string): User {
  return {
    id,
    handle: `pen-${id}`,
    region: 'TW',
    primaryLocale: 'en',
    autoTranslateTo: [],
    verified: false,
    phoneHash: '',
    avatarSeed: '1',
    initials: 'P',
    accentColor: 'var(--accent)',
    joinedAt: new Date('2025-01-01'),
    handleChangedAt: new Date('2025-01-01'),
  };
}

/** One SWR cache shared by the list and the card page, as in the app. */
let cache: Cache;
function Swr({ children }: { children: ReactNode }) {
  return <SWRConfig value={{ provider: () => cache, dedupingInterval: 0 }}>{children}</SWRConfig>;
}

async function clickCard(cards: Card[], authors: Record<string, User>, title: string) {
  renderWithIntl(
    <Swr>
      <CardLinkGrid cards={cards} authors={authors} />
    </Swr>,
  );
  await userEvent.setup().click(screen.getAllByText(title)[0]);
}

beforeEach(() => {
  cache = new Map() as unknown as Cache;
  vi.clearAllMocks();
  mockUseAuth.mockReturnValue({ user: { id: 'me' }, loading: false });
  // The page's own read is still on its way.
  vi.mocked(getCardBySlugOrId).mockReturnValue(new Promise(() => {}));
});

describe('opening a card from a list', () => {
  it('shows the card page at once, under the key the page reads (its slug and the viewer)', async () => {
    await clickCard([card('c1', 'a1', { slug: 'a-quiet-morning' })], { a1: user('a1') }, 'Thought c1');

    const page = renderHook(() => useCard('a-quiet-morning'), { wrapper: Swr });
    expect(page.result.current.isLoading).toBe(false);
    expect(page.result.current.data?.card.story).toBe('The whole story');
    expect(page.result.current.data?.author?.handle).toBe('pen-a1');
    // …and the page still asks for the card itself (on the next frame).
    await waitFor(() => expect(getCardBySlugOrId).toHaveBeenCalledWith('a-quiet-morning'));
  });

  it('keys a card without a slug by its id, and a signed-out reader as anonymous', async () => {
    mockUseAuth.mockReturnValue({ user: null, loading: false });
    await clickCard([card('c2', 'a1')], { a1: user('a1') }, 'Thought c2');

    const page = renderHook(() => useCard('c2'), { wrapper: Swr });
    expect(page.result.current.data?.card.id).toBe('c2');
  });

  it("gives someone else's anonymous card the anonymous byline, never its author", async () => {
    await clickCard([card('c3', 'secret', { anonymous: true })], {}, 'Thought c3');

    const page = renderHook(() => useCard('c3'), { wrapper: Swr });
    expect(page.result.current.data?.author).toMatchObject({ id: 'secret', handle: '' });
  });

  it("leaves the viewer's own anonymous card to the page (the list never read its author)", async () => {
    await clickCard([card('c4', 'me', { anonymous: true })], {}, 'Thought c4');

    const page = renderHook(() => useCard('c4'), { wrapper: Swr });
    expect(page.result.current.data).toBeUndefined();
    expect(page.result.current.isLoading).toBe(true);
  });

  it('never seeds the page with a summary from the API (its story is only an excerpt)', async () => {
    await clickCard(
      [card('c6', 'a1', { slug: 'a-short-walk', story: 'The first lines…', summary: { readMinutes: 6 } })],
      { a1: user('a1') },
      'Thought c6',
    );

    const page = renderHook(() => useCard('a-short-walk'), { wrapper: Swr });
    expect(page.result.current.data).toBeUndefined();
    expect(page.result.current.isLoading).toBe(true);
  });

  it('never overwrites a card page already in the cache', async () => {
    cache.set('card:c5:me', {
      data: { card: card('c5', 'a1', { story: 'Edited since' }), author: user('a1') },
    } as never);
    await clickCard([card('c5', 'a1')], { a1: user('a1') }, 'Thought c5');

    const page = renderHook(() => useCard('c5'), { wrapper: Swr });
    expect(page.result.current.data?.card.story).toBe('Edited since');
  });
});
