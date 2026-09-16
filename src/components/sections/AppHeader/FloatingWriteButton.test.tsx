// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SWRConfig } from 'swr';
import { renderWithIntl, screen, waitFor } from '@/../test/render';
import type { Card, User } from '@/lib/db/types';

let pathname = '/home';
vi.mock('@/i18n/navigation', async () => {
  const actual = await vi.importActual<typeof import('@/i18n/navigation')>('@/i18n/navigation');
  return { ...actual, usePathname: () => pathname };
});

let viewerId = 'me';
vi.mock('@/components/providers/AuthProvider', () => ({
  useAuth: () => ({ user: { id: viewerId }, loading: false }),
}));

vi.mock('@/lib/db/firestore/client/reads', () => ({
  getCardBySlugOrId: vi.fn(),
  getUserById: vi.fn(),
}));

import { getCardBySlugOrId, getUserById } from '@/lib/db/firestore/client/reads';
import { FloatingWriteButton } from './FloatingWriteButton';

const card: Card = {
  id: 'card-1',
  slug: 'a-quiet-morning',
  authorId: 'me',
  thoughtCore: 'Core',
  story: 'story',
  tags: [],
  originalLocale: 'en',
  translations: {},
  visibility: 'public',
  publishedAt: new Date('2026-01-01'),
  readCount: 0,
  resonanceCount: 0,
  inviteCount: 0,
};

function render() {
  return renderWithIntl(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <FloatingWriteButton />
    </SWRConfig>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  viewerId = 'me';
  vi.mocked(getCardBySlugOrId).mockResolvedValue(card);
  vi.mocked(getUserById).mockResolvedValue({ id: 'me', handle: 'me' } as User);
});

describe('FloatingWriteButton', () => {
  it('starts a new card from the feed', async () => {
    pathname = '/home';
    render();
    expect(screen.getByRole('link', { name: 'Write' })).toHaveAttribute('href', '/en/write');
    expect(getCardBySlugOrId).not.toHaveBeenCalled();
  });

  it('edits the card you are reading when it is yours', async () => {
    pathname = '/card/a-quiet-morning';
    render();
    await waitFor(() =>
      expect(screen.getByRole('link', { name: 'Edit this card' })).toHaveAttribute(
        'href',
        '/en/write/card-1'
      )
    );
  });

  it("starts a new card on someone else's card", async () => {
    pathname = '/card/a-quiet-morning';
    viewerId = 'someone-else';
    render();
    await waitFor(() => expect(getCardBySlugOrId).toHaveBeenCalled());
    expect(screen.getByRole('link', { name: 'Write' })).toHaveAttribute('href', '/en/write');
  });

  it('stays off utility pages', () => {
    pathname = '/settings';
    render();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});
