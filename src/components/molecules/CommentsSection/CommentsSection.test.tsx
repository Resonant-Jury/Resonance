// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderWithIntl, screen, waitFor } from '@/../test/render';
import userEventLib from '@testing-library/user-event';
import type { Comment, User } from '@/lib/db/types';

const mockUseAuth = vi.fn();
const mockUseComments = vi.fn();
const mockUseMyProfile = vi.fn();
const mutate = vi.fn();

vi.mock('@/components/providers/AuthProvider', () => ({
  useAuth: () => mockUseAuth(),
}));
vi.mock('@/lib/data/hooks', () => ({
  useComments: () => mockUseComments(),
  useMyProfile: () => mockUseMyProfile(),
}));
vi.mock('@/lib/db/firestore/client/comments', () => ({
  addComment: vi.fn(),
}));
vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

import { addComment } from '@/lib/db/firestore/client/comments';
import { CommentsSection } from './CommentsSection';

function user(id: string, handle: string): User {
  return {
    id,
    handle,
    region: 'TW',
    primaryLocale: 'en',
    autoTranslateTo: [],
    verified: false,
    phoneHash: '',
    avatarSeed: '1',
    initials: handle.slice(0, 2).toUpperCase(),
    accentColor: 'var(--accent)',
    joinedAt: new Date('2025-01-01'),
    handleChangedAt: new Date('2025-01-01'),
  };
}
function comment(id: string, authorId: string, body: string): Comment {
  return { id, cardId: 'c1', authorId, parentId: null, body, createdAt: new Date('2026-01-01') };
}

const u = () => userEventLib.setup({ pointerEventsCheck: 0 });

beforeEach(() => {
  mockUseMyProfile.mockReturnValue({ data: user('me', 'me') });
  mutate.mockResolvedValue(undefined);
});
afterEach(() => vi.clearAllMocks());

describe('CommentsSection', () => {
  it('shows a sign-in prompt and no composer when signed out', () => {
    mockUseAuth.mockReturnValue({ user: null, loading: false });
    mockUseComments.mockReturnValue({ data: { comments: [], authors: {} }, mutate });
    renderWithIntl(<CommentsSection cardId="c1" authorId="a1" />);

    expect(screen.getByText('Sign in to comment')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Share your thoughts…')).not.toBeInTheDocument();
  });

  it('renders existing comments with their authors', () => {
    mockUseAuth.mockReturnValue({ user: { id: 'me' }, loading: false });
    mockUseComments.mockReturnValue({
      data: { comments: [comment('x', 'a2', 'Beautifully put.')], authors: { a2: user('a2', 'reader') } },
      mutate,
    });
    renderWithIntl(<CommentsSection cardId="c1" authorId="a1" />);

    expect(screen.getByText('Beautifully put.')).toBeInTheDocument();
    expect(screen.getByText('@reader')).toBeInTheDocument();
  });

  it('posts a comment optimistically and persists it via addComment', async () => {
    mockUseAuth.mockReturnValue({ user: { id: 'me' }, loading: false });
    mockUseComments.mockReturnValue({ data: { comments: [], authors: {} }, mutate });
    vi.mocked(addComment).mockResolvedValue('new-id');
    renderWithIntl(<CommentsSection cardId="c1" authorId="a1" />);

    await u().type(screen.getByPlaceholderText('Share your thoughts…'), 'My first thought');
    await u().click(screen.getByRole('button', { name: 'Post comment' }));

    // Optimistic write to the SWR cache happens immediately…
    expect(mutate).toHaveBeenCalled();
    // …and the persisted call carries the card author for the notification.
    await waitFor(() =>
      expect(addComment).toHaveBeenCalledWith('c1', 'My first thought', {
        authorId: 'a1',
        fromHandle: 'me',
      }),
    );
  });
});
