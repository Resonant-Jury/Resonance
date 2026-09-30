// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderWithIntl, screen, userEvent, waitFor } from '@/../test/render';
import type { User } from '@/lib/db/types';

// The notice writes through the blocks module and revalidates SWR; that module
// boundary is what's mocked.
vi.mock('@/lib/db/firestore/client/blocks', () => ({
  unblockUser: vi.fn().mockResolvedValue(undefined),
}));
// The menu half of this file drags in the report / block flows; not under test.
vi.mock('@/components/molecules/SafetyActions/useSafetyActions', () => ({
  useSafetyActions: () => ({ items: [], choose: vi.fn(), modals: null }),
}));

import { unblockUser } from '@/lib/db/firestore/client/blocks';
import { BlockedNotice } from './ProfileSafety';

const blocked = { id: 'u2', handle: 'sam' } as unknown as User;

afterEach(() => vi.clearAllMocks());

describe('BlockedNotice', () => {
  // A secondary accent action inside the notice's frame: terracotta text with
  // no pen line of its own.
  it('offers Unblock as accent text, and unblocks', async () => {
    renderWithIntl(<BlockedNotice user={blocked} />);

    expect(screen.getByText('You blocked sam')).toBeInTheDocument();
    const unblock = screen.getByRole('button', { name: 'Unblock' });
    expect(unblock).toHaveAttribute('data-variant', 'textAccent');

    await userEvent.click(unblock);
    await waitFor(() => expect(unblockUser).toHaveBeenCalledWith('u2'));
  });
});
