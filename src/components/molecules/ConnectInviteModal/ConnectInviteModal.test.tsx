// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderWithIntl, screen, waitFor } from '@/../test/render';
import userEventLib from '@testing-library/user-event';
import { ConnectInviteModal } from './ConnectInviteModal';

vi.mock('@/lib/db/firestore/client/invites', () => ({
  sendInvite: vi.fn(),
}));
vi.mock('@/lib/db/firestore/client/profile', () => ({
  getCurrentUserHandle: vi.fn(),
}));

import { sendInvite } from '@/lib/db/firestore/client/invites';
import { getCurrentUserHandle } from '@/lib/db/firestore/client/profile';

const target = { id: 'u2', handle: '@other', initials: 'O', accentColor: 'var(--accent)' };

// The Send button is wrapped in a `pointer-events: none` div while invalid;
// disabling user-event's pointer-events guard lets us assert the component's
// own validity gate (submit() early-returns) rather than the DOM guard.
const user = () => userEventLib.setup({ pointerEventsCheck: 0 });

beforeEach(() => {
  vi.mocked(getCurrentUserHandle).mockResolvedValue('me-handle');
  vi.mocked(sendInvite).mockResolvedValue('invite-1');
});
afterEach(() => vi.clearAllMocks());

describe('ConnectInviteModal', () => {
  it('shows the invite form with remaining-quota copy when open', async () => {
    renderWithIntl(
      <ConnectInviteModal open onClose={() => {}} target={target} dailyRemaining={2} />
    );
    expect(screen.getByRole('heading', { name: 'Invite to connect' })).toBeInTheDocument();
    expect(screen.getByText('2 invites left today')).toBeInTheDocument();
    // Let the async handle load settle so the state update is wrapped in act().
    await waitFor(() => expect(getCurrentUserHandle).toHaveBeenCalled());
  });

  it('shows the quota-full message and blocks sending when no invites remain', async () => {
    renderWithIntl(
      <ConnectInviteModal open onClose={() => {}} target={target} dailyRemaining={0} />
    );
    expect(screen.getByText('Daily invite quota used up. Try tomorrow.')).toBeInTheDocument();

    await user().type(
      screen.getByPlaceholderText('Let them know why you want to connect…'),
      'A long enough message'
    );
    await user().click(screen.getByRole('button', { name: 'Send invite' }));
    expect(sendInvite).not.toHaveBeenCalled();
  });

  it('does not send when the message is shorter than the 14-char minimum', async () => {
    renderWithIntl(
      <ConnectInviteModal open onClose={() => {}} target={target} dailyRemaining={3} />
    );
    await user().type(
      screen.getByPlaceholderText('Let them know why you want to connect…'),
      'too short'
    );
    await user().click(screen.getByRole('button', { name: 'Send invite' }));
    expect(sendInvite).not.toHaveBeenCalled();
  });

  it('sends a valid invite and switches to the confirmation view', async () => {
    const onSent = vi.fn();
    renderWithIntl(
      <ConnectInviteModal
        open
        onClose={() => {}}
        target={target}
        referenceCardId="card-123456789"
        dailyRemaining={3}
        onSent={onSent}
      />
    );

    // Wait for the sender's handle to load (used in the invite payload).
    await waitFor(() => expect(getCurrentUserHandle).toHaveBeenCalled());

    const u = user();
    await u.type(
      screen.getByPlaceholderText('Let them know why you want to connect…'),
      'I really resonated with your story'
    );
    await u.click(screen.getByRole('button', { name: 'Send invite' }));

    await waitFor(() =>
      expect(sendInvite).toHaveBeenCalledWith({
        toUserId: 'u2',
        message: 'I really resonated with your story',
        referenceCardId: 'card-123456789',
        fromHandle: 'me-handle',
      })
    );
    expect(onSent).toHaveBeenCalled();
    // Confirmation view replaces the form.
    expect(await screen.findByText('Waiting for their response')).toBeInTheDocument();
  });
});
