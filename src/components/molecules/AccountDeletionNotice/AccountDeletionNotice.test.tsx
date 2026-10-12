// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { SWRConfig } from 'swr';
import { renderWithIntl, screen, userEvent, waitFor } from '@/../test/render';

vi.mock('@/components/providers/AuthProvider', () => ({
  useAuth: () => ({ user: { id: 'me' }, loading: false }),
}));
vi.mock('@/lib/account/client', () => ({
  getMyAccountDeletion: vi.fn(),
  cancelMyAccountDeletion: vi.fn().mockResolvedValue(undefined),
}));

import { cancelMyAccountDeletion, getMyAccountDeletion } from '@/lib/account/client';
import { AccountDeletionNotice } from './AccountDeletionNotice';

afterEach(() => vi.clearAllMocks());

const scheduled = { requestedAt: '2026-09-27T00:00:00Z', purgeAfter: '2026-10-04T00:00:00Z' };

function renderNotice() {
  return renderWithIntl(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <AccountDeletionNotice />
    </SWRConfig>,
  );
}

describe('AccountDeletionNotice', () => {
  it('says nothing for an account that is not scheduled for deletion', async () => {
    vi.mocked(getMyAccountDeletion).mockResolvedValue(null);
    renderNotice();
    await waitFor(() => expect(getMyAccountDeletion).toHaveBeenCalled());
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('asks in a modal, with the date, and cancels the deletion on tap', async () => {
    vi.mocked(getMyAccountDeletion).mockResolvedValue(scheduled);
    renderNotice();

    const dialog = await screen.findByRole('dialog', { name: 'Your account is scheduled for deletion' });
    expect(dialog).toHaveTextContent('October 4, 2026');

    await userEvent.click(screen.getByRole('button', { name: 'Cancel deletion' }));
    await waitFor(() => expect(cancelMyAccountDeletion).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('keeping the deletion closes the modal and cancels nothing', async () => {
    vi.mocked(getMyAccountDeletion).mockResolvedValue(scheduled);
    renderNotice();

    await userEvent.click(await screen.findByRole('button', { name: 'Keep it scheduled' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(cancelMyAccountDeletion).not.toHaveBeenCalled();
  });

  it('stays open and says so when the cancel does not go through', async () => {
    vi.mocked(getMyAccountDeletion).mockResolvedValue(scheduled);
    vi.mocked(cancelMyAccountDeletion).mockRejectedValueOnce(new Error('offline'));
    renderNotice();

    await userEvent.click(await screen.findByRole('button', { name: 'Cancel deletion' }));
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't cancel — try again");
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
