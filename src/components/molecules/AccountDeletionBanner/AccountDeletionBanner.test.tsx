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
import { AccountDeletionBanner } from './AccountDeletionBanner';

afterEach(() => vi.clearAllMocks());

function renderBanner() {
  return renderWithIntl(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <AccountDeletionBanner />
    </SWRConfig>,
  );
}

describe('AccountDeletionBanner', () => {
  it('says nothing for an account that is not scheduled for deletion', async () => {
    vi.mocked(getMyAccountDeletion).mockResolvedValue(null);
    renderBanner();
    await waitFor(() => expect(getMyAccountDeletion).toHaveBeenCalled());
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  // The banner already draws its own danger-red pen line, so the undo inside
  // it is terracotta text — a second frame would double the outline.
  it('offers the undo as a frameless accent action and cancels deletion on tap', async () => {
    vi.mocked(getMyAccountDeletion).mockResolvedValue({
      requestedAt: '2026-09-27T00:00:00Z',
      purgeAfter: '2026-10-04T00:00:00Z',
    });
    renderBanner();

    const undo = await screen.findByRole('button', { name: 'Cancel deletion' });
    expect(undo).toHaveAttribute('data-variant', 'textAccent');

    await userEvent.click(undo);
    await waitFor(() => expect(cancelMyAccountDeletion).toHaveBeenCalledTimes(1));
  });
});
