// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { SWRConfig } from 'swr';
import { renderWithIntl, screen, userEvent, waitFor } from '@/../test/render';

vi.mock('@/components/providers/AuthProvider', () => ({
  useAuth: () => ({ user: { id: 'me' }, loading: false }),
}));
vi.mock('@/lib/db/firestore/client/blocks', () => ({
  listMyBlocks: vi.fn(),
  unblockUser: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/db/firestore/client/reads', () => ({ getUsersByIds: vi.fn() }));

import { listMyBlocks, unblockUser } from '@/lib/db/firestore/client/blocks';
import { getUsersByIds } from '@/lib/db/firestore/client/reads';
import { BlockedListModal } from './BlockedListModal';

afterEach(() => vi.clearAllMocks());

function renderModal(onClose = vi.fn()) {
  vi.mocked(listMyBlocks).mockResolvedValue([{ uid: 'alice', createdAt: new Date('2026-09-01') }]);
  vi.mocked(getUsersByIds).mockResolvedValue({
    alice: { id: 'alice', handle: 'alice', initials: 'AL', accentColor: 'oklch(88% 0.08 55)' },
  } as never);
  renderWithIntl(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <BlockedListModal open onClose={onClose} />
    </SWRConfig>,
  );
  return onClose;
}

describe('BlockedListModal', () => {
  it('unblocks from a terracotta text action per row', async () => {
    renderModal();

    const unblock = await screen.findByRole('button', { name: 'Unblock' });
    expect(unblock).toHaveAttribute('data-variant', 'textAccent');

    await userEvent.click(unblock);
    await waitFor(() => expect(unblockUser).toHaveBeenCalledWith('alice'));
  });

  // Close sits beside the modal's own ✕: plain text, not a second frame.
  it('closes through a plain-text button beside the ✕', async () => {
    const onClose = renderModal();
    await screen.findByRole('button', { name: 'Unblock' });

    const close = screen.getAllByRole('button', { name: 'Close' }).find((b) => b.hasAttribute('data-variant'));
    expect(close).toHaveAttribute('data-variant', 'text');
    await userEvent.click(close!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
