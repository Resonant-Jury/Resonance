// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useHint, HINT_LIMIT, readLocalHintCount, writeLocalHintCount } from './hints';

vi.mock('@/lib/db/firestore/client/hints', () => ({
  syncHintCount: vi.fn().mockResolvedValue(undefined),
}));
const mockUseMyProfile = vi.fn();
vi.mock('@/lib/data/hooks', () => ({
  useMyProfile: () => mockUseMyProfile(),
}));

import { syncHintCount } from '@/lib/db/firestore/client/hints';

beforeEach(() => {
  window.localStorage.clear();
  mockUseMyProfile.mockReturnValue({ data: undefined });
});
afterEach(() => vi.clearAllMocks());

describe('useHint', () => {
  it('shows the hint and counts the display while under the limit', async () => {
    const { result } = renderHook(() => useHint('note-privacy'));
    await waitFor(() => expect(result.current.visible).toBe(true));
    expect(readLocalHintCount('note-privacy')).toBe(1);
    expect(syncHintCount).toHaveBeenCalledWith('note-privacy', 1);
  });

  it('collapses permanently once the display limit is reached', async () => {
    writeLocalHintCount('note-privacy', HINT_LIMIT);
    const { result } = renderHook(() => useHint('note-privacy'));
    // Stays hidden; the count is not bumped further.
    await new Promise((r) => setTimeout(r, 0));
    expect(result.current.visible).toBe(false);
    expect(readLocalHintCount('note-privacy')).toBe(HINT_LIMIT);
    expect(syncHintCount).not.toHaveBeenCalled();
  });

  it('honors the cross-device count from the user profile', async () => {
    mockUseMyProfile.mockReturnValue({
      data: { hintsSeen: { 'note-privacy': HINT_LIMIT } },
    });
    const { result } = renderHook(() => useHint('note-privacy'));
    await new Promise((r) => setTimeout(r, 0));
    expect(result.current.visible).toBe(false);
  });

  it('dismiss() hides the hint and pins the count at the limit locally and remotely', async () => {
    const { result } = renderHook(() => useHint('feed-reason'));
    await waitFor(() => expect(result.current.visible).toBe(true));

    act(() => result.current.dismiss());

    expect(result.current.visible).toBe(false);
    expect(readLocalHintCount('feed-reason')).toBe(HINT_LIMIT);
    expect(syncHintCount).toHaveBeenLastCalledWith('feed-reason', HINT_LIMIT);
  });
});
