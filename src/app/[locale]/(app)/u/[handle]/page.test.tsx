// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ReactNode } from 'react';
import { SWRConfig } from 'swr';
import { renderWithIntl, screen, waitFor } from '@/../test/render';
import type { Card, CardLink, User } from '@/lib/db/types';

// The public profile page on its real data hooks; the client read layer, the
// viewer's blocks and auth are the module boundary.
const mockUseAuth = vi.fn();
vi.mock('@/components/providers/AuthProvider', () => ({ useAuth: () => mockUseAuth() }));
vi.mock('next/navigation', () => ({ useParams: () => ({ handle: 'bob' }) }));
vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children, className }: { href: string; children: ReactNode; className?: string }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
vi.mock('@/lib/db/firestore/client/reads', () => ({
  getUserByHandle: vi.fn(),
  getPublicCardsByAuthor: vi.fn(),
  getCardById: vi.fn(),
  getUsersByIds: vi.fn(),
  isConnected: vi.fn(),
}));
vi.mock('@/lib/db/firestore/client/blocks', () => ({
  getMyBlockedIds: vi.fn(),
  blockUser: vi.fn(),
  unblockUser: vi.fn(),
}));
vi.mock('@/lib/db/firestore/client/cardLinks', () => ({ listLinksToAuthor: vi.fn() }));

import {
  getCardById,
  getPublicCardsByAuthor,
  getUserByHandle,
  getUsersByIds,
  isConnected,
} from '@/lib/db/firestore/client/reads';
import { getMyBlockedIds } from '@/lib/db/firestore/client/blocks';
import { listLinksToAuthor } from '@/lib/db/firestore/client/cardLinks';
import PublicProfilePage from './page';

function user(id: string, handle = id): User {
  return {
    id,
    handle,
    bio: `${handle} writes here`,
    region: 'TW',
    primaryLocale: 'en',
    autoTranslateTo: [],
    verified: false,
    phoneHash: '',
    avatarSeed: '3',
    initials: handle.slice(0, 2).toUpperCase(),
    accentColor: 'var(--accent)',
    joinedAt: new Date('2025-01-01'),
    handleChangedAt: new Date('2025-01-01'),
  };
}
function card(id: string, authorId: string, title: string): Card {
  return {
    id,
    authorId,
    slug: id,
    thoughtCore: title,
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
}
const link = (sourceCardId: string, sourceAuthorId: string): CardLink => ({
  id: `${sourceCardId}_p1`,
  sourceCardId,
  sourceAuthorId,
  targetCardId: 'p1',
  targetAuthorId: 'bob',
  createdAt: new Date('2026-02-01'),
});

function renderPage() {
  return renderWithIntl(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <PublicProfilePage />
    </SWRConfig>,
  );
}

beforeEach(() => {
  mockUseAuth.mockReturnValue({ user: { id: 'me' }, loading: false });
  vi.mocked(getUserByHandle).mockResolvedValue(user('bob'));
  vi.mocked(getMyBlockedIds).mockResolvedValue(new Set());
  vi.mocked(isConnected).mockResolvedValue(false);
  vi.mocked(getPublicCardsByAuthor).mockResolvedValue([card('p1', 'bob', "Bob's first walk")]);
  vi.mocked(listLinksToAuthor).mockResolvedValue([link('x1', 'carol')]);
  vi.mocked(getCardById).mockImplementation(async (id) => card(id, 'carol', "Carol's reply"));
  vi.mocked(getUsersByIds).mockResolvedValue({ carol: user('carol') });
});
afterEach(() => vi.clearAllMocks());

describe('public profile page', () => {
  it("shows the person, their cards and the cards linking to theirs", async () => {
    renderPage();
    expect(await screen.findByRole('heading', { name: 'bob' })).toBeInTheDocument();
    expect(screen.getAllByText("Bob's first walk").length).toBeGreaterThan(0);
    expect((await screen.findAllByText("Carol's reply")).length).toBeGreaterThan(0);
    expect(screen.getByText('1 public card')).toBeInTheDocument();
  });

  it("doesn't hold the page for the cards linking to theirs", async () => {
    vi.mocked(listLinksToAuthor).mockReturnValue(new Promise(() => {}));
    renderPage();
    expect((await screen.findAllByText("Bob's first walk")).length).toBeGreaterThan(0);
    expect(screen.queryAllByText("Carol's reply")).toHaveLength(0);
  });

  it('shows someone the viewer blocked as blocked: none of their cards, nor what links to them', async () => {
    vi.mocked(getMyBlockedIds).mockResolvedValue(new Set(['bob']));
    renderPage();
    expect(await screen.findByText('You blocked bob')).toBeInTheDocument();
    await waitFor(() => expect(listLinksToAuthor).toHaveBeenCalled());
    expect(screen.queryAllByText("Bob's first walk")).toHaveLength(0);
    expect(screen.queryAllByText("Carol's reply")).toHaveLength(0);
    expect(screen.getByText('No public cards')).toBeInTheDocument();
  });

  it('says so for a pen name nobody has', async () => {
    vi.mocked(getUserByHandle).mockResolvedValue(null);
    renderPage();
    expect(await screen.findByText("This person can't be found")).toBeInTheDocument();
    expect(getPublicCardsByAuthor).not.toHaveBeenCalled();
  });
});
