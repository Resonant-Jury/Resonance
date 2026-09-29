// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithIntl, screen, userEvent, waitFor } from '@/../test/render';

// The legacy invites inbox on /me: it asks for the invites only once Firebase
// Auth has restored the viewer (at mount on a fresh load it hasn't, and the
// query would find nobody's), and Decline declines — not the sender's withdraw.
const auth = { user: null as { id: string } | null, loading: true };
vi.mock('@/components/providers/AuthProvider', () => ({ useAuth: () => auth }));

const listIncomingPendingInvites = vi.fn();
const acceptInvite = vi.fn(async (_id: string) => 'alice_bob');
const declineInvite = vi.fn(async (_id: string) => {});
vi.mock('@/lib/db/firestore/client/invites', () => ({
  listIncomingPendingInvites: () => listIncomingPendingInvites(),
  acceptInvite: (id: string) => acceptInvite(id),
  declineInvite: (id: string) => declineInvite(id),
}));

import { InvitesInbox } from './InvitesInbox';

const invite = (id: string, message: string) => ({
  id, fromUserId: 'bob', toUserId: 'alice', message, status: 'pending',
  expiresAt: new Date('2026-10-07T00:00:00Z'), createdAt: new Date('2026-09-29T10:00:00Z'),
});

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(auth, { user: null, loading: true });
  listIncomingPendingInvites.mockResolvedValue([invite('i1', 'Loved your walk card'), invite('i2', 'Hello again')]);
});

describe('InvitesInbox', () => {
  it('waits for the viewer before asking for their invites', async () => {
    const view = renderWithIntl(<InvitesInbox />);
    expect(listIncomingPendingInvites).not.toHaveBeenCalled();

    Object.assign(auth, { user: { id: 'alice' }, loading: false });
    view.rerender(<InvitesInbox />);
    expect(await screen.findByText('Loved your walk card')).toBeInTheDocument();
    expect(listIncomingPendingInvites).toHaveBeenCalledTimes(1);
  });

  it('declines with the recipient’s own answer and drops the row', async () => {
    Object.assign(auth, { user: { id: 'alice' }, loading: false });
    renderWithIntl(<InvitesInbox />);
    await screen.findByText('Loved your walk card');

    await userEvent.click(screen.getAllByRole('button', { name: 'Decline' })[0]);
    await waitFor(() => expect(screen.queryByText('Loved your walk card')).not.toBeInTheDocument());
    expect(declineInvite).toHaveBeenCalledWith('i1');
    expect(acceptInvite).not.toHaveBeenCalled();
    expect(screen.getByText('Hello again')).toBeInTheDocument();
  });
});
