// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderWithIntl, screen, waitFor, userEvent } from '@/../test/render';
import type { User } from '@/lib/db/types';
import { NotificationConnectAction } from './NotificationConnectAction';

vi.mock('@/lib/db/firestore/client/reads', () => ({
  getUserById: vi.fn(),
  isConnected: vi.fn(),
}));
vi.mock('@/lib/db/firestore/client/invites', () => ({
  remainingDailyQuota: vi.fn(),
  sendInvite: vi.fn(),
}));
vi.mock('@/lib/db/firestore/client/profile', () => ({
  getCurrentUserHandle: vi.fn(),
}));

const mockUseAuth = vi.fn();
vi.mock('@/components/providers/AuthProvider', () => ({
  useAuth: () => mockUseAuth(),
}));

import { getUserById, isConnected } from '@/lib/db/firestore/client/reads';
import { remainingDailyQuota } from '@/lib/db/firestore/client/invites';
import { getCurrentUserHandle } from '@/lib/db/firestore/client/profile';

function user(id: string, handle: string): User {
  return {
    id,
    handle,
    region: 'TW',
    primaryLocale: 'en',
    autoTranslateTo: [],
    verified: false,
    phoneHash: '',
    avatarSeed: '7',
    initials: handle.slice(0, 2).toUpperCase(),
    accentColor: 'oklch(88% 0.08 55)',
    joinedAt: new Date('2026-01-01'),
    handleChangedAt: new Date('2026-01-01'),
  };
}

beforeEach(() => {
  mockUseAuth.mockReturnValue({ user: user('viewer', 'me'), loading: false });
  vi.mocked(isConnected).mockResolvedValue(false);
  vi.mocked(getUserById).mockResolvedValue(user('actor', 'other'));
  vi.mocked(remainingDailyQuota).mockResolvedValue(3);
  vi.mocked(getCurrentUserHandle).mockResolvedValue('me');
});
afterEach(() => vi.clearAllMocks());

describe('NotificationConnectAction', () => {
  it('offers a connect button for a stranger and opens the invite modal targeting them', async () => {
    renderWithIntl(
      <NotificationConnectAction fromUserId="actor" referenceCardId="card-1" />
    );

    const btn = await screen.findByRole('button', { name: 'Connect with them' });
    await userEvent.setup().click(btn);

    // The existing ConnectInviteModal opens against the notification's actor.
    expect(await screen.findByRole('heading', { name: 'Invite to connect' })).toBeInTheDocument();
    expect(screen.getByText('other')).toBeInTheDocument();
    expect(getUserById).toHaveBeenCalledWith('actor');
  });

  it('shows a quiet connected mark instead of a button when the pair is already connected', async () => {
    vi.mocked(isConnected).mockResolvedValue(true);
    renderWithIntl(<NotificationConnectAction fromUserId="actor" />);

    expect(await screen.findByText(/Connected/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Connect with them' })).not.toBeInTheDocument();
  });

  it('renders nothing when the notification actor is the viewer themself', async () => {
    renderWithIntl(<NotificationConnectAction fromUserId="viewer" />);
    // No connection lookup should even fire for a self-interaction.
    await waitFor(() => expect(isConnected).not.toHaveBeenCalled());
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
