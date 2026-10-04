// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { SWRConfig } from 'swr';
import { renderWithIntl, screen, userEvent } from '@/../test/render';
import type { Card, User } from '@/lib/db/types';

// The card box on the real data hooks; the client read layer, auth and
// navigation are the boundary.
vi.mock('@/components/providers/AuthProvider', () => ({ useAuth: () => ({ user: { id: 'me' }, loading: false }) }));
vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
vi.mock('next/dynamic', () => ({ default: () => () => null }));
vi.mock('@/lib/db/firestore/client/reads', () => ({
  getCardById: vi.fn(),
  getCardsByAuthor: vi.fn(),
  getCurrentUserProfile: vi.fn(),
  getUsersByIds: vi.fn(),
}));
// Others' cards (resonated, linked, bookmarks) come from the server.
vi.mock('@/lib/db/firestore/client/api', () => ({ callApi: vi.fn(async () => ({ cards: [] })) }));

import { getCardsByAuthor, getCurrentUserProfile, getUsersByIds } from '@/lib/db/firestore/client/reads';
import { callApi } from '@/lib/db/firestore/client/api';
import MyCardBoxPage from './page';

function card(id: string, extra: Partial<Card> = {}): Card {
  return {
    id,
    authorId: 'me',
    thoughtCore: `Card ${id}`,
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
const me: User = {
  id: 'me',
  handle: 'me',
  region: 'TW',
  primaryLocale: 'en',
  autoTranslateTo: [],
  verified: false,
  phoneHash: '',
  avatarSeed: '1',
  initials: 'ME',
  accentColor: 'var(--accent)',
  joinedAt: new Date('2025-01-01'),
  handleChangedAt: new Date('2025-01-01'),
};

function renderPage() {
  return renderWithIntl(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <MyCardBoxPage />
    </SWRConfig>,
  );
}

beforeEach(() => {
  vi.mocked(getCurrentUserProfile).mockResolvedValue(me);
  vi.mocked(getUsersByIds).mockResolvedValue({ me });
  vi.mocked(getCardsByAuthor).mockImplementation(async (_uid, tab) =>
    tab === 'draft' ? [card('d1', { publishedAt: null })] : [card(`${tab}-1`)],
  );
});
afterEach(() => {
  vi.clearAllMocks();
  window.sessionStorage.clear();
});

describe('the card box', () => {
  it('reads the shelf the viewer left on, and no other until it is opened', async () => {
    window.sessionStorage.setItem('me:cardbox-tab', 'draft');
    renderPage();

    expect((await screen.findAllByText('Card d1')).length).toBeGreaterThan(0);
    expect(vi.mocked(getCardsByAuthor).mock.calls.map((c) => c[1])).toEqual(['draft']);
    expect(callApi).not.toHaveBeenCalled();
  });

  it('reads the next shelf when its tab is opened', async () => {
    renderPage();
    expect((await screen.findAllByText('Card published-1')).length).toBeGreaterThan(0);
    expect(vi.mocked(getCardsByAuthor).mock.calls.map((c) => c[1])).toEqual(['published']);

    await userEvent.setup().click(screen.getByRole('tab', { name: 'Private' }));
    expect((await screen.findAllByText('Card private-1')).length).toBeGreaterThan(0);
    expect(vi.mocked(getCardsByAuthor).mock.calls.map((c) => c[1])).toEqual(['published', 'private']);
  });

  // The pen beside the identity row is a bare glyph on the page's paper (no chip, no pen line), as in the apps.
  it('leads to the profile settings from a bare pen', async () => {
    const { container } = renderPage();
    const pen = await screen.findByRole('link', { name: 'Edit profile' });
    expect(pen).toHaveAttribute('href', '/settings');
    expect(pen).not.toHaveAttribute('data-variant');
    expect(pen.querySelector('[data-variant]')).toBeNull();
    expect(container.querySelector('button[data-variant="ghost"]')).toBeNull();
  });
});
